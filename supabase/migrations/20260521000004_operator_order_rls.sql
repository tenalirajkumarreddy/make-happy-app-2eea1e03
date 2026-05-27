-- Add operator role to orders RLS policies

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

-- Recreate with operator included
CREATE POLICY "Staff can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR has_role(auth.uid(), 'marketer')
    OR has_role(auth.uid(), 'operator')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

CREATE POLICY "Staff can insert orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'marketer')
    OR has_role(auth.uid(), 'operator')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status = 'pending')
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid())
    OR has_role(auth.uid(), 'operator')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

-- Fix order_items RLS — operator was missing from the role allowlist
DROP POLICY IF EXISTS "View order items" ON order_items;
CREATE POLICY "View order items" ON order_items
  FOR SELECT TO authenticated
  USING (
    (order_id IN (SELECT orders.id FROM orders WHERE orders.deleted_at IS NULL))
    AND (order_items.deleted_at IS NULL)
    AND (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'agent'::app_role, 'marketer'::app_role, 'operator'::app_role])))
  );
