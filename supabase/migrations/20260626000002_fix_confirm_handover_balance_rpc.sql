-- Migration: Fix confirm_handover to update profiles.holding_balance
-- Date: 2026-06-26
--
-- ISSUE: confirm_handover() RPC updates handover status and creates income entries,
--        but never updates profiles.holding_balance. This leaves the cached
--        balance stale for the receiver (and potentially sender if we don't have a trigger).
--
-- This migration patches the existing confirm_handover function to also
-- update the receiver's and sender's profiles.holding_balance directly.
-- =========================================================

-- Fix confirm_handover: add profiles.holding_balance updates for both sender and receiver
-- We must do a CREATE OR REPLACE since the function already exists.
-- IMPORTANT: We preserve the exact same signature for backwards compatibility.

CREATE OR REPLACE FUNCTION public.confirm_handover(p_handover_id uuid, p_confirmed_by uuid)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_sender_id UUID;
  v_receiver_id UUID;
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

  -- Fetch handover details
  SELECT h.status, h.user_id, h.handed_to, COALESCE(h.cash_amount, 0) + COALESCE(h.upi_amount, 0)
  INTO v_status, v_sender_id, v_receiver_id, v_handover_amount
  FROM public.handovers h WHERE h.id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Handover is already confirmed'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Cannot confirm a cancelled handover'; END IF;
  IF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %. Only pending handovers can be confirmed', v_status;
  END IF;

  -- Authorization check
  IF v_receiver_id != v_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm this handover';
  END IF;

  -- Advisory lock for race condition protection
  PERFORM pg_advisory_lock(hashtext(p_handover_id::TEXT));

  -- Double-check status after acquiring lock
  SELECT status INTO v_status FROM public.handovers WHERE id = p_handover_id;
  IF v_status != 'awaiting_confirmation' THEN
    PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));
    RAISE EXCEPTION 'Handover was modified by another transaction. Current status: %', v_status;
  END IF;

  -- Validate sender's holding balance
  SELECT COALESCE(holding_balance, 0) INTO v_sender_balance
  FROM public.profiles WHERE user_id = v_sender_id FOR UPDATE;

  IF v_sender_balance - v_handover_amount < 0 THEN
    PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));
    RAISE EXCEPTION 'Sender has insufficient balance (%, need %). Some handovers may have been confirmed already.',
      v_sender_balance, v_handover_amount;
  END IF;

  -- Mark handover as confirmed
  UPDATE public.handovers
  SET status = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE public.handovers.id = p_handover_id;

  -- =========================================================
  -- FIX: Update both sender and receiver holding balances
  -- =========================================================
  -- Decrease sender's holding balance (money sent out)
  UPDATE public.profiles
  SET holding_balance = COALESCE(holding_balance, 0) - v_handover_amount,
      holding_balance_updated_at = NOW()
  WHERE user_id = v_sender_id;

  -- Increase receiver's holding balance (money received)
  -- Note: If receiver is a finalizer, we still increase the balance here.
  -- The income entry creation is handled by create_income_on_handover_confirm trigger.
  UPDATE public.profiles
  SET holding_balance = COALESCE(holding_balance, 0) + v_handover_amount,
      holding_balance_updated_at = NOW()
  WHERE user_id = v_receiver_id;

  -- Release advisory lock
  PERFORM pg_advisory_unlock(hashtext(p_handover_id::TEXT));

  -- Log the confirmation
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller_id, 'Confirmed handover (balance updated)', 'handover', p_handover_id,
    jsonb_build_object(
      'handover_id', p_handover_id,
      'confirmed_by', p_confirmed_by,
      'sender_id', v_sender_id,
      'receiver_id', v_receiver_id,
      'amount', v_handover_amount
    ));

  -- Return the updated handover
  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_handover TO authenticated;
