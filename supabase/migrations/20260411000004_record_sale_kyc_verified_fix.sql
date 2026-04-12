-- ==========================================================================
-- Fix record_sale credit-limit KYC status check
--
-- Business requirements + UI use KYC status = 'verified'.
-- Older code paths used 'approved'.
-- This migration treats both 'verified' and legacy 'approved' as KYC.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id         TEXT,
  p_store_id           UUID,
  p_customer_id        UUID,
  p_recorded_by        UUID,
  p_logged_by          UUID,
  p_total_amount       NUMERIC,
  p_cash_amount        NUMERIC,
  p_upi_amount         NUMERIC,
  p_outstanding_amount NUMERIC,  -- kept for API compat, ignored in calculation
  p_sale_items         JSONB,
  p_created_at         TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id             UUID;
  v_old_outstanding     NUMERIC;
  v_new_outstanding     NUMERIC;
  v_computed_outstanding NUMERIC;
  v_credit_limit        NUMERIC := 0;
  v_store_type_id       UUID;
  v_store_customer_id   UUID;
  v_kyc_status          TEXT;
  v_credit_limit_override NUMERIC;
  v_caller_is_admin     BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT s.outstanding, s.store_type_id, s.customer_id
  INTO   v_old_outstanding, v_store_type_id, v_store_customer_id
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  -- Compute outstanding delta server-side instead of trusting p_outstanding_amount
  v_computed_outstanding := p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0);
  v_new_outstanding := v_old_outstanding + v_computed_outstanding;

  SELECT c.kyc_status, c.credit_limit_override
  INTO   v_kyc_status, v_credit_limit_override
  FROM   public.customers c
  WHERE  c.id = v_store_customer_id;

  IF v_credit_limit_override IS NOT NULL THEN
    v_credit_limit := v_credit_limit_override;
  ELSE
    SELECT CASE
             WHEN v_kyc_status IN ('verified', 'approved')
             THEN COALESCE(credit_limit_kyc, 0)
             ELSE COALESCE(credit_limit_no_kyc, 0)
           END
    INTO   v_credit_limit
    FROM   public.store_types
    WHERE  id = v_store_type_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'manager')
  ) INTO v_caller_is_admin;

  IF v_credit_limit > 0
     AND v_new_outstanding > v_credit_limit
     AND NOT v_caller_is_admin
  THEN
    RAISE EXCEPTION 'credit_limit_exceeded';
  END IF;

  INSERT INTO public.sales (
    display_id, store_id, customer_id, recorded_by, logged_by,
    total_amount, cash_amount, upi_amount, outstanding_amount,
    old_outstanding, new_outstanding, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
    v_old_outstanding, v_new_outstanding,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    (item->>'total_price')::NUMERIC
  FROM jsonb_array_elements(p_sale_items) AS item;

  UPDATE public.orders
  SET status = 'delivered', delivered_at = now()
  WHERE store_id = p_store_id AND status = 'pending';

  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO authenticated;
