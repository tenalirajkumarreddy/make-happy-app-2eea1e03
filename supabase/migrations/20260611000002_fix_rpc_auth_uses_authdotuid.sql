-- Fix RPCs to use auth.uid() for authorization (not caller-provided UUID)
-- Date: 2026-06-11
--
-- Fixes:
-- 1. confirm_handover    — add auth.uid() check, use auth.uid() for auth
-- 2. reject_handover     — use auth.uid() for auth instead of p_rejected_by
-- 3. cancel_handover     — use auth.uid() for auth instead of p_cancelled_by
-- 4. edit_handover       — add auth.uid() check, use auth.uid() for auth
-- 5. create_handover_with_type — verify p_user_id == auth.uid() OR caller is admin
-- 6. approve_expense_claim (2 overloads) — CRITICAL: add role check on overload 2
-- 7. reject_expense_claim (2 overloads) — add role check
-- 8. cancel_expense_claim — add auth.uid() check
-- 9. deduct_expense_from_holding — CRITICAL: add auth + role check
-- 10. record_sale — verify p_recorded_by == auth.uid() OR caller is admin
-- =========================================================

-- ──────────────────────────────────────────────
-- 1. confirm_handover — add auth.uid() checks
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.confirm_handover(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.confirm_handover(p_handover_id uuid, p_confirmed_by uuid)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_sender_id UUID;
  v_handover_amount NUMERIC;
  v_sender_balance NUMERIC;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be acting as themselves
  IF p_confirmed_by IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Cannot confirm handover on behalf of another user';
  END IF;

  SELECT status, user_id, COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)
  INTO v_status, v_sender_id, v_handover_amount
  FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Handover is already confirmed'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Cannot confirm a cancelled handover'; END IF;
  IF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %. Only pending handovers can be confirmed', v_status;
  END IF;

  -- Authorization: use auth.uid() instead of p_confirmed_by
  IF NOT EXISTS (
    SELECT 1 FROM public.handovers WHERE id = p_handover_id AND handed_to = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm this handover';
  END IF;

  -- Advisory lock serializes concurrent confirmations on the same handover
  PERFORM pg_advisory_lock(hashtext(p_handover_id::TEXT));

  -- Double-check status after lock
  SELECT status INTO v_status FROM public.handovers WHERE id = p_handover_id;
  IF v_status != 'awaiting_confirmation' THEN
    PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));
    RAISE EXCEPTION 'Handover was modified by another transaction. Current status: %', v_status;
  END IF;

  -- Validate sender's holding balance can cover this handover
  -- Lock the sender's profile to prevent concurrent deductions
  SELECT COALESCE(holding_balance, 0) INTO v_sender_balance
  FROM public.profiles
  WHERE user_id = v_sender_id
  FOR UPDATE;

  IF v_sender_balance - v_handover_amount < 0 THEN
    PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));
    RAISE EXCEPTION 'Sender has insufficient balance (%, need %). Some handovers may have been confirmed already.',
      v_sender_balance, v_handover_amount;
  END IF;

  UPDATE public.handovers
  SET status = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE public.handovers.id = p_handover_id;

  PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller_id, 'Confirmed handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id, 'confirmed_by', p_confirmed_by));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_handover TO authenticated;

