-- Migration: Update record_transaction() to update profiles.holding_balance immediately
-- Date: 2026-06-26
--
-- ISSUE: When a transaction (collection/payment) is created, the
--        profiles.holding_balance cache was not updated. While the triggers
--        added in 20260626000001 now handle this, the RPC itself should
--        be self-consistent.
--
-- This migration patches record_transaction() to update profiles.holding_balance
-- immediately after the transaction is inserted.
-- =========================================================

DROP FUNCTION IF EXISTS public.record_transaction(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ) CASCADE;

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
  v_caller_id         UUID;
  v_new_holding_balance NUMERIC;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ROLE CHECK: caller must have a valid role (super_admin, manager, agent, marketer, operator)
  PERFORM public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'marketer', 'operator']);

  v_total_amount := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- LOCK store row + fetch current outstanding
  SELECT s.outstanding
  INTO   v_old_outstanding
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  -- Calculate new outstanding (reduce by payment)
  v_new_outstanding := GREATEST(v_old_outstanding - v_total_amount, 0);

  -- Insert the transaction
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

  -- Update store outstanding
  UPDATE public.stores SET outstanding = v_new_outstanding WHERE id = p_store_id;

  -- Recalculate running balances if backdated
  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  -- =========================================================
  -- FIX: Update the agent's cached holding balance directly
  -- =========================================================
  -- A transaction is a collection, so the agent's holding balance increases
  v_new_holding_balance := public.calculate_holding_balance(p_recorded_by);

  UPDATE public.profiles
  SET holding_balance = v_new_holding_balance,
      holding_balance_updated_at = NOW()
  WHERE user_id = p_recorded_by;

  -- Return transaction details
  RETURN QUERY SELECT v_txn_id, p_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_transaction TO authenticated;
