-- Atomic production log processing RPC
-- Deducts raw materials (from BOM), adds finished goods to stock, logs movement

CREATE OR REPLACE FUNCTION public.process_production_log(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced NUMERIC,
  p_wastage_quantity NUMERIC DEFAULT 0,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bom RECORD;
  v_total_raw_qty NUMERIC;
  v_materials_consumed INTEGER := 0;
  v_log_id UUID;
  v_rows_affected INTEGER;
  v_success BOOLEAN;
BEGIN
  -- Validate inputs
  IF p_quantity_produced <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Quantity produced must be positive'
    );
  END IF;

  -- Step 1: Insert production log
  INSERT INTO public.production_log (
    warehouse_id, product_id, quantity_produced, wastage_quantity,
    production_date, notes, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, p_quantity_produced, p_wastage_quantity,
    p_production_date, p_notes, p_created_by
  )
  RETURNING id INTO v_log_id;

  -- Step 2: Process BOM entries (deduct raw materials)
  -- Handles lines with a specific raw_material_id; skips category-level lines
  FOR v_bom IN
    SELECT b.*
    FROM public.bill_of_materials b
    WHERE b.finished_product_id = p_product_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND b.raw_material_id IS NOT NULL
      AND (b.warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
  LOOP
    v_total_raw_qty := v_bom.quantity * p_quantity_produced;

    SELECT success INTO v_success
    FROM public.adjust_raw_material_stock(
      p_raw_material_id := v_bom.raw_material_id,
      p_warehouse_id := p_warehouse_id,
      p_adjustment_type := 'used',
      p_quantity := v_total_raw_qty,
      p_reason := 'Production log ' || v_log_id::text,
      p_performed_by := p_created_by
    );

    IF v_success THEN
      v_materials_consumed := v_materials_consumed + 1;
    END IF;
  END LOOP;

  -- Step 3: Add finished goods to warehouse stock
  UPDATE public.product_stock
  SET quantity = quantity + p_quantity_produced,
      updated_at = now()
  WHERE warehouse_id = p_warehouse_id
    AND product_id = p_product_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, p_quantity_produced, now());
  END IF;

  -- Step 4: Log stock movement
  INSERT INTO public.stock_movements (
    product_id, warehouse_id, quantity, type,
    reference_id, reason, created_by, created_at
  ) VALUES (
    p_product_id, p_warehouse_id, p_quantity_produced, 'production',
    v_log_id::text, 'Production batch', p_created_by, now()
  );

  -- Return success
  RETURN json_build_object(
    'success', true,
    'production_log_id', v_log_id,
    'materials_consumed', v_materials_consumed
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
