-- ============================================================================
-- Cash Handover Workflow
-- Tracks money flow: Sales + Transactions → Handover → Income
-- ============================================================================

-- Function: Calculate agent's current cash holding
-- Returns the amount the agent needs to hand over
CREATE OR REPLACE FUNCTION public.get_agent_cash_holding(p_user_id UUID)
RETURNS TABLE(
    sales_cash NUMERIC,
    sales_upi NUMERIC,
    transactions_cash NUMERIC,
    transactions_upi NUMERIC,
    total_collected NUMERIC,
    confirmed_handovers_cash NUMERIC,
    confirmed_handovers_upi NUMERIC,
    total_handed_over NUMERIC,
    net_holding NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH sales_totals AS (
        SELECT 
            COALESCE(SUM(cash_amount), 0) as cash,
            COALESCE(SUM(upi_amount), 0) as upi
        FROM public.sales
        WHERE recorded_by = p_user_id
    ),
    transaction_totals AS (
        SELECT 
            COALESCE(SUM(cash_amount), 0) as cash,
            COALESCE(SUM(upi_amount), 0) as upi
        FROM public.transactions
        WHERE recorded_by = p_user_id
    ),
    handover_totals AS (
        SELECT 
            COALESCE(SUM(cash_amount), 0) as cash,
            COALESCE(SUM(upi_amount), 0) as upi
        FROM public.handovers
        WHERE user_id = p_user_id
        AND status = 'confirmed'
    )
    SELECT 
        s.cash as sales_cash,
        s.upi as sales_upi,
        t.cash as transactions_cash,
        t.upi as transactions_upi,
        (s.cash + s.upi + t.cash + t.upi) as total_collected,
        h.cash as confirmed_handovers_cash,
        h.upi as confirmed_handovers_upi,
        (h.cash + h.upi) as total_handed_over,
        GREATEST(0, (s.cash + s.upi + t.cash + t.upi) - (h.cash + h.upi)) as net_holding
    FROM sales_totals s, transaction_totals t, handover_totals h;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_agent_cash_holding(UUID) TO authenticated;

-- ============================================================================
-- Enhanced create_handover with validation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_handover_v2(
    p_user_id UUID,
    p_handed_to UUID,
    p_cash_amount NUMERIC DEFAULT 0,
    p_upi_amount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS SETOF public.handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_handover_id UUID;
    v_display_id TEXT;
    v_holding RECORD;
    v_total_handover NUMERIC;
BEGIN
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

    -- Get current holding
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);
    
    IF v_holding IS NULL THEN
        v_holding.net_holding := 0;
    END IF;

    -- Validate: Cannot hand over more than holding
    IF v_total_handover > v_holding.net_holding THEN
        RAISE EXCEPTION 'Cannot hand over more than current holding. Current holding: ₹%, Attempted: ₹%', 
            v_holding.net_holding, v_total_handover;
    END IF;

    -- Check for duplicate handover to same recipient today
    IF EXISTS (
        SELECT 1 FROM public.handovers
        WHERE user_id = p_user_id
        AND handed_to = p_handed_to
        AND handover_date = CURRENT_DATE
        AND status = 'awaiting_confirmation'
    ) THEN
        RAISE EXCEPTION 'duplicate_handover: You already have a pending handover to this recipient today';
    END IF;

    -- Generate display ID
    BEGIN
        v_display_id := public.generate_display_id('handovers', 'HND');
    EXCEPTION WHEN OTHERS THEN
        v_display_id := 'HND-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text;
    END;

    -- Insert handover
    INSERT INTO public.handovers (
        user_id, handed_to, handover_date,
        cash_amount, upi_amount, status, notes,
        created_at, updated_at
    ) VALUES (
        p_user_id, p_handed_to, CURRENT_DATE,
        COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), 
        'awaiting_confirmation', p_notes,
        NOW(), NOW()
    )
    RETURNING id INTO v_handover_id;

    -- Log activity
    INSERT INTO public.activity_log (
        user_id, action, entity_type, entity_display_id, entity_id, metadata, created_at
    ) VALUES (
        p_user_id, 
        'Created handover', 
        'handover', 
        v_display_id,
        v_handover_id,
        jsonb_build_object(
            'cash_amount', p_cash_amount,
            'upi_amount', p_upi_amount,
            'total', v_total_handover,
            'handed_to', p_handed_to,
            'recipient_name', (SELECT full_name FROM profiles WHERE user_id = p_handed_to)
        ),
        NOW()
    );

    -- Return the created record
    RETURN QUERY SELECT * FROM public.handovers WHERE id = v_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_handover_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- Enhanced confirm_handover with income entry creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_handover_v2(
    p_handover_id UUID,
    p_confirmed_by UUID DEFAULT NULL
)
RETURNS SETOF public.handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_handover RECORD;
    v_confirmer UUID;
    v_income_id UUID;
    v_warehouse_id UUID;
