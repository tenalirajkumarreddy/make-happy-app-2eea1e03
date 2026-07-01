-- Migration: Fix ambiguous cash_amount column reference in create_handover_with_type
-- Date: 2026-06-28
--
-- ISSUE: The function create_handover_with_type has RETURNS TABLE(..., cash_amount numeric, ...)
-- which creates an output parameter variable named cash_amount. The function body references
-- cash_amount unqualified in SQL queries against tables (handovers) that also have a cash_amount
-- column. Without #variable_conflict use_column, PostgreSQL raises:
--   "column reference "cash_amount" is ambiguous"
--
-- This was originally present in early versions of the function
-- (20260507000001, 20260527000004) but was accidentally dropped during refactoring
-- in 20260610000001 and 20260611000002.

CREATE OR REPLACE FUNCTION public.create_handover_with_type(
  p_user_id uuid,
  p_handed_to uuid,
  p_cash_amount numeric DEFAULT 0,
  p_upi_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text,
  p_handover_type text DEFAULT 'transfer'::text
)
 RETURNS TABLE(id uuid, user_id uuid, handed_to uuid, cash_amount numeric, upi_amount numeric, status text, handover_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_handover_id UUID;
    v_display_id TEXT;
    v_holding RECORD;
    v_total_handover NUMERIC;
    v_net_holding NUMERIC;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- If caller is acting on behalf of another user, they must be admin/manager
    IF v_caller_id IS DISTINCT FROM p_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
        ) THEN
            RAISE EXCEPTION 'Cannot create handover on behalf of another user';
        END IF;
    END IF;

    -- Validation
    IF p_user_id IS NULL OR p_handed_to IS NULL THEN
        RAISE EXCEPTION 'Both sender and recipient are required';
    END IF;

    IF p_user_id = p_handed_to THEN
        RAISE EXCEPTION 'Cannot hand over to yourself';
    END IF;

    v_total_handover := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

    IF v_total_handover <= 0 THEN
        RAISE EXCEPTION 'Handover amount must be greater than zero';
    END IF;

    -- HOLDING BALANCE CHECK: Validate sender has enough holding
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);

    v_net_holding := COALESCE(v_holding.net_holding, 0);

    -- Subtract pending handovers from available holding
    SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
    INTO v_total_handover
    FROM public.handovers
    WHERE user_id = p_user_id
      AND status = 'awaiting_confirmation';

    v_net_holding := v_net_holding - v_total_handover;

    IF v_net_holding < COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0) THEN
        RAISE EXCEPTION 'Insufficient holding balance. Available: %, Requested: %',
            GREATEST(v_net_holding, 0),
            COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);
    END IF;

    -- Check for duplicate pending handover
    IF EXISTS (
        SELECT 1 FROM public.handovers h
        WHERE h.user_id = p_user_id
        AND h.handed_to = p_handed_to
        AND h.handover_date = CURRENT_DATE
        AND h.status = 'awaiting_confirmation'
    ) THEN
        RAISE EXCEPTION 'DUPLICATE: You already have a pending handover to this recipient today';
    END IF;

    -- Generate display ID
    BEGIN
        SELECT public.generate_display_id('handovers', 'HND') INTO v_display_id;
    EXCEPTION WHEN OTHERS THEN
        v_display_id := 'HND-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text;
    END;

    -- Create handover
    INSERT INTO public.handovers (
        user_id, handed_to, handover_date,
        cash_amount, upi_amount, status, handover_type, notes,
        created_at, updated_at
    ) VALUES (
        p_user_id, p_handed_to, CURRENT_DATE,
        COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0),
        'awaiting_confirmation', p_handover_type, p_notes,
        NOW(), NOW()
    )
    RETURNING public.handovers.id INTO v_handover_id;

    -- Log activity
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
        v_caller_id,
        'Created handover request',
        'handover',
        v_handover_id,
        jsonb_build_object(
            'display_id', v_display_id,
            'cash_amount', p_cash_amount,
            'upi_amount', p_upi_amount,
            'total', COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0),
            'handed_to', p_handed_to,
            'handover_type', p_handover_type
        )
    );

    RETURN QUERY SELECT h.id, h.user_id, h.handed_to, h.cash_amount, h.upi_amount, h.status, h.handover_type
    FROM public.handovers h WHERE h.id = v_handover_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_handover_with_type TO authenticated;
