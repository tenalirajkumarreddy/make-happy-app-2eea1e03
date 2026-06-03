-- Fix holding balance to account for payment returns
-- Previously, calculate_holding_balance did NOT subtract payment returns from
-- the agent's holding. This meant:
--   - Full return: holding was unchanged (transaction still counted)
--   - Partial return: holding was unchanged (no mechanism at all)
--
-- Fix: join payment_returns through original_transaction_id to find
-- the original collector, then subtract return amounts from their holding.
--
-- Also adds trigger on payment_returns table so any return INSERT/UPDATE/DELETE
-- triggers a sync_holding_balance for the original transaction's recorded_by user.
--
-- Additionally captures 4 RPCs that existed only on the live DB:
--   edit_handover, admin_transfer_between_staff,
--   deduct_expense_from_holding, get_daily_handover_aggregates

-- 1. Redefine calculate_holding_balance to include payment returns
CREATE OR REPLACE FUNCTION public.calculate_holding_balance(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sales              NUMERIC;
  v_transactions       NUMERIC;
  v_received_handovers NUMERIC;
  v_sent_handovers     NUMERIC;
  v_payment_returns    NUMERIC;
BEGIN
  -- Sales: only non-returned, non-deleted sales count as income
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sales
  FROM public.sales
  WHERE recorded_by = p_user_id
    AND is_fully_returned = false
    AND deleted_at IS NULL;

  -- Transactions: ALL non-deleted transactions count
  -- (payment returns are subtracted separately below)
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_transactions
  FROM public.transactions
  WHERE recorded_by = p_user_id
    AND deleted_at IS NULL;

  -- Only CONFIRMED received handovers count as income
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_received_handovers
  FROM public.handovers
  WHERE handed_to = p_user_id AND status = 'confirmed';

  -- Only CONFIRMED sent handovers count as deductions
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sent_handovers
  FROM public.handovers
  WHERE user_id = p_user_id AND status = 'confirmed';

  -- Payment returns: subtract amounts returned from payments the agent collected
  -- (joins through original_transaction_id to find the original collector)
  SELECT COALESCE(SUM(COALESCE(pr.return_amount, 0)), 0)
  INTO v_payment_returns
  FROM public.payment_returns pr
  JOIN public.transactions t ON t.id = pr.original_transaction_id
  WHERE t.recorded_by = p_user_id
    AND pr.status = 'completed';

  RETURN (v_sales + v_transactions + v_received_handovers) - v_sent_handovers - v_payment_returns;
END;
$function$;

-- 2. Trigger function: sync holding balance when payment_returns change
CREATE OR REPLACE FUNCTION public.sync_holding_balance_on_payment_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original_recorded_by UUID;
BEGIN
  -- Find the original transaction's recorded_by user
  IF TG_OP = 'DELETE' THEN
    SELECT t.recorded_by INTO v_original_recorded_by
    FROM public.transactions t
    WHERE t.id = OLD.original_transaction_id;
  ELSE
    SELECT t.recorded_by INTO v_original_recorded_by
    FROM public.transactions t
    WHERE t.id = NEW.original_transaction_id;
  END IF;

  IF v_original_recorded_by IS NOT NULL THEN
    PERFORM public.sync_holding_balance(v_original_recorded_by);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_payment_return_sync_holding ON public.payment_returns;

CREATE TRIGGER trg_payment_return_sync_holding
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON public.payment_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_holding_balance_on_payment_return();

COMMENT ON TRIGGER trg_payment_return_sync_holding ON public.payment_returns IS
  'After a payment return is completed, updated, or deleted, resync the holding balance of the original transaction recorder.';

-- 4. Capture missing RPC: edit_handover
CREATE OR REPLACE FUNCTION public.edit_handover(
  p_handover_id UUID,
  p_new_amount NUMERIC DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, cash_amount NUMERIC, upi_amount NUMERIC, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_old record;
  v_cash_amount NUMERIC;
  v_upi_amount NUMERIC;
BEGIN
  IF p_handover_id IS NULL THEN
    RAISE EXCEPTION 'Handover ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_admin_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can edit handovers';
  END IF;

  SELECT * INTO v_old FROM handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handover not found';
  END IF;

  IF p_new_amount IS NOT NULL AND p_new_amount > 0 THEN
    v_cash_amount := ROUND(p_new_amount * 0.7, 2);
    v_upi_amount := p_new_amount - v_cash_amount;
  ELSE
    v_cash_amount := v_old.cash_amount;
    v_upi_amount := v_old.upi_amount;
  END IF;

  UPDATE handovers SET
    cash_amount = v_cash_amount,
    upi_amount = v_upi_amount,
    status = COALESCE(p_new_status, v_old.status),
    notes = COALESCE(p_notes, v_old.notes),
    updated_at = NOW(),
    confirmed_by = CASE
      WHEN p_new_status = 'confirmed' AND v_old.status != 'confirmed'
      THEN p_admin_id
      ELSE confirmed_by
    END,
    confirmed_at = CASE
      WHEN p_new_status = 'confirmed' AND v_old.status != 'confirmed'
      THEN NOW()
      ELSE confirmed_at
    END,
    rejected_at = CASE
      WHEN p_new_status = 'rejected' AND v_old.status != 'rejected'
      THEN NOW()
      ELSE rejected_at
    END
  WHERE id = p_handover_id;

  INSERT INTO activity_logs (
    user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_admin_id, 'Edited handover', 'handover', p_handover_id::text,
    jsonb_build_object(
      'old_amount', v_old.cash_amount + v_old.upi_amount,
      'new_amount', v_cash_amount + v_upi_amount,
      'old_status', v_old.status,
      'new_status', COALESCE(p_new_status, v_old.status),
      'reason', p_notes
    )
  );

  RETURN QUERY SELECT
    p_handover_id, v_cash_amount, v_upi_amount, COALESCE(p_new_status, v_old.status);
END;
$function$;

-- 5. Capture missing RPC: admin_transfer_between_staff
CREATE OR REPLACE FUNCTION public.admin_transfer_between_staff(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, display_id TEXT, cash_amount NUMERIC, upi_amount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_cash_amount NUMERIC;
  v_upi_amount NUMERIC;
  v_new_handover_id UUID;
  v_display_id TEXT;
BEGIN
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Both sender and recipient are required';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to the same user';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_admin_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can perform admin transfers';
  END IF;

  v_cash_amount := ROUND(p_amount * 0.7, 2);
  v_upi_amount := p_amount - v_cash_amount;

  SELECT 'ADM-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0') INTO v_display_id;

  INSERT INTO handovers (
    id, user_id, handed_to, cash_amount, upi_amount,
    status, notes, created_at, handover_date, confirmed_by, confirmed_at
  ) VALUES (
    gen_random_uuid(), p_from_user_id, p_to_user_id,
    v_cash_amount, v_upi_amount,
    'confirmed', COALESCE(p_reason, 'Admin transfer'),
    NOW(), CURRENT_DATE, p_admin_id, NOW()
  )
  RETURNING id INTO v_new_handover_id;

  INSERT INTO activity_logs (
    user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_admin_id, 'Admin transfer between staff', 'handover', v_new_handover_id::text,
    jsonb_build_object(
      'from_user_id', p_from_user_id,
      'to_user_id', p_to_user_id,
      'amount', p_amount,
      'reason', p_reason
    )
  );

  RETURN QUERY SELECT
    v_new_handover_id, v_display_id, v_cash_amount, v_upi_amount;
END;
$function$;

-- 6. Capture missing RPC: deduct_expense_from_holding
CREATE OR REPLACE FUNCTION public.deduct_expense_from_holding(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE profiles
  SET holding_balance = holding_balance - p_amount,
      holding_balance_updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$function$;

-- 7. Capture missing RPC: get_daily_handover_aggregates
CREATE OR REPLACE FUNCTION public.get_daily_handover_aggregates(p_snapshot_date DATE)
RETURNS TABLE(
  user_id UUID,
  sales_total NUMERIC,
  sent_confirmed_total NUMERIC,
  sent_pending_total NUMERIC,
  received_confirmed_total NUMERIC,
  balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH staff_users AS (
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    WHERE ur.role != 'customer'
  ),
  sales_totals AS (
    SELECT
      s.recorded_by AS user_id,
      COALESCE(SUM(s.cash_amount + s.upi_amount), 0) AS total
    FROM sales s
    WHERE DATE(s.created_at) = p_snapshot_date
    GROUP BY s.recorded_by
  ),
  handovers_sent_confirmed AS (
    SELECT
      h.user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) AS total
    FROM handovers h
    WHERE h.status = 'confirmed'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.user_id
  ),
  handovers_sent_pending AS (
    SELECT
      h.user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) AS total
    FROM handovers h
    WHERE h.status = 'awaiting_confirmation'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.user_id
  ),
  handovers_received_confirmed AS (
    SELECT
      h.handed_to AS user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) AS total
    FROM handovers h
    WHERE h.status = 'confirmed'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.handed_to
  )
  SELECT
    su.user_id,
    COALESCE(st.total, 0) AS sales_total,
    COALESCE(hsc.total, 0) AS sent_confirmed_total,
    COALESCE(hsp.total, 0) AS sent_pending_total,
    COALESCE(hrc.total, 0) AS received_confirmed_total,
    COALESCE(st.total, 0) + COALESCE(hrc.total, 0)
      - COALESCE(hsc.total, 0) - COALESCE(hsp.total, 0) AS balance
  FROM staff_users su
  LEFT JOIN sales_totals st ON su.user_id = st.user_id
  LEFT JOIN handovers_sent_confirmed hsc ON su.user_id = hsc.user_id
  LEFT JOIN handovers_sent_pending hsp ON su.user_id = hsp.user_id
  LEFT JOIN handovers_received_confirmed hrc ON su.user_id = hrc.user_id
  ORDER BY su.user_id;
END;
$function$;

-- 8. Reconcile all profiles to correct any stale holding balances
DO $$
DECLARE
  rec RECORD;
  v_correct_balance NUMERIC;
BEGIN
  FOR rec IN SELECT user_id FROM public.profiles LOOP
    v_correct_balance := public.calculate_holding_balance(rec.user_id);
    UPDATE public.profiles
    SET holding_balance = v_correct_balance,
        holding_balance_updated_at = NOW()
    WHERE user_id = rec.user_id
      AND holding_balance IS DISTINCT FROM v_correct_balance;
  END LOOP;
END;
$$;
