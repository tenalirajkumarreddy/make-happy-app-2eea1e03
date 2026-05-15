-- Fix RLS policies for balance_corrections and payment_returns
-- Issue: Both tables have RLS enabled but NO policies — all access blocked

-- =====================================================
-- BALANCE CORRECTIONS
-- =====================================================

-- SELECT: Staff (super_admin, manager, agent) can view corrections for their scope
-- + the user who created the correction can see their own
CREATE POLICY "Staff can view balance_corrections" ON public.balance_corrections
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR recorded_by = auth.uid()  -- creators can see their own
  );

-- INSERT: Staff with role can create corrections
CREATE POLICY "Staff can insert balance_corrections" ON public.balance_corrections
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
  );

-- UPDATE: Managers/admins can approve, agent creators can update status
CREATE POLICY "Staff can update balance_corrections" ON public.balance_corrections
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR recorded_by = auth.uid()  -- creators can update before approval
  );

-- DELETE: Only super_admin can hard delete corrections (admin action)
CREATE POLICY "Admins can delete balance_corrections" ON public.balance_corrections
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

-- =====================================================
-- PAYMENT_RETURNS
-- =====================================================

-- SELECT: Staff can view returns scoped to their access
CREATE POLICY "Staff can view payment_returns" ON public.payment_returns
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
    OR recorded_by = auth.uid()
  );

-- INSERT: Staff can record returns
CREATE POLICY "Staff can insert payment_returns" ON public.payment_returns
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent')
  );

-- UPDATE: Staff can update (status change, notes), only admin can delete
CREATE POLICY "Staff can update payment_returns" ON public.payment_returns
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
    OR recorded_by = auth.uid()
  );

-- DELETE: Only super_admin
CREATE POLICY "Admins can delete payment_returns" ON public.payment_returns
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));