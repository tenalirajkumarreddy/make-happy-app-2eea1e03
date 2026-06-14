-- Migration: Fix record_payment_return - add recalc_running_balances and fix display_id race condition
-- Date: 2026-06-15
-- Priority: P1 - HIGH (Data Integrity / Race Condition)
--
-- Issues Fixed:
-- 1. record_payment_return didn't call recalc_running_balances, only recalc_store_outstanding (via trigger)
--    This left individual row running balances (old_outstanding, new_outstanding) stale.
-- 2. display_id generation used MAX(CAST(...)) which has race condition under concurrent inserts.
--    Fixed to use generate_random_display_id RPC which has collision checking.
-- 3. Added warehouse_id resolution (same pattern as record_transaction/record_sale)

DROP FUNCTION IF EXISTS public.record_payment_return(
    UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.record_payment_return(
    p_original_transaction_id UUID,
    p_store_id UUID,
    p_customer_id UUID,
    p_recorded_by UUID,
    p_return_amount NUMERIC,
    p_return_type TEXT,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL,
    p_logged_by UUID DEFAULT NULL,
    p_display_id TEXT DEFAULT NULL
)
RETURNS TABLE(return_id UUID, return_display_id TEXT, new_store_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_original_transaction RECORD;
    v_store_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_caller_role TEXT;
    v_display_id TEXT;
    v_total_returned NUMERIC;
    v_is_fully_returned BOOLEAN;
    v_warehouse_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_return_amount <= 0 THEN
        RAISE EXCEPTION 'Return amount must be positive';
    END IF;

    SELECT * INTO v_original_transaction
    FROM public.transactions
    WHERE id = p_original_transaction_id;

    IF v_original_transaction IS NULL THEN
        RAISE EXCEPTION 'Original transaction not found';
    END IF;

    IF v_original_transaction.is_fully_returned THEN
        RAISE EXCEPTION 'Transaction has already been fully returned';
    END IF;

    IF p_return_amount > v_original_transaction.total_amount THEN
        RAISE EXCEPTION 'Return amount cannot exceed original payment amount';
    END IF;

    SELECT COALESCE(SUM(return_amount), 0) INTO v_total_returned
    FROM public.payment_returns
    WHERE original_transaction_id = p_original_transaction_id
      AND status = 'completed';

    IF v_total_returned + p_return_amount > v_original_transaction.total_amount THEN
        RAISE EXCEPTION 'Total returns would exceed original payment amount';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.user_roles
    WHERE user_id = p_recorded_by
    LIMIT 1;

    IF v_caller_role NOT IN ('super_admin', 'manager') THEN
        IF p_recorded_by != v_original_transaction.recorded_by
           OR v_original_transaction.created_at::DATE != CURRENT_DATE THEN
            RAISE EXCEPTION 'Returns are only allowed for same-day transactions by the original recorder, or by an admin/manager';
        END IF;
    END IF;

    -- ✅ FIXED: Use generate_random_display_id RPC with collision checking (was MAX cast with race condition)
    IF p_display_id IS NULL THEN
        v_display_id := public.generate_random_display_id('RET', 'payment_returns');
    ELSE
        v_display_id := p_display_id;
    END IF;

    -- Resolve warehouse (same pattern as record_transaction)
    SELECT COALESCE(
        (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
        (SELECT id FROM public.warehouses LIMIT 1)
    ) INTO v_warehouse_id;

    SELECT outstanding INTO v_store_outstanding
    FROM public.stores
    WHERE id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    v_new_outstanding := v_store_outstanding + p_return_amount;
    v_is_fully_returned := (v_total_returned + p_return_amount) >= v_original_transaction.total_amount;

    INSERT INTO public.payment_returns (
        display_id, original_transaction_id, store_id, customer_id,
        recorded_by, logged_by, return_amount, return_type, reason, notes, status,
        old_outstanding, new_outstanding,
        warehouse_id, created_by
    ) VALUES (
        v_display_id, p_original_transaction_id, p_store_id, p_customer_id,
        p_recorded_by, p_logged_by, p_return_amount, p_return_type, p_reason, p_notes, 'completed',
        v_store_outstanding, v_new_outstanding,
        v_warehouse_id, p_recorded_by
    )
    RETURNING id INTO v_return_id;

    UPDATE public.stores
    SET outstanding = v_new_outstanding,
        updated_at = NOW(),
        updated_by = p_recorded_by
    WHERE id = p_store_id;

    UPDATE public.transactions
    SET is_fully_returned = v_is_fully_returned,
        updated_at = NOW(),
        updated_by = p_recorded_by
    WHERE id = p_original_transaction_id;

    -- ✅ FIXED: Recalc running balances for this store (was missing)
    PERFORM public.recalc_running_balances(p_store_id);

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
        p_recorded_by, 'Recorded payment return', 'payment_return', v_display_id,
        jsonb_build_object(
            'original_transaction_id', p_original_transaction_id,
            'return_amount', p_return_amount, 'store_id', p_store_id, 'reason', p_reason,
            'total_returned', v_total_returned + p_return_amount,
            'is_fully_returned', v_is_fully_returned
        )
    );

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payment_return(
    UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT
) TO authenticated;