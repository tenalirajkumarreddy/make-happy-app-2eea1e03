-- Migration: Normalize `pos` role to `operator` across the codebase
-- The `app_role` enum originally had 'pos' but later code migrated to 'operator'.
-- This migration completes the transition: adds 'operator' to the enum, migrates
-- existing 'pos' data to 'operator', and updates all policies/functions that
-- still reference 'pos'.

-- ============================================================
-- STEP 1: Add `operator` to the app_role enum
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operator' BEFORE 'customer';

-- ============================================================
-- STEP 2: Migrate existing 'pos' role values to 'operator'
-- ============================================================
UPDATE public.user_roles
SET role = 'operator'::public.app_role
WHERE role = 'pos'::public.app_role;

-- ============================================================
-- STEP 3: Recreate `get_all_staff_balances` — replace 'pos' with 'operator'
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
 RETURNS TABLE(user_id uuid, full_name text, role text, holding_balance numeric, today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r RECORD;
    v_today DATE := CURRENT_DATE;
    v_today_sales NUMERIC;
    v_today_payments NUMERIC;
    v_today_received NUMERIC;
    v_today_sent_confirmed NUMERIC;
    v_prev_pending NUMERIC;
    v_total_holding NUMERIC;
BEGIN
    FOR r IN
        SELECT p.user_id, p.full_name, pr.role, COALESCE(p.holding_balance, 0) as holding
        FROM public.profiles p
        JOIN public.user_roles pr ON p.user_id = pr.user_id
        WHERE pr.role IN ('agent', 'operator', 'marketer', 'manager', 'super_admin')
        AND p.deleted_at IS NULL
    LOOP
        v_total_holding := r.holding;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_sales
        FROM public.sales s
        WHERE s.recorded_by = r.user_id AND DATE(s.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_payments
        FROM public.transactions t
        WHERE t.recorded_by = r.user_id AND DATE(t.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_received
        FROM public.handovers h
        WHERE h.handed_to = r.user_id AND h.status = 'confirmed' AND DATE(h.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_sent_confirmed
        FROM public.handovers h
        WHERE h.user_id = r.user_id AND h.status = 'confirmed' AND DATE(h.created_at) = v_today;

        v_prev_pending := v_total_holding - (v_today_sales + v_today_payments + v_today_received - v_today_sent_confirmed);

        user_id := r.user_id;
        full_name := r.full_name;
        role := r.role;
        holding_balance := v_total_holding;
        today_sales := v_today_sales;
        today_payments := v_today_payments;
        today_received := v_today_received;
        today_sent_confirmed := v_today_sent_confirmed;
        prev_pending := v_prev_pending;
        total_holding := v_total_holding;
        RETURN NEXT;
    END LOOP;
END;
$function$;

-- ============================================================
-- STEP 4: Recreate RLS policies that reference 'pos'
-- These were originally defined in ACTIVE_SQL.sql and never updated
-- by later migrations, meaning 'operator' role would be DENIED access
-- to customers, stores, sales, and transactions.
-- ============================================================

-- 4a. Customers
DROP POLICY IF EXISTS "Staff can view all customers" ON public.customers;
CREATE POLICY "Staff can view all customers"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer', 'operator')
    )
  );

-- 4b. Stores
DROP POLICY IF EXISTS "Staff can view all stores" ON public.stores;
CREATE POLICY "Staff can view all stores"
  ON public.stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer', 'operator')
    )
  );

-- 4c. Sales
DROP POLICY IF EXISTS "Staff can view all sales" ON public.sales;
CREATE POLICY "Staff can view all sales"
  ON public.sales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

DROP POLICY IF EXISTS "Agents/POS can create sales" ON public.sales;
CREATE POLICY "Agents/Operators can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    auth.uid() = recorded_by
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('agent', 'operator', 'super_admin', 'manager')
    )
  );

-- 4d. Sale Items
DROP POLICY IF EXISTS "Staff can view sale items" ON public.sale_items;
CREATE POLICY "Staff can view sale items"
  ON public.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

DROP POLICY IF EXISTS "Staff can insert sale items" ON public.sale_items;
CREATE POLICY "Staff can insert sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

-- 4e. Transactions
DROP POLICY IF EXISTS "Staff can view all transactions" ON public.transactions;
CREATE POLICY "Staff can view all transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

DROP POLICY IF EXISTS "Agents/POS can create transactions" ON public.transactions;
CREATE POLICY "Agents/Operators can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    auth.uid() = recorded_by
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('agent', 'operator', 'super_admin', 'manager')
    )
  );
