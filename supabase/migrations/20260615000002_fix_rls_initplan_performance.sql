-- Fix RLS InitPlan Performance Issues
-- Date: 2026-06-15
--
-- Problem: 279 RLS policies re-evaluate auth.uid() per row, causing O(n) overhead.
-- Fix: Replace auth.uid() with (select auth.uid()) so it evaluates once per query.
--
-- This migration rebuilds core RLS policies using the initplan optimization.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- =========================================================

-- =========================================================
-- 1. SALES TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read sales" ON public.sales;
CREATE POLICY "Allow authed users to read sales"
  ON public.sales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
    OR recorded_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow agents to insert sales" ON public.sales;
CREATE POLICY "Allow agents to insert sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    recorded_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

DROP POLICY IF EXISTS "Allow agents to update own sales" ON public.sales;
CREATE POLICY "Allow agents to update own sales"
  ON public.sales FOR UPDATE
  USING (
    recorded_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager')
    )
  );

-- =========================================================
-- 2. TRANSACTIONS TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read transactions" ON public.transactions;
CREATE POLICY "Allow authed users to read transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
    OR recorded_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow agents to insert transactions" ON public.transactions;
CREATE POLICY "Allow agents to insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    recorded_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );

-- =========================================================
-- 3. STORES TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read stores" ON public.stores;
CREATE POLICY "Allow authed users to read stores"
  ON public.stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer', 'customer')
    )
  );

DROP POLICY IF EXISTS "Allow managers to update stores" ON public.stores;
CREATE POLICY "Allow managers to update stores"
  ON public.stores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager')
    )
  );

-- =========================================================
-- 4. CUSTOMERS TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read customers" ON public.customers;
CREATE POLICY "Allow authed users to read customers"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer', 'customer')
    )
  );

DROP POLICY IF EXISTS "Allow agents to update customers" ON public.customers;
CREATE POLICY "Allow agents to update customers"
  ON public.customers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent')
    )
  );

-- =========================================================
-- 5. PRODUCTS TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read products" ON public.products;
CREATE POLICY "Allow authed users to read products"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer', 'customer')
    )
  );

DROP POLICY IF EXISTS "Allow managers to manage products" ON public.products;
CREATE POLICY "Allow managers to manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'operator')
    )
  );

-- =========================================================
-- 6. ORDERS TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read orders" ON public.orders;
CREATE POLICY "Allow authed users to read orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer', 'customer')
    )
    OR created_by = (select auth.uid())
    OR assigned_to = (select auth.uid())
    OR fulfilled_by = (select auth.uid())
  );

-- =========================================================
-- 7. ACTIVITY_LOGS TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read activity logs" ON public.activity_logs;
CREATE POLICY "Allow authed users to read activity logs"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
    OR user_id = (select auth.uid())
  );

-- =========================================================
-- 8. USER_ROLES TABLE (read-only for authenticated)
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read user_roles" ON public.user_roles;
CREATE POLICY "Allow authed users to read user_roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
    )
  );

-- =========================================================
-- 9. PROFILES TABLE
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read profiles" ON public.profiles;
CREATE POLICY "Allow authed users to read profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Allow users to update own profile" ON public.profiles;
CREATE POLICY "Allow users to update own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = (select auth.uid()));

-- =========================================================
-- 10. FINANCIAL TABLES (expenses, handovers, expense_claims)
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read expenses" ON public.expenses;
CREATE POLICY "Allow authed users to read expenses"
  ON public.expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
    OR recorded_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow authed users to read handovers" ON public.handovers;
CREATE POLICY "Allow authed users to read handovers"
  ON public.handovers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
    OR user_id = (select auth.uid())
    OR handed_to = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow authed users to read expense_claims" ON public.expense_claims;
CREATE POLICY "Allow authed users to read expense_claims"
  ON public.expense_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
    OR user_id = (select auth.uid())
  );

-- =========================================================
-- 11. INVENTORY TABLES
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read product_stock" ON public.product_stock;
CREATE POLICY "Allow authed users to read product_stock"
  ON public.product_stock FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
  );

DROP POLICY IF EXISTS "Allow authed users to read staff_stock" ON public.staff_stock;
CREATE POLICY "Allow authed users to read staff_stock"
  ON public.staff_stock FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
    OR user_id = (select auth.uid())
  );

-- =========================================================
-- 12. ROUTE & STORE ACCESS TABLES
-- =========================================================

DROP POLICY IF EXISTS "Allow authed users to read routes" ON public.routes;
CREATE POLICY "Allow authed users to read routes"
  ON public.routes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
  );

DROP POLICY IF EXISTS "Allow authed users to read agent_routes" ON public.agent_routes;
CREATE POLICY "Allow authed users to read agent_routes"
  ON public.agent_routes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
  );

-- =========================================================
-- Summary of changes:
-- - All auth.uid() calls wrapped in (select auth.uid()) for initplan optimization
-- - Consolidated multiple overlapping permissive policies
-- - Maintained existing business logic and role checks
-- =========================================================