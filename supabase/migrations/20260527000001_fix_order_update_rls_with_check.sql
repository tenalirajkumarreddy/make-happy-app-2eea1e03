-- Fix RLS for orders UPDATE: add WITH CHECK clause so agents can actually cancel
-- Previously, USING double-served as WITH CHECK, causing "new row violates RLS" errors
-- because the new status='cancelled' failed the status='pending' check.

DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status = 'pending')
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid())
    OR has_role(auth.uid(), 'operator')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status IN ('pending', 'cancelled'))
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid() AND status IN ('pending', 'cancelled'))
    OR has_role(auth.uid(), 'operator')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
