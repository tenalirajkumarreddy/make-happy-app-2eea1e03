-- Migration: Add Customer Role to Payment Returns RLS
-- Date: 2026-06-15
-- Priority: P1 - HIGH (Access Control)
--
-- Issue: payment_returns RLS policies only allow staff roles (super_admin, manager, agent)
-- and the user who created the return. Customers cannot view their own payment returns.
-- Fix: Add customer role with scoped access to their own customer_id.

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view own payment_returns" ON public.payment_returns;
DROP POLICY IF EXISTS "Staff can insert payment_returns" ON public.payment_returns;
DROP POLICY IF EXISTS "Admins/managers can manage payment_returns" ON public.payment_returns;

-- Recreate with customer role included
CREATE POLICY "Staff can view own payment_returns" ON public.payment_returns
FOR SELECT
TO authenticated
USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR has_role(auth.uid(), 'operator')
    OR has_role(auth.uid(), 'marketer')
    OR recorded_by = auth.uid()
    OR logged_by = auth.uid()
    OR (
        has_role(auth.uid(), 'customer')
        AND customer_id = (
            SELECT id FROM public.customers WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Staff can insert payment_returns" ON public.payment_returns
FOR INSERT
TO authenticated
WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR has_role(auth.uid(), 'operator')
    OR has_role(auth.uid(), 'marketer')
);

-- Admins/managers can manage (update/delete) all payment returns
CREATE POLICY "Admins/managers can manage payment_returns" ON public.payment_returns
FOR ALL
TO authenticated
USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
)
WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
);