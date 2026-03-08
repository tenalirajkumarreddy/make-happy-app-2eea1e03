-- Fix all RLS policies: drop RESTRICTIVE and recreate as PERMISSIVE
-- The policies were created as RESTRICTIVE which requires ALL to pass (AND logic)
-- They need to be PERMISSIVE so any matching policy grants access (OR logic)

-- ===== PROFILES =====
DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== USER_ROLES =====
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Authenticated can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- ===== PRODUCTS =====
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;
DROP POLICY IF EXISTS "Admin can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin can update products" ON public.products;
DROP POLICY IF EXISTS "Admin can delete products" ON public.products;

CREATE POLICY "Authenticated can view products" ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can update products" ON public.products
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete products" ON public.products
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- ===== STORE_TYPES =====
DROP POLICY IF EXISTS "Authenticated can view store types" ON public.store_types;
DROP POLICY IF EXISTS "Admin can insert store types" ON public.store_types;
DROP POLICY IF EXISTS "Admin can update store types" ON public.store_types;
DROP POLICY IF EXISTS "Admin can delete store types" ON public.store_types;

CREATE POLICY "Authenticated can view store types" ON public.store_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert store types" ON public.store_types
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update store types" ON public.store_types
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete store types" ON public.store_types
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- ===== CUSTOMERS =====
DROP POLICY IF EXISTS "Staff can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admin/Manager can update customers" ON public.customers;

CREATE POLICY "Staff can view all customers" ON public.customers
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'agent') OR
    public.has_role(auth.uid(), 'marketer') OR
    user_id = auth.uid()
  );
CREATE POLICY "Staff can insert customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'agent') OR
    public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ===== STORES =====
DROP POLICY IF EXISTS "Staff can view all stores" ON public.stores;
DROP POLICY IF EXISTS "Staff can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Admin/Manager can update stores" ON public.stores;

CREATE POLICY "Staff can view all stores" ON public.stores
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'agent') OR
    public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Staff can insert stores" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'agent') OR
    public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update stores" ON public.stores
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ===== ROUTES =====
DROP POLICY IF EXISTS "Staff can view routes" ON public.routes;
DROP POLICY IF EXISTS "Admin can insert routes" ON public.routes;
DROP POLICY IF EXISTS "Admin can update routes" ON public.routes;
DROP POLICY IF EXISTS "Admin can delete routes" ON public.routes;

CREATE POLICY "Staff can view routes" ON public.routes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager') OR
    public.has_role(auth.uid(), 'agent')
  );
CREATE POLICY "Admin can insert routes" ON public.routes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update routes" ON public.routes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete routes" ON public.routes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
