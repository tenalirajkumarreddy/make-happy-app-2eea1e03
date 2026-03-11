-- ============================================================================
-- Fix 1 (High): Balance recalculation race condition
--   Postgres trigger recomputes stores.outstanding from first principles after
--   any INSERT / UPDATE / DELETE on sales or transactions.
--   This replaces the JS delta-math and eliminates the read-modify-write race.
-- ============================================================================

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

  UPDATE public.stores
  SET outstanding = (
    SELECT
      COALESCE(st.opening_balance, 0)
      + COALESCE((
          SELECT SUM(s2.outstanding_amount)
          FROM public.sales s2
          WHERE s2.store_id = v_store_id
        ), 0)
      - COALESCE((
          SELECT SUM(t.total_amount)
          FROM public.transactions t
          WHERE t.store_id = v_store_id
        ), 0)
    FROM public.stores st
    WHERE st.id = v_store_id
  )
  WHERE id = v_store_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_recalc_outstanding        ON public.sales;
DROP TRIGGER IF EXISTS trg_transactions_recalc_outstanding ON public.transactions;

CREATE TRIGGER trg_sales_recalc_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

CREATE TRIGGER trg_transactions_recalc_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();


-- ============================================================================
-- Fix 1 (High): Helper — rebuild per-row old/new_outstanding snapshots
--   Called after a backdated insert so historical display values stay accurate.
-- ============================================================================

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
           (total_amount - cash_amount - upi_amount) AS delta
    FROM public.sales
    WHERE store_id = p_store_id
    UNION ALL
    SELECT 'txn' AS kind, id, created_at,
           -total_amount AS delta
    FROM public.transactions
    WHERE store_id = p_store_id
    ORDER BY created_at
  ) LOOP
    IF rec.kind = 'sale' THEN
      UPDATE public.sales
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSE
      UPDATE public.transactions
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    END IF;
    v_running := v_running + rec.delta;
  END LOOP;
END;
$$;


-- ============================================================================
-- Fix 2 (Medium): Atomic sale insert
--   All steps (insert sale, insert sale_items, deliver pending orders, handle
--   backdated recalc) run inside a single implicit Postgres transaction.
--   SELECT … FOR UPDATE on the store row also serialises concurrent inserts
--   for the same store, eliminating the remaining race window.
--
-- Fix 3 (Medium): Backend credit limit enforcement
--   Non-admin callers (agents, marketer, pos) are blocked at the DB layer if
--   the new outstanding would exceed the resolved credit limit.
--   Admins / managers may always proceed (intentional override capability).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id         TEXT,
  p_store_id           UUID,
  p_customer_id        UUID,
  p_recorded_by        UUID,
  p_logged_by          UUID,
  p_total_amount       NUMERIC,
  p_cash_amount        NUMERIC,
  p_upi_amount         NUMERIC,
  p_outstanding_amount NUMERIC,
  p_sale_items         JSONB,
  p_created_at         TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id             UUID;
  v_old_outstanding     NUMERIC;
  v_new_outstanding     NUMERIC;
  v_credit_limit        NUMERIC := 0;
  v_store_type_id       UUID;
  v_store_customer_id   UUID;
  v_kyc_status          TEXT;
  v_credit_limit_override NUMERIC;
  v_caller_is_admin     BOOLEAN;
BEGIN
  -- Reject unauthenticated calls (belt-and-suspenders alongside RLS)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the store row for the duration of this transaction.
  -- Any concurrent call for the same store will wait here, ensuring
  -- each agent reads the *committed* balance before writing.
  SELECT s.outstanding, s.store_type_id, s.customer_id
  INTO   v_old_outstanding, v_store_type_id, v_store_customer_id
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  v_new_outstanding := v_old_outstanding + p_outstanding_amount;

  -- ── Credit limit resolution (customer override > store-type default) ───

  SELECT c.kyc_status, c.credit_limit_override
  INTO   v_kyc_status, v_credit_limit_override
  FROM   public.customers c
  WHERE  c.id = v_store_customer_id;

  IF v_credit_limit_override IS NOT NULL THEN
    v_credit_limit := v_credit_limit_override;
  ELSE
    SELECT CASE
             WHEN v_kyc_status = 'approved'
             THEN COALESCE(credit_limit_kyc, 0)
             ELSE COALESCE(credit_limit_no_kyc, 0)
           END
    INTO   v_credit_limit
    FROM   public.store_types
    WHERE  id = v_store_type_id;
  END IF;

  -- ── Backend credit-limit gate (admins/managers may override) ───────────

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'manager')
  ) INTO v_caller_is_admin;

  IF v_credit_limit > 0
     AND v_new_outstanding > v_credit_limit
     AND NOT v_caller_is_admin
  THEN
    RAISE EXCEPTION 'credit_limit_exceeded';
  END IF;

  -- ── Atomic sale + items insert ─────────────────────────────────────────

  INSERT INTO public.sales (
    display_id, store_id, customer_id, recorded_by, logged_by,
    total_amount, cash_amount, upi_amount, outstanding_amount,
    old_outstanding, new_outstanding, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    p_total_amount, p_cash_amount, p_upi_amount, p_outstanding_amount,
    v_old_outstanding, v_new_outstanding,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    (item->>'total_price')::NUMERIC
  FROM jsonb_array_elements(p_sale_items) AS item;

  -- ── Auto-deliver pending orders for this store ─────────────────────────

  UPDATE public.orders
  SET status = 'delivered', delivered_at = now()
  WHERE store_id = p_store_id AND status = 'pending';

  -- ── Backdated insert: rebuild per-row running balance snapshots ─────────
  -- stores.outstanding is already correct via the trigger on sales INSERT.
  -- We also fix the old/new_outstanding on every historical row so reports
  -- stay accurate.

  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale           TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_running_balances TO authenticated;