BEGIN
    v_confirmer := COALESCE(p_confirmed_by, auth.uid());
    
    -- Get handover details
    SELECT * INTO v_handover 
    FROM public.handovers 
    WHERE id = p_handover_id;
    
    IF v_handover IS NULL THEN
        RAISE EXCEPTION 'Handover not found';
    END IF;
    
    IF v_handover.status != 'awaiting_confirmation' THEN
        RAISE EXCEPTION 'Handover is not awaiting confirmation. Current status: %', v_handover.status;
    END IF;

    -- Get warehouse for the recipient
    SELECT warehouse_id INTO v_warehouse_id
    FROM staff_directory
    WHERE user_id = v_handover.handed_to
    LIMIT 1;

    -- Update handover status
    UPDATE public.handovers
    SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_confirmer,
        updated_at = NOW()
    WHERE id = p_handover_id;

    -- Create income entry
    INSERT INTO public.income_entries (
        entry_type,
        source_type,
        source_id,
        cash_amount,
        upi_amount,
        total_amount,
        category,
        recorded_by,
        warehouse_id,
        notes,
        created_at
    ) VALUES (
        'collection',
        'handover',
        p_handover_id,
        v_handover.cash_amount,
        v_handover.upi_amount,
        (COALESCE(v_handover.cash_amount, 0) + COALESCE(v_handover.upi_amount, 0)),
        'handover',
        v_confirmer,
        v_warehouse_id,
        'Handover from ' || (SELECT full_name FROM profiles WHERE user_id = v_handover.user_id),
        NOW()
    )
    RETURNING id INTO v_income_id;

    -- Log activity
    INSERT INTO public.activity_log (
        user_id, action, entity_type, entity_display_id, entity_id, metadata, created_at
    ) VALUES (
        v_confirmer,
        'Confirmed handover',
        'handover',
        v_handover.display_id,
        p_handover_id,
        jsonb_build_object(
            'cash_amount', v_handover.cash_amount,
            'upi_amount', v_handover.upi_amount,
            'total', COALESCE(v_handover.cash_amount, 0) + COALESCE(v_handover.upi_amount, 0),
            'income_entry_id', v_income_id,
            'sender_id', v_handover.user_id,
            'sender_name', (SELECT full_name FROM profiles WHERE user_id = v_handover.user_id)
        ),
        NOW()
    );

    -- Return updated handover
    RETURN QUERY SELECT * FROM public.handovers WHERE id = p_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_handover_v2(UUID, UUID) TO authenticated;

-- ============================================================================
-- Function: Get today's handoverable amount
-- For agent dashboard
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_today_handoverable(p_user_id UUID)
RETURNS TABLE(
    today_cash NUMERIC,
    today_upi NUMERIC,
    today_total NUMERIC,
    today_confirmed NUMERIC,
    today_handoverable NUMERIC,
    pending_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_holding RECORD;
BEGIN
    -- Get overall holding
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);
    
    -- Get today's collections
    RETURN QUERY
    WITH today_sales AS (
        SELECT 
            COALESCE(SUM(cash_amount), 0) as cash,
            COALESCE(SUM(upi_amount), 0) as upi
        FROM public.sales
        WHERE recorded_by = p_user_id
        AND DATE(created_at) = v_today
    ),
    today_txns AS (
        SELECT 
            COALESCE(SUM(cash_amount), 0) as cash,
            COALESCE(SUM(upi_amount), 0) as upi
        FROM public.transactions
        WHERE recorded_by = p_user_id
        AND DATE(created_at) = v_today
    ),
    today_handover AS (
        SELECT 
            COALESCE(SUM(cash_amount + upi_amount), 0) as total
        FROM public.handovers
        WHERE user_id = p_user_id
        AND handover_date = v_today
        AND status = 'confirmed'
    )
    SELECT 
        (s.cash + t.cash) as today_cash,
        (s.upi + t.upi) as today_upi,
        (s.cash + t.cash + s.upi + t.upi) as today_total,
        COALESCE(h.total, 0) as today_confirmed,
        GREATEST(0, (s.cash + t.cash + s.upi + t.upi) - COALESCE(h.total, 0)) as today_handoverable,
        v_holding.net_holding as pending_total
    FROM today_sales s, today_txns t, today_handover h;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_today_handoverable(UUID) TO authenticated;

-- ============================================================================
-- Migration metadata
-- ============================================================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260426000002', 'cash_handover_workflow', NOW())
ON CONFLICT DO NOTHING;
