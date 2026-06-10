-- Capture the record_transaction RPC that was deployed directly on the DB
-- but never captured as a migration file.
-- This function provides atomic payment recording with row-level locking.

CREATE OR REPLACE FUNCTION public.record_transaction(
  p_display_id TEXT,
  p_store_id UUID,
  p_customer_id UUID,
  p_recorded_by UUID,
  p_logged_by UUID DEFAULT NULL,
  p_cash_amount NUMERIC DEFAULT 0,
  p_upi_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(txn_id UUID, txn_display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn_id            UUID;
  v_old_outstanding   NUMERIC;
  v_total_amount      NUMERIC;
  v_new_outstanding   NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_total_amount := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT s.outstanding
  INTO   v_old_outstanding
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  v_new_outstanding := GREATEST(v_old_outstanding - v_total_amount, 0);

  INSERT INTO public.transactions (
    display_id, store_id, customer_id, recorded_by, logged_by,
    cash_amount, upi_amount, total_amount,
    old_outstanding, new_outstanding, notes, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), v_total_amount,
    v_old_outstanding, v_new_outstanding, p_notes,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_txn_id;

  UPDATE public.stores SET outstanding = v_new_outstanding WHERE id = p_store_id;

  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_txn_id, p_display_id, v_new_outstanding;
END;
$$;

REVOKE ALL ON FUNCTION public.record_transaction(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_transaction(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ) TO authenticated;
