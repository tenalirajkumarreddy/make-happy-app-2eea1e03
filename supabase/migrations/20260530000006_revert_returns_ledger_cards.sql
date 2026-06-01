-- Migration: Revert Returns Ledger Cards and recalculate balances with sale returns delta as 0
-- Date: 2026-05-30

-- 1. Redefine recalc_store_outstanding to ignore sale_returns table and treat returned sales as 0 delta
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_id ELSE NEW.store_id END;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.stores
    SET outstanding = (
      SELECT
        COALESCE(st.opening_balance, 0)
        -- Sales outstanding (total - cash - upi) for non-returned sales
        + COALESCE((
            SELECT SUM(COALESCE(s.total_amount, 0) - COALESCE(s.cash_amount, 0) - COALESCE(s.upi_amount, 0))
            FROM public.sales s
            WHERE s.store_id = v_store_id AND s.deleted_at IS NULL AND s.is_fully_returned = false
          ), 0)
        -- Minus payments (transactions)
        - COALESCE((
            SELECT SUM(COALESCE(t.total_amount, 0))
            FROM public.transactions t
            WHERE t.store_id = v_store_id AND t.deleted_at IS NULL
          ), 0)
        -- OMIT sale_returns entirely here
        -- Plus completed payment returns
        + COALESCE((
            SELECT SUM(COALESCE(pr.return_amount, 0))
            FROM public.payment_returns pr
            WHERE pr.store_id = v_store_id AND pr.status = 'completed'
          ), 0)
        -- Plus adjustments (balance_adjustments)
        + COALESCE((
            SELECT SUM(COALESCE(ba.adjustment_amount, 0))
            FROM public.balance_adjustments ba
            WHERE ba.store_id = v_store_id
          ), 0)
        -- Plus manual balance corrections (increase)
        + COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store_id AND bc.status = 'approved' AND bc.correction_type = 'increase'
          ), 0)
        -- Minus manual balance corrections (decrease)
        - COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store_id AND bc.status = 'approved' AND bc.correction_type = 'decrease'
          ), 0)
      FROM public.stores st
      WHERE st.id = v_store_id
    ),
    updated_at = now()
    WHERE id = v_store_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 2. Redefine recalc_running_balances to set returned sales delta to 0 and exclude sale_returns table
CREATE OR REPLACE FUNCTION public.recalc_running_balances(p_store_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_balance NUMERIC;
  v_running         NUMERIC;
  rec               RECORD;
BEGIN
  SELECT COALESCE(opening_balance, 0)
  INTO   v_opening_balance
  FROM   public.stores
  WHERE  id = p_store_id;

  v_running := v_opening_balance;

  FOR rec IN (
    SELECT 'sale' AS kind, id, created_at,
           CASE
             WHEN is_fully_returned = true THEN 0
             ELSE COALESCE(total_amount, 0) - COALESCE(cash_amount, 0) - COALESCE(upi_amount, 0)
           END AS delta
    FROM public.sales
    WHERE store_id = p_store_id AND deleted_at IS NULL
    UNION ALL
    SELECT 'txn' AS kind, id, created_at,
           -COALESCE(total_amount, 0) AS delta
    FROM public.transactions
    WHERE store_id = p_store_id AND deleted_at IS NULL
    -- OMITted sale_returns entirely to avoid adding return cards/rows
    UNION ALL
    SELECT 'pay_ret' AS kind, id, created_at,
           COALESCE(return_amount, 0) AS delta
    FROM public.payment_returns
    WHERE store_id = p_store_id AND status = 'completed'
    UNION ALL
    SELECT 'adj' AS kind, id, created_at,
           COALESCE(adjustment_amount, 0) AS delta
    FROM public.balance_adjustments
    WHERE store_id = p_store_id
    UNION ALL
    SELECT 'corr' AS kind, id, created_at,
           CASE WHEN correction_type = 'increase' THEN COALESCE(correction_amount, 0) ELSE -COALESCE(correction_amount, 0) END AS delta
    FROM public.balance_corrections
    WHERE store_id = p_store_id AND status = 'approved'
    ORDER BY created_at
  ) LOOP
    IF rec.kind = 'sale' THEN
      UPDATE public.sales
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'txn' THEN
      UPDATE public.transactions
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'pay_ret' THEN
      UPDATE public.payment_returns
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'adj' THEN
      UPDATE public.balance_adjustments
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'corr' THEN
      UPDATE public.balance_corrections
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    END IF;
    v_running := v_running + rec.delta;
  END LOOP;
END;
$$;

-- 3. Force recalculation of outstanding and running balances for all stores
DO $$
DECLARE
  v_store RECORD;
BEGIN
  FOR v_store IN SELECT id FROM public.stores LOOP
    -- Recalculate store outstanding
    UPDATE public.stores s
    SET outstanding = (
      SELECT
        COALESCE(st.opening_balance, 0)
        + COALESCE((
            SELECT SUM(COALESCE(s_val.total_amount, 0) - COALESCE(s_val.cash_amount, 0) - COALESCE(s_val.upi_amount, 0))
            FROM public.sales s_val
            WHERE s_val.store_id = v_store.id AND s_val.deleted_at IS NULL AND s_val.is_fully_returned = false
          ), 0)
        - COALESCE((
            SELECT SUM(COALESCE(t.total_amount, 0))
            FROM public.transactions t
            WHERE t.store_id = v_store.id AND t.deleted_at IS NULL
          ), 0)
        -- OMITted sale_returns entirely
        + COALESCE((
            SELECT SUM(COALESCE(pr.return_amount, 0))
            FROM public.payment_returns pr
            WHERE pr.store_id = v_store.id AND pr.status = 'completed'
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(ba.adjustment_amount, 0))
            FROM public.balance_adjustments ba
            WHERE ba.store_id = v_store.id
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store.id AND bc.status = 'approved' AND bc.correction_type = 'increase'
          ), 0)
        - COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store.id AND bc.status = 'approved' AND bc.correction_type = 'decrease'
          ), 0)
      FROM public.stores st
      WHERE st.id = v_store.id
    ),
    updated_at = now()
    WHERE s.id = v_store.id;

    -- Recalculate running balances
    PERFORM public.recalc_running_balances(v_store.id);
  END LOOP;
END;
$$;
