-- Atomic production recording RPC that increases finished goods stock
-- Does NOT deduct raw materials (consumption is calculated at end-of-day closing stock)

CREATE OR REPLACE FUNCTION public.record_production_with_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced INTEGER,
  p_wastage_quantity INTEGER DEFAULT 0,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, production_log_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF p_quantity_produced <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  IF p_wastage_quantity < 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Wastage cannot be negative'::TEXT;
    RETURN;
  END IF;

  -- Step 1: Insert production log record
  INSERT INTO public.production_log (
    warehouse_id, product_id, quantity_produced,
    production_date, wastage_quantity, notes, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, p_quantity_produced,
    p_production_date, p_wastage_quantity, p_notes, p_created_by
  )
  RETURNING id INTO v_log_id;

  -- Step 2: Add finished goods to warehouse stock
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

  -- Step 3: Log stock movement
  INSERT INTO public.stock_movements (
    product_id, warehouse_id, quantity, type,
    reference_id, reason, created_by, created_at
  ) VALUES (
    p_product_id, p_warehouse_id, p_quantity_produced, 'production',
    v_log_id::text, 'Production batch', p_created_by, now()
  );

  RETURN QUERY SELECT true, v_log_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, SQLERRM;
END;
$$;
