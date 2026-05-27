-- Simple production recording RPC
-- Pure recording only — no stock effects, no BOM processing

CREATE OR REPLACE FUNCTION public.record_production(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced INTEGER,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_wastage_quantity INTEGER DEFAULT 0,
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

  -- Insert production log record
  INSERT INTO public.production_log (
    warehouse_id, product_id, quantity_produced,
    production_date, wastage_quantity, notes, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, p_quantity_produced,
    p_production_date, p_wastage_quantity, p_notes, p_created_by
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT true, v_log_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, SQLERRM;
END;
$$;
