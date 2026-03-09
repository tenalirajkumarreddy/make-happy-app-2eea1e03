
-- 1. Fix profiles SELECT: staff can see all, others only own
DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;

CREATE POLICY "Staff can view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'agent'::app_role)
  OR public.has_role(auth.uid(), 'marketer'::app_role)
  OR public.has_role(auth.uid(), 'pos'::app_role)
  OR (user_id = auth.uid())
);

-- 2. Fix balance_adjustments INSERT: require privileged role
DROP POLICY IF EXISTS "Authorized staff can insert balance adjustments" ON public.balance_adjustments;

CREATE POLICY "Staff can insert balance adjustments" ON public.balance_adjustments
FOR INSERT TO authenticated
WITH CHECK (
  (adjusted_by = auth.uid())
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'agent'::app_role)
  )
);

-- 3. Fix user_roles SELECT: users see own, admins/managers see all
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;

CREATE POLICY "Users can view own role" ON public.user_roles
FOR SELECT TO authenticated
USING (
  (user_id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 4. Fix store_qr_codes SELECT: staff + own stores for customers
DROP POLICY IF EXISTS "Authenticated can view store QR codes" ON public.store_qr_codes;

CREATE POLICY "Staff and store owners can view QR codes" ON public.store_qr_codes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'agent'::app_role)
  OR public.has_role(auth.uid(), 'marketer'::app_role)
  OR public.has_role(auth.uid(), 'pos'::app_role)
  OR (store_id IN (
    SELECT s.id FROM public.stores s
    JOIN public.customers c ON s.customer_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);