-- ──────────────────────────────────────────────
-- 2. reject_handover — use auth.uid() for auth
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reject_handover(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.reject_handover(p_handover_id uuid, p_rejected_by uuid)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_handed_to UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be acting as themselves
  IF p_rejected_by IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Cannot reject handover on behalf of another user';
  END IF;

  SELECT status, handed_to INTO v_status, v_handed_to
  FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'rejected' THEN RAISE EXCEPTION 'Handover is already rejected'; END IF;
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Cannot reject a confirmed handover'; END IF;
  IF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %', v_status;
  END IF;

  -- Only the recipient or admin/manager can reject — use auth.uid()
  IF v_handed_to != v_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject this handover';
  END IF;

  UPDATE public.handovers
  SET status = 'rejected',
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller_id, 'Rejected handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reject_handover TO authenticated;

-- ──────────────────────────────────────────────
-- 3. cancel_handover — use auth.uid() for auth
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_handover(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.cancel_handover(p_handover_id uuid, p_cancelled_by uuid)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_user_id UUID;
  v_handed_to UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, user_id, handed_to INTO v_status, v_user_id, v_handed_to
  FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Handover is already cancelled'; END IF;
  IF v_status = 'confirmed' THEN
    -- Cancelling a confirmed handover requires admin/manager AND reverses balances
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
    ) THEN
      RAISE EXCEPTION 'Only admins can cancel a confirmed handover';
    END IF;

    -- Reverse income_entries for this handover
    DELETE FROM public.income_entries
    WHERE source_type = 'handover' AND source_id = p_handover_id::TEXT;

    -- Reverse staff_cash_accounts: decrease receiver, increase sender
    UPDATE public.staff_cash_accounts
    SET cash_amount = GREATEST(COALESCE(cash_amount, 0) - COALESCE(h.cash_amount, 0), 0),
        upi_amount = GREATEST(COALESCE(upi_amount, 0) - COALESCE(h.upi_amount, 0), 0),
        updated_at = NOW()
    FROM public.handovers h
    WHERE h.id = p_handover_id AND staff_cash_accounts.user_id = h.confirmed_by;

    UPDATE public.staff_cash_accounts
    SET cash_amount = COALESCE(cash_amount, 0) + COALESCE(h.cash_amount, 0),
        upi_amount = COALESCE(upi_amount, 0) + COALESCE(h.upi_amount, 0),
        updated_at = NOW()
    FROM public.handovers h
    WHERE h.id = p_handover_id AND staff_cash_accounts.user_id = h.user_id;

  ELSIF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %', v_status;
  END IF;

  -- Sender, recipient, or admin can cancel (for pending) — use auth.uid()
  IF v_status = 'awaiting_confirmation' THEN
    IF v_user_id != v_caller_id AND v_handed_to != v_caller_id AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
    ) THEN
      RAISE EXCEPTION 'Not authorized to cancel this handover';
    END IF;
  END IF;

  UPDATE public.handovers
  SET status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller_id, 'Cancelled handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_handover TO authenticated;

