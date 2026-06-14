-- Migration: Add Customer Role to Sales RLS
-- Date: 2026-06-14
-- Priority: P0 - CRITICAL (Access Control)
--
-- Issue Fixed:
-- Customer role was excluded from sales SELECT RLS policy, preventing customers
-- from viewing their own sales in the customer portal.
--
-- Fix:
-- Add customer role to sales SELECT policy, scoped to their own customer_id

-- Drop existing policy
DROP POLICY IF EXISTS "Staff can view sales" ON public.sales;

-- Recreate with customer role included
CREATE POLICY "Staff can view sales" ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND customer_id = (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
);

-- Also ensure customers can view sale_items for their sales
DROP POLICY IF EXISTS "Staff can view sale items" ON public.sale_items;

CREATE POLICY "Staff can view sale items" ON public.sale_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND sale_id IN (
      SELECT id FROM public.sales WHERE customer_id = (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
  )
);