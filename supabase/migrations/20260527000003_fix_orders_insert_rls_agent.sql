-- Fix: Agent role was missing from the "Staff can insert orders" RLS policy.
-- Agents could view and update orders but not create them.

DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;

CREATE POLICY "Staff can insert orders" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR has_role(auth.uid(), 'marketer')
    OR has_role(auth.uid(), 'operator')
    OR (
      has_role(auth.uid(), 'customer')
      AND customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    )
  );