-- ──────────────────────────────────────────────
-- 4. edit_handover — add auth.uid() checks
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.edit_handover(uuid, numeric, numeric, text, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.edit_handover(p_handover_id uuid, p_cash_amount numeric DEFAULT NULL::numeric, p_upi_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, cash_amount numeric, upi_amount numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_new_cash NUMERIC;
  v_new_upi NUMERIC;
  v_new_total NUMERIC;
  v_effective_status TEXT;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_handover_id IS NULL THEN
    RAISE EXCEPTION 'Handover ID is required';
  END IF;

  -- Verify caller is super_admin using auth.uid()
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can edit handovers';
  END IF;

  -- Caller must be acting as themselves
  IF p_admin_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Cannot edit handover on behalf of another admin';
  END IF;

  SELECT * INTO v_old FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handover not found';
  END IF;

  v_new_cash    := COALESCE(p_cash_amount, v_old.cash_amount);
  v_new_upi     := COALESCE(p_upi_amount, v_old.upi_amount);
  v_new_total   := v_new_cash + v_new_upi;

  IF v_new_total <= 0 THEN
    RAISE EXCEPTION 'Total handover amount must be greater than zero';
  END IF;

  v_effective_status := COALESCE(p_status, v_old.status);

  UPDATE public.handovers SET
    cash_amount  = v_new_cash,
    upi_amount   = v_new_upi,
    status       = v_effective_status,
    notes        = COALESCE(p_notes, v_old.notes),
    updated_at   = NOW(),
    confirmed_by = CASE
      WHEN v_effective_status = 'confirmed' AND v_old.status != 'confirmed'
      THEN v_caller_id ELSE confirmed_by
    END,
    confirmed_at = CASE
      WHEN v_effective_status = 'confirmed' AND v_old.status != 'confirmed'
      THEN NOW() ELSE confirmed_at
    END,
    rejected_at  = CASE
      WHEN v_effective_status = 'rejected' AND v_old.status != 'rejected'
      THEN NOW() ELSE rejected_at
    END
  WHERE id = p_handover_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller_id, 'Edited handover', 'handover', p_handover_id::TEXT,
    jsonb_build_object(
      'old_amount', v_old.cash_amount + v_old.upi_amount,
      'new_amount', v_new_total,
      'old_status', v_old.status,
      'new_status', v_effective_status,
      'notes', p_notes
    )
  );

  RETURN QUERY SELECT p_handover_id, v_new_cash, v_new_upi, v_effective_status;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.edit_handover TO authenticated;

-- ──────────────────────────────────────────────
-- 5. create_handover_with_type — verify p_user_id matches auth.uid() OR admin proxy
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_handover_with_type(uuid, uuid, numeric, numeric, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.create_handover_with_type(p_user_id uuid, p_handed_to uuid, p_cash_amount numeric DEFAULT 0, p_upi_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_handover_type text DEFAULT 'transfer'::text)
 RETURNS TABLE(id uuid, user_id uuid, handed_to uuid, cash_amount numeric, upi_amount numeric, status text, handover_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- ──────────────────────────────────────────────
-- 6. approve_expense_claim — add auth checks to BOTH overloads
--    Overload 2 (called by frontend) was missing role check entirely — CRITICAL
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.approve_expense_claim(uuid, uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_expense_claim(uuid, uuid, text, numeric, uuid, text) CASCADE;

-- Overload 1: simple approve/reject by amount
CREATE OR REPLACE FUNCTION public.approve_expense_claim(p_claim_id uuid, p_reviewer_id uuid, p_approved_amount numeric, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(claim_id uuid, success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_claim RECORD;
    v_caller_id UUID;
    v_new_status TEXT;
    v_action TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Caller must be acting as themselves
    IF p_reviewer_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Cannot approve on behalf of another user';
    END IF;

    -- Verify caller has approval role
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
    ) THEN
        RAISE EXCEPTION 'Only managers can approve expense claims';
    END IF;

    SELECT ec.* INTO v_claim
    FROM public.expense_claims ec
    WHERE ec.id = p_claim_id AND ec.status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim not found or already processed';
    END IF;

    IF p_approved_amount IS NULL OR p_approved_amount < 0 THEN
        RAISE EXCEPTION 'Approved amount must be 0 or greater';
    END IF;

    IF p_approved_amount > v_claim.amount THEN
        RAISE EXCEPTION 'Approved amount cannot exceed requested amount';
    END IF;

    IF p_approved_amount > 0 THEN
        v_new_status := 'approved';
        v_action := 'approved';
    ELSE
        v_new_status := 'rejected';
        v_action := 'rejected';
    END IF;

    UPDATE public.expense_claims
    SET status          = v_new_status,
        approved_amount = p_approved_amount,
        reviewed_by     = v_caller_id,
        reviewed_at     = NOW(),
        reviewer_notes  = p_notes,
        approved_at     = CASE WHEN p_approved_amount > 0 THEN NOW() ELSE NULL END,
        updated_at      = NOW()
    WHERE expense_claims.id = p_claim_id;

    -- Insert history
    BEGIN
        INSERT INTO public.expense_claims_history (claim_id, user_id, action, amount_changed, status_changed_to, reviewer_id)
        VALUES (p_claim_id, v_claim.user_id, v_action, p_approved_amount, v_new_status, v_caller_id);
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    INSERT INTO public.activity_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES (
        v_action || '_expense',
        'expense_claim',
        p_claim_id,
        v_caller_id,
        jsonb_build_object(
            'original_amount', v_claim.amount,
            'approved_amount', p_approved_amount
        )
    );

    RETURN QUERY SELECT
        p_claim_id,
        TRUE,
        'Expense claim ' ||
        COALESCE(v_claim.display_id::text, p_claim_id::text) ||
        CASE WHEN p_approved_amount > 0 THEN ' approved for ₹' || p_approved_amount ELSE ' rejected' END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_expense_claim(uuid, uuid, numeric, text) TO authenticated;

-- Overload 2: full version with status + category (used by frontend)
CREATE OR REPLACE FUNCTION public.approve_expense_claim(p_claim_id uuid, p_reviewer_id uuid, p_status text, p_approved_amount numeric DEFAULT NULL::numeric, p_category_id uuid DEFAULT NULL::uuid, p_reviewer_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_amount NUMERIC;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be acting as themselves
  IF p_reviewer_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Cannot approve on behalf of another user';
  END IF;

  -- Verify caller has approval role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only managers can approve expense claims';
  END IF;

  -- Lock and fetch the expense claim row
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found';
  END IF;

  -- Only process pending claims
  IF v_claim.status != 'pending' THEN
    RAISE EXCEPTION 'Expense claim is not pending (current status: %)', v_claim.status;
  END IF;

  -- Use provided approved amount or fall back to original amount
  v_amount := COALESCE(p_approved_amount, v_claim.amount);

  -- Update the expense claim
  UPDATE expense_claims
  SET
    status = p_status,
    reviewed_by = v_caller_id,
    reviewed_at = NOW(),
    reviewer_notes = p_reviewer_notes,
    approved_amount = CASE WHEN p_status = 'approved' THEN v_amount ELSE NULL END,
    category_id = COALESCE(p_category_id, category_id)
  WHERE id = p_claim_id;

  -- If approved, deduct from holding balance atomically
  IF p_status = 'approved' THEN
    UPDATE profiles
    SET holding_balance = holding_balance - v_amount,
        holding_balance_updated_at = NOW()
    WHERE user_id = v_claim.user_id;

    -- Also update staff_cash_accounts for consistency
    UPDATE staff_cash_accounts
    SET cash_amount = cash_amount - v_amount
    WHERE user_id = v_claim.user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'status', p_status,
    'amount', v_amount
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_expense_claim(uuid, uuid, text, numeric, uuid, text) TO authenticated;

-- ──────────────────────────────────────────────
-- 7. reject_expense_claim — add auth checks to BOTH overloads
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reject_expense_claim(uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reject_expense_claim(uuid, uuid, text) CASCADE;

-- Overload 1: (claim_id, notes, reviewer_id)
CREATE OR REPLACE FUNCTION public.reject_expense_claim(p_claim_id uuid, p_reviewer_notes text, p_reviewer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be acting as themselves
  IF p_reviewer_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Cannot reject on behalf of another user';
  END IF;

  -- Verify caller has approval role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only managers can reject expense claims';
  END IF;

  -- Update the expense claim
  UPDATE expense_claims SET
    status = 'rejected',
    reviewer_notes = p_reviewer_notes,
    reviewed_by = v_caller_id,
    reviewed_at = NOW()
  WHERE id = p_claim_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reject_expense_claim(uuid, text, uuid) TO authenticated;

-- Overload 2: (claim_id, reviewer_id, rejection_reason)
CREATE OR REPLACE FUNCTION public.reject_expense_claim(p_claim_id uuid, p_reviewer_id uuid, p_rejection_reason text)
 RETURNS TABLE(claim_id uuid, success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_claim RECORD;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Caller must be acting as themselves
    IF p_reviewer_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Cannot reject on behalf of another user';
    END IF;

    -- Verify caller has approval role
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
    ) THEN
        RAISE EXCEPTION 'Only managers can reject expense claims';
    END IF;

    IF p_rejection_reason IS NULL OR length(p_rejection_reason) < 3 THEN
        RAISE EXCEPTION 'Rejection reason is required (min 3 chars)';
    END IF;

    SELECT * INTO v_claim
    FROM public.expense_claims
    WHERE id = p_claim_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim not found or already processed';
    END IF;

    UPDATE public.expense_claims
    SET status = 'rejected',
        rejection_reason = p_rejection_reason,
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        updated_at = NOW(),
        updated_by = v_caller_id
    WHERE id = p_claim_id;

    INSERT INTO public.expense_claims_history (claim_id, user_id, action, status_changed_to, reviewer_id)
    VALUES (p_claim_id, v_claim.user_id, 'rejected', 'rejected', v_caller_id);

    INSERT INTO public.activity_logs (action, entity_type, entity_id, user_id, details)
    VALUES ('expense_rejected', 'expense_claim', p_claim_id, v_caller_id,
        jsonb_build_object('amount', v_claim.amount, 'reason', p_rejection_reason));

    RETURN QUERY SELECT p_claim_id, TRUE, 'Expense claim rejected';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reject_expense_claim(uuid, uuid, text) TO authenticated;

-- ──────────────────────────────────────────────
-- 8. cancel_expense_claim — add auth.uid() check
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_expense_claim(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.cancel_expense_claim(p_claim_id uuid, p_user_id uuid)
 RETURNS TABLE(claim_id uuid, success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_claim RECORD;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Caller can cancel their own claim, or admin can cancel any claim
    SELECT * INTO v_claim
    FROM public.expense_claims
    WHERE id = p_claim_id
      AND status = 'pending'
      AND (
          user_id = v_caller_id
          OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager'))
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim not found or cannot be cancelled';
    END IF;

    UPDATE public.expense_claims
    SET status = 'cancelled',
        updated_at = NOW(),
        updated_by = v_caller_id
    WHERE id = p_claim_id;

    INSERT INTO public.expense_claims_history (claim_id, user_id, action, status_changed_to)
    VALUES (p_claim_id, v_caller_id, 'cancelled', 'cancelled');

    RETURN QUERY SELECT p_claim_id, TRUE, 'Expense claim cancelled';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_expense_claim TO authenticated;

-- ──────────────────────────────────────────────
-- 9. deduct_expense_from_holding — CRITICAL: add auth + role check
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.deduct_expense_from_holding(uuid, numeric) CASCADE;

CREATE OR REPLACE FUNCTION public.deduct_expense_from_holding(p_user_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only super_admin and manager can deduct from holding
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only managers can deduct from holding balance';
  END IF;

  UPDATE profiles
  SET holding_balance = holding_balance - p_amount,
      holding_balance_updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.deduct_expense_from_holding TO authenticated;

-- ──────────────────────────────────────────────
-- 10. record_sale — verify p_recorded_by == auth.uid() OR admin proxy
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ, NUMERIC, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id            TEXT,
  p_store_id              UUID,
  p_customer_id           UUID,
  p_recorded_by           UUID,
  p_logged_by             UUID,
  p_total_amount          NUMERIC,
  p_cash_amount           NUMERIC,
  p_upi_amount            NUMERIC,
  p_outstanding_amount    NUMERIC,
  p_sale_items            JSONB,
  p_created_at            TIMESTAMPTZ DEFAULT NULL,
  p_expected_outstanding  NUMERIC DEFAULT NULL,
  p_fulfilled_order_id    UUID DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_warehouse_id UUID;
    v_target_user_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_staff_available_stock NUMERIC;
    v_product_available_stock NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_all_product_ids uuid[];
    v_store_customer_id UUID;
    v_has_price_override BOOLEAN;
    v_base_price NUMERIC;
    v_item_price NUMERIC;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- PROXY CHECK: caller must be acting as themselves OR be admin/manager
    IF v_caller_id IS DISTINCT FROM p_recorded_by THEN
        PERFORM public.assert_caller_allowed(v_caller_id, ARRAY['super_admin', 'manager']);
    END IF;

    -- ROLE CHECK: verify recorded_by user has the right role
    v_caller_role := public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'operator']);
    v_caller_is_admin := v_caller_role IN ('super_admin', 'manager');

    -- PRICE OVERRIDE CHECK: verify caller has price_override or prices match base
    v_has_price_override := public.user_has_permission(p_recorded_by, 'price_override');

    IF NOT v_has_price_override THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
      LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_item_price := (v_item->>'unit_price')::NUMERIC;
        SELECT base_price INTO v_base_price FROM public.products WHERE id = v_product_id;
        IF v_item_price IS DISTINCT FROM v_base_price THEN
          RAISE EXCEPTION 'Price override not permitted: product % price % differs from base price %',
            v_product_id, v_item_price, v_base_price;
        END IF;
      END LOOP;
    END IF;

    -- OPERATOR FULL-PAYMENT CHECK
    IF v_caller_role = 'operator' AND COALESCE(p_outstanding_amount, 0) > 0 THEN
        RAISE EXCEPTION 'Operator sales require full payment. Outstanding must be 0.';
    END IF;

    -- Resolve warehouse
    SELECT COALESCE(
      (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
      (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    v_target_user_id := p_recorded_by;

    -- Enforce Operator POS store restraint
    IF v_caller_role = 'operator' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.stores
            WHERE id = p_store_id
              AND warehouse_id = v_warehouse_id
              AND store_type_id = '00000000-0000-0000-0000-000000000001'::uuid
        ) THEN
            RAISE EXCEPTION 'Operator can only record sales for the POS store of their warehouse';
        END IF;
    END IF;

    -- Check if target has staff_stock
    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id) INTO v_has_staff_stock;

    -- LOCK store row + fetch outstanding
    SELECT s.outstanding, s.store_type_id, s.customer_id
    INTO v_old_outstanding, v_store_type_id, v_store_customer_id
    FROM public.stores s WHERE s.id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    IF v_store_customer_id IS DISTINCT FROM p_customer_id THEN
        RAISE EXCEPTION 'Customer does not belong to this store';
    END IF;

    -- Optimistic concurrency check
    IF p_expected_outstanding IS NOT NULL AND p_expected_outstanding != v_old_outstanding THEN
        RAISE EXCEPTION 'concurrent_modification: expected=%, actual=%', p_expected_outstanding, v_old_outstanding
            USING HINT = 'The store outstanding was modified by another transaction. Refresh and retry.';
    END IF;

    -- Validate outstanding math
    v_computed_outstanding := GREATEST(p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0), 0);
    IF p_outstanding_amount != v_computed_outstanding THEN
        RAISE EXCEPTION 'outstanding_mismatch: computed=%, provided=%', v_computed_outstanding, p_outstanding_amount;
    END IF;

    v_new_outstanding := v_old_outstanding + v_computed_outstanding;

    -- Credit limit check — gated by company_settings
    SELECT value INTO v_credit_limit_check FROM public.company_settings WHERE key = 'credit_limit_check';
    IF v_credit_limit_check = 'true' AND NOT v_caller_is_admin THEN
        SELECT c.kyc_status, c.credit_limit_override
        INTO v_kyc_status, v_credit_limit_override
        FROM public.customers c WHERE c.id = p_customer_id;

        IF v_credit_limit_override IS NOT NULL THEN
            v_credit_limit := v_credit_limit_override;
        ELSE
            SELECT CASE WHEN v_kyc_status IN ('verified', 'approved')
                THEN COALESCE(credit_limit_kyc, 0)
                ELSE COALESCE(credit_limit_no_kyc, 0)
            END INTO v_credit_limit
            FROM public.store_types WHERE id = v_store_type_id;
        END IF;

        IF v_credit_limit > 0 AND v_new_outstanding > v_credit_limit THEN
            RAISE EXCEPTION 'credit_limit_exceeded';
        END IF;
    END IF;

    -- Lock all stock rows upfront in consistent order to prevent deadlocks
    SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
    INTO v_all_product_ids
    FROM jsonb_array_elements(p_sale_items) AS item;

    PERFORM ss.product_id
    FROM staff_stock ss
    WHERE ss.user_id = v_target_user_id AND ss.product_id = ANY(v_all_product_ids)
    ORDER BY ss.product_id
    FOR UPDATE;

    PERFORM ps.product_id
    FROM product_stock ps
    WHERE ps.warehouse_id = v_warehouse_id AND ps.product_id = ANY(v_all_product_ids)
    ORDER BY ps.product_id
    FOR UPDATE;

    -- LOCK stock rows + pre-check + DEDUCT in one pass
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        IF v_caller_role = 'agent' THEN
            SELECT ss.quantity INTO v_staff_available_stock
            FROM public.staff_stock ss
            WHERE ss.user_id = v_target_user_id
              AND ss.product_id = v_product_id
              AND ss.warehouse_id = v_warehouse_id;

            v_staff_available_stock := COALESCE(v_staff_available_stock, 0);

            IF v_staff_available_stock >= v_quantity THEN
                UPDATE public.staff_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE user_id = v_target_user_id
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;
            ELSE
                v_insufficient_products := array_append(v_insufficient_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        ELSE
            IF v_has_staff_stock THEN
                SELECT ss.quantity INTO v_staff_available_stock
                FROM public.staff_stock ss
                WHERE ss.user_id = v_target_user_id
                  AND ss.product_id = v_product_id
                  AND ss.warehouse_id = v_warehouse_id;

                v_staff_available_stock := COALESCE(v_staff_available_stock, 0);

                IF v_staff_available_stock >= v_quantity THEN
                    UPDATE public.staff_stock
                    SET quantity = quantity - v_quantity, updated_at = now()
                    WHERE user_id = v_target_user_id
                      AND product_id = v_product_id
                      AND warehouse_id = v_warehouse_id;
                ELSE
                    v_staff_available_stock := 0;
                END IF;
            END IF;

            IF NOT v_has_staff_stock OR v_staff_available_stock < v_quantity THEN
                SELECT ps.quantity INTO v_product_available_stock
                FROM public.product_stock ps
                WHERE ps.product_id = v_product_id AND ps.warehouse_id = v_warehouse_id;

                v_product_available_stock := COALESCE(v_product_available_stock, 0);

                IF v_product_available_stock >= v_quantity THEN
                    UPDATE public.product_stock
                    SET quantity = quantity - v_quantity, updated_at = now()
                    WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
                ELSE
                    v_insufficient_products := array_append(v_insufficient_products,
                        COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
                END IF;
            END IF;
        END IF;
    END LOOP;

    IF array_length(v_insufficient_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_products, ', ');
    END IF;

    IF COALESCE(p_total_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Sale amount must be positive';
    END IF;

    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by,
        fulfilled_order_id
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by,
        p_fulfilled_order_id
    ) RETURNING id INTO v_sale_id;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
    SELECT v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'total_price')::NUMERIC,
        v_warehouse_id
    FROM jsonb_array_elements(p_sale_items) AS item;

    IF p_fulfilled_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'delivered',
            delivered_at = now(),
            fulfilled_by = p_recorded_by,
            fulfilled_by_sale_id = v_sale_id,
            updated_by = p_recorded_by,
            updated_at = now()
        WHERE id = p_fulfilled_order_id
          AND status != 'delivered';
    ELSE
        UPDATE public.orders o SET status = 'delivered', delivered_at = now(), fulfilled_by = p_recorded_by
        WHERE o.store_id = p_store_id AND o.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM public.order_items oi
            WHERE oi.order_id = o.id
            AND oi.quantity > COALESCE((
                SELECT SUM((item->>'quantity')::numeric)
                FROM jsonb_array_elements(p_sale_items) AS item
                WHERE (item->>'product_id')::uuid = oi.product_id
            ), 0)
        );
    END IF;

    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale TO authenticated;
