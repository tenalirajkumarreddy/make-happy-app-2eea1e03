-- Migration: Add FOR UPDATE Lock to adjust_store_balance RPC
-- Date: 2026-06-14
-- Priority: P0 - CRITICAL (Race Condition)
--
-- Issue Fixed:
-- adjust_store_balance RPC reads store outstanding without FOR UPDATE lock,
-- then updates it. Between read and write, another transaction could modify
-- outstanding, causing lost updates.
--
-- Fix:
-- Add FOR UPDATE lock to the initial SELECT

DROP FUNCTION IF EXISTS public.adjust_store_balance(UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.adjust_store_balance(
    p_store_id UUID,
    p_adjustment_amount NUMERIC,
    p_reason TEXT,
    p_adjusted_by UUID
)
RETURNS TABLE(new_outstanding NUMERIC, success BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_adjustment_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ✅ FIXED: Add FOR UPDATE lock to prevent race conditions
    SELECT COALESCE(outstanding, 0) INTO v_old_outstanding
    FROM public.stores
    WHERE id = p_store_id
    FOR UPDATE;  -- ✅ This locks the row until transaction completes

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    v_new_outstanding := v_old_outstanding + p_adjustment_amount;

    -- Update store outstanding
    UPDATE public.stores
    SET outstanding = v_new_outstanding,
        updated_at = now()
    WHERE id = p_store_id;

    -- Log the adjustment
    INSERT INTO public.balance_adjustments (
        store_id,
        adjustment_amount,
        previous_outstanding,
        new_outstanding,
        reason,
        adjusted_by
    ) VALUES (
        p_store_id,
        p_adjustment_amount,
        v_old_outstanding,
        v_new_outstanding,
        p_reason,
        p_adjusted_by
    ) RETURNING id INTO v_adjustment_id;

    RETURN QUERY SELECT v_new_outstanding, TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.adjust_store_balance(UUID, NUMERIC, TEXT, UUID) TO authenticated;