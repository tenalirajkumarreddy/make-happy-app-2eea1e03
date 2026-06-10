-- Atomic store balance adjustment RPC
-- Replaces the non-atomic two-step insert+update in StoreDetail.tsx handleAdjustBalance

CREATE OR REPLACE FUNCTION public.adjust_store_balance(
  p_store_id UUID,
  p_customer_id UUID,
  p_new_outstanding NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_adjusted_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, old_outstanding NUMERIC, new_outstanding NUMERIC, adjustment_amount NUMERIC, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_outstanding NUMERIC;
  v_adjustment_amount NUMERIC;
BEGIN
  -- Get current outstanding
  SELECT COALESCE(outstanding, 0) INTO v_old_outstanding
  FROM public.stores
  WHERE id = p_store_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Store not found'::TEXT;
    RETURN;
  END IF;

  v_adjustment_amount := p_new_outstanding - v_old_outstanding;

  -- Insert adjustment record
  INSERT INTO public.balance_adjustments (
    store_id, customer_id,
    old_outstanding, new_outstanding, adjustment_amount,
    reason, adjusted_by
  )
  VALUES (
    p_store_id, p_customer_id,
    v_old_outstanding, p_new_outstanding, v_adjustment_amount,
    p_reason, p_adjusted_by
  );

  -- Update store outstanding
  UPDATE public.stores
  SET outstanding = p_new_outstanding, updated_at = now()
  WHERE id = p_store_id;

  RETURN QUERY SELECT true, v_old_outstanding, p_new_outstanding, v_adjustment_amount, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, SQLERRM;
END;
$$;
