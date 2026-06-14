-- Secure update_transaction RPC with auth check + same-day restriction
-- Before: no auth check at all (SECURITY DEFINER, any authenticated user could call)

DROP FUNCTION IF EXISTS public.update_transaction(uuid, numeric, numeric, text) CASCADE;

CREATE OR REPLACE FUNCTION public.update_transaction(
  p_transaction_id uuid,
  p_cash_amount numeric,
  p_upi_amount numeric,
  p_notes text DEFAULT NULL::text
)
 RETURNS TABLE(new_store_outstanding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txn RECORD;
  v_new_total NUMERIC;
  v_store_id UUID;
  v_acting_role TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_acting_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;

  SELECT * INTO v_txn FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_txn.is_fully_returned THEN
    RAISE EXCEPTION 'Cannot edit a fully returned transaction';
  END IF;

  -- Same-day lockout: only super_admin/manager can edit past transactions
  IF v_acting_role NOT IN ('super_admin', 'manager') THEN
    IF (v_txn.created_at AT TIME ZONE 'Asia/Kolkata')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Transaction edits are only allowed on the same day the transaction was recorded';
    END IF;
    -- Non-admin can only edit their own transactions
    IF v_txn.recorded_by != v_user_id THEN
      RAISE EXCEPTION 'You can only edit your own transactions';
    END IF;
  END IF;

  v_new_total := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);
  IF v_new_total <= 0 THEN
    RAISE EXCEPTION 'Total payment amount must be positive';
  END IF;

  v_store_id := v_txn.store_id;

  UPDATE public.transactions
  SET cash_amount  = COALESCE(p_cash_amount, 0),
      upi_amount   = COALESCE(p_upi_amount, 0),
      total_amount = v_new_total,
      notes        = COALESCE(p_notes, notes),
      updated_at   = NOW()
  WHERE id = p_transaction_id;

  PERFORM public.recalc_running_balances(v_store_id);

  WITH ranked AS (
    SELECT new_outstanding, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
    FROM (
      SELECT created_at, new_outstanding FROM public.sales WHERE store_id = v_store_id AND deleted_at IS NULL
      UNION ALL
      SELECT created_at, new_outstanding FROM public.transactions WHERE store_id = v_store_id AND deleted_at IS NULL
      UNION ALL
      SELECT created_at, new_outstanding FROM public.payment_returns WHERE store_id = v_store_id AND status = 'completed'
      UNION ALL
      SELECT created_at, new_outstanding FROM public.balance_adjustments WHERE store_id = v_store_id
      UNION ALL
      SELECT created_at, new_outstanding FROM public.balance_corrections WHERE store_id = v_store_id AND status = 'approved'
    ) all_entries
  )
  UPDATE public.stores s
  SET outstanding = COALESCE(r.new_outstanding, 0),
      updated_at  = NOW(),
      updated_by  = v_txn.recorded_by
  FROM ranked r
  WHERE s.id = v_store_id AND r.rn = 1;

  RETURN QUERY SELECT s.outstanding FROM public.stores s WHERE s.id = v_store_id;
END;
$function$;
