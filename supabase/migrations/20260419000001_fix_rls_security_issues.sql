-- Migration: Fix RLS Security Issues
-- Based on Supabase security advisor findings
-- Date: 2026-04-19

-- =====================================================
-- 1. Enable RLS on tables that are missing it
-- =====================================================

-- Enable RLS on income table
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;

-- Enable RLS on staff_cash_accounts table
ALTER TABLE public.staff_cash_accounts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on handover_requests table
ALTER TABLE public.handover_requests ENABLE ROW LEVEL SECURITY;

-- Enable RLS on worker_roles table
ALTER TABLE public.worker_roles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on payroll_items table
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

-- Enable RLS on payrolls table
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;

-- Enable RLS on purchase_orders table
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Enable RLS on delivery_trips table
ALTER TABLE public.delivery_trips ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. Create RLS policies for income table
-- =====================================================

-- Policy: Super admins can do everything
CREATE POLICY "Super admins have full access to income"
ON public.income
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Policy: Managers can view income
CREATE POLICY "Managers can view income"
ON public.income
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- =====================================================
-- 3. Create RLS policies for staff_cash_accounts table
-- =====================================================

-- Policy: Users can view their own cash account
CREATE POLICY "Users can view own cash account"
ON public.staff_cash_accounts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to staff_cash_accounts"
ON public.staff_cash_accounts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Policy: Managers can view all staff cash accounts
CREATE POLICY "Managers can view staff cash accounts"
ON public.staff_cash_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- =====================================================
-- 4. Create RLS policies for handover_requests table
-- =====================================================

-- Policy: Users can view handover requests they sent or received
CREATE POLICY "Users can view their handover requests"
ON public.handover_requests
FOR SELECT
TO authenticated
USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid()
);

-- Policy: Users can create handover requests
CREATE POLICY "Users can create handover requests"
ON public.handover_requests
FOR INSERT
TO authenticated
WITH CHECK (from_user_id = auth.uid());

-- Policy: Users can update their own handover requests
CREATE POLICY "Users can update their handover requests"
ON public.handover_requests
FOR UPDATE
TO authenticated
USING (from_user_id = auth.uid() OR to_user_id = auth.uid())
WITH CHECK (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to handover_requests"
ON public.handover_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- =====================================================
-- 5. Create RLS policies for worker_roles table
-- =====================================================

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to worker_roles"
ON public.worker_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Policy: Managers can view worker roles
CREATE POLICY "Managers can view worker_roles"
ON public.worker_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- =====================================================
-- 6. Create RLS policies for payroll tables
-- =====================================================

-- Payroll items
CREATE POLICY "Users can view their own payroll items"
ON public.payroll_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payrolls p
    WHERE p.id = payroll_items.payroll_id
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Super admins have full access to payroll_items"
ON public.payroll_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Payrolls
CREATE POLICY "Users can view their own payrolls"
ON public.payrolls
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Super admins have full access to payrolls"
ON public.payrolls
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

CREATE POLICY "Managers can view payrolls"
ON public.payrolls
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- =====================================================
-- 7. Create RLS policies for purchase_orders table
-- =====================================================

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to purchase_orders"
ON public.purchase_orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Policy: Managers can view purchase orders
CREATE POLICY "Managers can view purchase_orders"
ON public.purchase_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- Policy: Creators can view their own purchase orders
CREATE POLICY "Creators can view own purchase_orders"
ON public.purchase_orders
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- =====================================================
-- 8. Create RLS policies for delivery_trips table
-- =====================================================

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to delivery_trips"
ON public.delivery_trips
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Policy: Managers can view delivery trips
CREATE POLICY "Managers can view delivery_trips"
ON public.delivery_trips
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- Policy: Assigned drivers can view their trips
CREATE POLICY "Drivers can view assigned delivery_trips"
ON public.delivery_trips
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

-- =====================================================
-- 9. Fix overly permissive policies on stock_transfers
-- =====================================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to insert stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Allow authenticated users to update stock_transfers" ON public.stock_transfers;

-- Create proper policies for stock_transfers
CREATE POLICY "Super admins have full access to stock_transfers"
ON public.stock_transfers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

CREATE POLICY "Managers can manage stock_transfers"
ON public.stock_transfers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

CREATE POLICY "Agents can view stock_transfers for their warehouse"
ON public.stock_transfers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.staff_stock ss ON ss.user_id = auth.uid()
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('super_admin', 'manager', 'agent')
    AND (ss.warehouse_id = stock_transfers.from_warehouse_id
         OR ss.warehouse_id = stock_transfers.to_warehouse_id)
  )
);

-- =====================================================
-- 10. Fix overly permissive policies on vendor_transactions
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow authenticated users to insert vendor_transactions" ON public.vendor_transactions;

-- Create proper policies
CREATE POLICY "Super admins have full access to vendor_transactions"
ON public.vendor_transactions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

CREATE POLICY "Managers can manage vendor_transactions"
ON public.vendor_transactions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

CREATE POLICY "Users can view vendor_transactions"
ON public.vendor_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- 11. Fix storage bucket listing permissions
-- =====================================================

-- The entity-photos bucket has a broad SELECT policy that allows listing
-- We need to make it more restrictive - only allow getting specific objects, not listing

-- First, check if we can modify storage policies via SQL
-- If not, this needs to be done via the Supabase dashboard or storage API

COMMENT ON TABLE public.income IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.staff_cash_accounts IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.handover_requests IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.worker_roles IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.payroll_items IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.payrolls IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.purchase_orders IS 'RLS enabled on 2026-04-19';
COMMENT ON TABLE public.delivery_trips IS 'RLS enabled on 2026-04-19';

-- Add migration metadata
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260419000001', 'fix_rls_security_issues', now());
