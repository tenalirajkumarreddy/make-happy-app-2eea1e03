-- Migration: Fix record_transaction to always recalc running balances
-- Date: 2026-06-15
-- Priority: P0 - CRITICAL (Data Integrity)
--
-- Issue: record_transaction only called recalc_running_balances when p_created_at IS NOT NULL
-- (i.e., backdated entries). Normal real-time transactions skipped it, leaving running balances stale.
-- Fix: Always call recalc_running_balances after insert.

DROP FUNCTION IF EXISTS public.record_transaction(
    TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ
);

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
SET search_path = public
AS $$
DECLARE
    v_txn_id UUID;
    v_old_outstanding NUMERIC;
    v_total_amount NUMERIC;
    v_new_outstanding NUMERIC;
    v_warehouse_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ROLE CHECK: super_admin, manager, agent, marketer, operator can record transactions
    PERFORM public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'marketer', 'operator']);

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

    -- Resolve warehouse from the recorder's role, with fallback to default warehouse
    SELECT COALESCE(
        (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
        (SELECT id FROM public.warehouses LIMIT 1)
    ) INTO v_warehouse_id;

    v_new_outstanding := GREATEST(v_old_outstanding - v_total_amount, 0);

    INSERT INTO public.transactions (
        display_id, store_id, customer_id, recorded_by, logged_by,
        cash_amount, upi_amount, total_amount,
        old_outstanding, new_outstanding, notes, created_at,
        warehouse_id, created_by
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), v_total_amount,
        v_old_outstanding, v_new_outstanding, p_notes,
        COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by
    )
    RETURNING id INTO v_txn_id;

    UPDATE public.stores SET outstanding = v_new_outstanding WHERE id = p_store_id;

    -- ✅ FIXED: Always recalc running balances (was only for backdated entries)
    PERFORM public.recalc_running_balances(p_store_id);

    RETURN QUERY SELECT v_txn_id, p_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_transaction(
    TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ
) TO authenticated;