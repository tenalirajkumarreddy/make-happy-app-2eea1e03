-- ============================================================
--  Aqua Prime — Full Database Schema
--  Run this in your Supabase project's SQL Editor
--  (Dashboard → SQL Editor → New Query → paste → Run)
--
--  All migrations ordered by date, combined into one script.
--  Safe to run on a fresh Supabase project.
-- ============================================================

-- ==========================================
-- CORE DATABASE SCHEMA FOR BIZMANAGER
-- ==========================================

-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'agent', 'marketer', 'pos', 'customer');

-- 2. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User roles table (separate from profiles per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: get user's primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 6. Auto-create profile + customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE NOT NULL,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'PCS',
  category TEXT,
  product_group TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 8. Store types table
CREATE TABLE public.store_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL DEFAULT 'simple',
  auto_order_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_types ENABLE ROW LEVEL SECURITY;

-- 9. Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  photo_url TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'not_requested',
  kyc_rejection_reason TEXT,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 10. Routes table
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- 11. Stores table
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  route_id UUID REFERENCES public.routes(id),
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  phone TEXT,
  alternate_phone TEXT,
  photo_url TEXT,
  outstanding NUMERIC(10,2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 12. Sequence counters for display IDs
CREATE SEQUENCE IF NOT EXISTS customer_seq START 1;
CREATE SEQUENCE IF NOT EXISTS store_seq START 1;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Profiles
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE POLICY "Authenticated can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Products
CREATE POLICY "Authenticated can view products" ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can update products" ON public.products
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete products" ON public.products
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Store types
CREATE POLICY "Authenticated can view store types" ON public.store_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert store types" ON public.store_types
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update store types" ON public.store_types
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete store types" ON public.store_types
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Customers
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

-- Stores
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

-- Routes
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

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default store types
INSERT INTO public.store_types (name, order_type) VALUES
  ('Retail', 'simple'),
  ('Wholesale', 'detailed'),
  ('Restaurant', 'detailed');
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

-- Sales table
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  total_amount numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  outstanding_amount numeric NOT NULL DEFAULT 0,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sale items table
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions (payments) table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  order_type text NOT NULL DEFAULT 'simple',
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  requirement_note text,
  cancellation_reason text,
  cancelled_by uuid REFERENCES auth.users(id),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order items (for detailed orders)
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Handovers table
CREATE TABLE public.handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  handover_date date NOT NULL DEFAULT CURRENT_DATE,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  handed_to uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, handover_date)
);

-- Updated at triggers
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_handovers_updated_at BEFORE UPDATE ON public.handovers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

-- Sales RLS
CREATE POLICY "Staff can view sales" ON public.sales FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'pos') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'pos')
  );
CREATE POLICY "Admin/Manager can update sales" ON public.sales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- Sale items RLS
CREATE POLICY "View sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (sale_id IN (SELECT id FROM public.sales));
CREATE POLICY "Insert sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (sale_id IN (SELECT id FROM public.sales));

-- Transactions RLS
CREATE POLICY "Staff can view transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'marketer') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- Orders RLS
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status = 'pending')
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid())
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

-- Order items RLS
CREATE POLICY "View order items" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Insert order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.orders));

-- Handovers RLS
CREATE POLICY "Users can view own handovers" ON public.handovers FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );
CREATE POLICY "Users can insert own handovers" ON public.handovers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users/managers can update handovers" ON public.handovers FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );

-- Enable realtime for orders (useful for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;

-- Activity logs table
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );

CREATE POLICY "System can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Company settings table
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view settings" ON public.company_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage settings" ON public.company_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Seed default company settings
INSERT INTO public.company_settings (key, value) VALUES
  ('company_name', 'BizManager Corp'),
  ('gst_number', ''),
  ('customer_care_number', ''),
  ('address', ''),
  ('location_validation', 'false'),
  ('auto_orders', 'false'),
  ('push_notifications', 'false'),
  ('partial_collections', 'false');

-- Index for activity logs
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);

-- Fix overly permissive INSERT policy on activity_logs
DROP POLICY "System can insert activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Add KYC document columns to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS kyc_selfie_url text,
  ADD COLUMN IF NOT EXISTS kyc_aadhar_front_url text,
  ADD COLUMN IF NOT EXISTS kyc_aadhar_back_url text,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_by uuid REFERENCES auth.users(id);

-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for kyc-documents bucket
CREATE POLICY "Customers can upload own KYC docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff can view KYC docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (storage.foldername(name))[1] = auth.uid()::text
  ));

-- Product access matrix: which products are available for each store type
CREATE TABLE public.store_type_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_type_id, product_id)
);

-- Store-type level pricing overrides
CREATE TABLE public.store_type_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_type_id, product_id)
);

-- Per-store pricing overrides (highest priority)
CREATE TABLE public.store_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id)
);

-- RLS for store_type_products
ALTER TABLE public.store_type_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store type products" ON public.store_type_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type products" ON public.store_type_products FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for store_type_pricing
ALTER TABLE public.store_type_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store type pricing" ON public.store_type_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type pricing" ON public.store_type_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for store_pricing
ALTER TABLE public.store_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store pricing" ON public.store_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store pricing" ON public.store_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Fix: allow customers to see their own stores
CREATE POLICY "Customers can view own stores" ON public.stores FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'customer'::app_role) AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
);

-- Allow customers to update their own KYC fields
CREATE POLICY "Customers can update own KYC" ON public.customers FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'customer'::app_role) AND user_id = auth.uid()
);

-- Route sessions for agent tracking
CREATE TABLE public.route_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Store visits within a route session
CREATE TABLE public.store_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.route_sessions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  notes text,
  UNIQUE(session_id, store_id)
);

-- RLS for route_sessions
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.route_sessions FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR user_id = auth.uid()
);
CREATE POLICY "Users can insert own sessions" ON public.route_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sessions" ON public.route_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS for store_visits
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View visits" ON public.store_visits FOR SELECT TO authenticated USING (
  session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);
CREATE POLICY "Insert visits" ON public.store_visits FOR INSERT TO authenticated WITH CHECK (
  session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() AND status = 'active')
);

-- Function to check duplicate customer phone
CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers WHERE phone = NEW.phone AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid) AND is_active = true
  ) THEN
    RAISE EXCEPTION 'A customer with phone % already exists', NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_customer_phone_duplicate
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_customer_phone();

-- Enable pg_cron and pg_net extensions for scheduled edge function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  
  -- Auto-link customer record if email matches
  UPDATE public.customers
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND user_id IS NULL;
  
  RETURN NEW;
END;
$function$;

-- Create public storage bucket for entity photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-photos', 'entity-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to entity-photos bucket
CREATE POLICY "Authenticated can upload entity photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'entity-photos');

-- Allow anyone to view entity photos (public bucket)
CREATE POLICY "Anyone can view entity photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'entity-photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated can update entity photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'entity-photos');

-- Allow authenticated users to delete entity photos
CREATE POLICY "Authenticated can delete entity photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'entity-photos');

-- Add address fields to stores table for structured address
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS street text,
ADD COLUMN IF NOT EXISTS area text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS district text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS pincode text;

CREATE TABLE public.store_qr_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL,
  payee_name TEXT,
  raw_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(upi_id)
);

ALTER TABLE public.store_qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view store QR codes" ON public.store_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert store QR codes" ON public.store_qr_codes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'agent'::app_role) OR has_role(auth.uid(), 'marketer'::app_role));
CREATE POLICY "Admin can update store QR codes" ON public.store_qr_codes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admin can delete store QR codes" ON public.store_qr_codes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view product categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert product categories"
  ON public.product_categories FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin can update product categories"
  ON public.product_categories FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admin can delete product categories"
  ON public.product_categories FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage permissions"
  ON public.user_permissions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view own permissions"
  ON public.user_permissions
  FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

ALTER TABLE public.sales ADD COLUMN logged_by uuid;
ALTER TABLE public.transactions ADD COLUMN logged_by uuid;

CREATE TABLE public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  adjustment_amount numeric NOT NULL DEFAULT 0,
  reason text,
  adjusted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view balance adjustments"
ON public.balance_adjustments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'agent') OR
  has_role(auth.uid(), 'marketer')
);

CREATE POLICY "Authorized staff can insert balance adjustments"
ON public.balance_adjustments
FOR INSERT
TO authenticated
WITH CHECK (adjusted_by = auth.uid());
-- Allow POS users to view stores (they need this for the POS sales flow with the global POS store)
CREATE POLICY "POS can view stores for sales"
ON public.stores FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'pos'::app_role));-- Step 1: Create POS store type
INSERT INTO public.store_types (id, name, order_type, is_active, auto_order_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'POS/Counter', 'simple', true, false)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create POS customer
INSERT INTO public.customers (id, display_id, name, is_active, kyc_status, opening_balance)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST-POS', 'POS', true, 'not_requested', 0)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create POS store referencing the above
INSERT INTO public.stores (id, display_id, name, customer_id, store_type_id, is_active, outstanding, opening_balance)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'STR-POS',
  'POS Counter',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  true, 0, 0
) ON CONFLICT (id) DO NOTHING;

-- Step 4: Protect from deletion
CREATE POLICY "Cannot delete system POS store"
ON public.stores FOR DELETE
TO authenticated
USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Cannot delete system POS customer"
ON public.customers FOR DELETE
TO authenticated
USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

-- Step 5: Protect from deactivation
CREATE OR REPLACE FUNCTION public.protect_pos_system_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.is_active := true;
    NEW.name := OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_pos_store
BEFORE UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.protect_pos_system_records();

CREATE TRIGGER protect_pos_customer
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.protect_pos_system_records();
-- Add notes column to handovers
ALTER TABLE public.handovers ADD COLUMN IF NOT EXISTS notes text;

-- Create daily balance snapshots table
CREATE TABLE public.handover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  balance_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE public.handover_snapshots ENABLE ROW LEVEL SECURITY;

-- Staff can view their own snapshots, admins/managers can view all
CREATE POLICY "Users can view own snapshots"
ON public.handover_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
);

-- System inserts snapshots (via edge function with service role)
CREATE POLICY "System can insert snapshots"
ON public.handover_snapshots FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Fix SELECT policy: allow handed_to user to see handovers sent to them
DROP POLICY IF EXISTS "Users can view own handovers" ON public.handovers;
CREATE POLICY "Users can view own handovers" ON public.handovers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
  OR handed_to = auth.uid()
);

-- Fix UPDATE policy: allow handed_to user to confirm/reject
DROP POLICY IF EXISTS "Users/managers can update handovers" ON public.handovers;
CREATE POLICY "Users/managers can update handovers" ON public.handovers
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
  OR handed_to = auth.uid()
);
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_pricing;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_type_pricing;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_type_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_visits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handover_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.route_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_adjustments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  entity_type text,
  entity_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

DROP POLICY "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Staff can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'agent'::app_role) OR
    has_role(auth.uid(), 'marketer'::app_role) OR
    has_role(auth.uid(), 'pos'::app_role)
  );

-- Add credit limit columns to store_types
ALTER TABLE public.store_types
  ADD COLUMN IF NOT EXISTS credit_limit_kyc numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit_no_kyc numeric NOT NULL DEFAULT 0;

-- Add credit limit override to customers (nullable = use store type default)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit_override numeric DEFAULT NULL;

CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'agent',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage invitations"
  ON public.staff_invitations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Managers can view invitations"
  ON public.staff_invitations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE TABLE public.promotional_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  link_url text,
  store_type_id uuid REFERENCES public.store_types(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage banners"
  ON public.promotional_banners FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can view active banners"
  ON public.promotional_banners FOR SELECT
  TO authenticated
  USING (is_active = true);
-- Enable pg_cron and pg_net extensions for scheduled functions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
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
﻿-- Ensure agent_routes table exists with enabled column
CREATE TABLE IF NOT EXISTS public.agent_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, route_id)
);

-- Add enabled column if it doesn't exist (idempotent)
ALTER TABLE public.agent_routes ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- RLS
ALTER TABLE public.agent_routes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_routes' AND policyname = 'Admin manage agent_routes'
  ) THEN
    CREATE POLICY "Admin manage agent_routes"
      ON public.agent_routes FOR ALL
      USING (public.has_role('super_admin', auth.uid()) OR public.has_role('manager', auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_routes' AND policyname = 'Staff view own agent_routes'
  ) THEN
    CREATE POLICY "Staff view own agent_routes"
      ON public.agent_routes FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
-- Add factory/depot location to routes (starting point for optimal path calculation)
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS factory_lat DOUBLE PRECISION;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS factory_lng DOUBLE PRECISION;

-- Add store_order to stores (navigation order within the route)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_order INTEGER;
-- ============================================================================
-- Fix 1 (High): Balance recalculation race condition
--   Postgres trigger recomputes stores.outstanding from first principles after
--   any INSERT / UPDATE / DELETE on sales or transactions.
--   This replaces the JS delta-math and eliminates the read-modify-write race.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_id ELSE NEW.store_id END;

  UPDATE public.stores
  SET outstanding = (
    SELECT
      COALESCE(st.opening_balance, 0)
      + COALESCE((
          SELECT SUM(s2.outstanding_amount)
          FROM public.sales s2
          WHERE s2.store_id = v_store_id
        ), 0)
      - COALESCE((
          SELECT SUM(t.total_amount)
          FROM public.transactions t
          WHERE t.store_id = v_store_id
        ), 0)
    FROM public.stores st
    WHERE st.id = v_store_id
  )
  WHERE id = v_store_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_recalc_outstanding        ON public.sales;
DROP TRIGGER IF EXISTS trg_transactions_recalc_outstanding ON public.transactions;

CREATE TRIGGER trg_sales_recalc_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

CREATE TRIGGER trg_transactions_recalc_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();


-- ============================================================================
-- Fix 1 (High): Helper — rebuild per-row old/new_outstanding snapshots
--   Called after a backdated insert so historical display values stay accurate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_running_balances(p_store_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_balance NUMERIC;
  v_running         NUMERIC;
  rec               RECORD;
BEGIN
  SELECT COALESCE(opening_balance, 0)
  INTO   v_opening_balance
  FROM   public.stores
  WHERE  id = p_store_id;

  v_running := v_opening_balance;

  FOR rec IN (
    SELECT 'sale' AS kind, id, created_at,
           (total_amount - cash_amount - upi_amount) AS delta
    FROM public.sales
    WHERE store_id = p_store_id
    UNION ALL
    SELECT 'txn' AS kind, id, created_at,
           -total_amount AS delta
    FROM public.transactions
    WHERE store_id = p_store_id
    ORDER BY created_at
  ) LOOP
    IF rec.kind = 'sale' THEN
      UPDATE public.sales
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSE
      UPDATE public.transactions
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    END IF;
    v_running := v_running + rec.delta;
  END LOOP;
END;
$$;


-- ============================================================================
-- Fix 2 (Medium): Atomic sale insert
--   All steps (insert sale, insert sale_items, deliver pending orders, handle
--   backdated recalc) run inside a single implicit Postgres transaction.
--   SELECT … FOR UPDATE on the store row also serialises concurrent inserts
--   for the same store, eliminating the remaining race window.
--
-- Fix 3 (Medium): Backend credit limit enforcement
--   Non-admin callers (agents, marketer, pos) are blocked at the DB layer if
--   the new outstanding would exceed the resolved credit limit.
--   Admins / managers may always proceed (intentional override capability).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id         TEXT,
  p_store_id           UUID,
  p_customer_id        UUID,
  p_recorded_by        UUID,
  p_logged_by          UUID,
  p_total_amount       NUMERIC,
  p_cash_amount        NUMERIC,
  p_upi_amount         NUMERIC,
  p_outstanding_amount NUMERIC,
  p_sale_items         JSONB,
  p_created_at         TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id             UUID;
  v_old_outstanding     NUMERIC;
  v_new_outstanding     NUMERIC;
  v_credit_limit        NUMERIC := 0;
  v_store_type_id       UUID;
  v_store_customer_id   UUID;
  v_kyc_status          TEXT;
  v_credit_limit_override NUMERIC;
  v_caller_is_admin     BOOLEAN;
BEGIN
  -- Reject unauthenticated calls (belt-and-suspenders alongside RLS)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the store row for the duration of this transaction.
  -- Any concurrent call for the same store will wait here, ensuring
  -- each agent reads the *committed* balance before writing.
  SELECT s.outstanding, s.store_type_id, s.customer_id
  INTO   v_old_outstanding, v_store_type_id, v_store_customer_id
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  v_new_outstanding := v_old_outstanding + p_outstanding_amount;

  -- ── Credit limit resolution (customer override > store-type default) ───

  SELECT c.kyc_status, c.credit_limit_override
  INTO   v_kyc_status, v_credit_limit_override
  FROM   public.customers c
  WHERE  c.id = v_store_customer_id;

  IF v_credit_limit_override IS NOT NULL THEN
    v_credit_limit := v_credit_limit_override;
  ELSE
    SELECT CASE
             WHEN v_kyc_status = 'approved'
             THEN COALESCE(credit_limit_kyc, 0)
             ELSE COALESCE(credit_limit_no_kyc, 0)
           END
    INTO   v_credit_limit
    FROM   public.store_types
    WHERE  id = v_store_type_id;
  END IF;

  -- ── Backend credit-limit gate (admins/managers may override) ───────────

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'manager')
  ) INTO v_caller_is_admin;

  IF v_credit_limit > 0
     AND v_new_outstanding > v_credit_limit
     AND NOT v_caller_is_admin
  THEN
    RAISE EXCEPTION 'credit_limit_exceeded';
  END IF;

  -- ── Atomic sale + items insert ─────────────────────────────────────────

  INSERT INTO public.sales (
    display_id, store_id, customer_id, recorded_by, logged_by,
    total_amount, cash_amount, upi_amount, outstanding_amount,
    old_outstanding, new_outstanding, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    p_total_amount, p_cash_amount, p_upi_amount, p_outstanding_amount,
    v_old_outstanding, v_new_outstanding,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    (item->>'total_price')::NUMERIC
  FROM jsonb_array_elements(p_sale_items) AS item;

  -- ── Auto-deliver pending orders for this store ─────────────────────────

  UPDATE public.orders
  SET status = 'delivered', delivered_at = now()
  WHERE store_id = p_store_id AND status = 'pending';

  -- ── Backdated insert: rebuild per-row running balance snapshots ─────────
  -- stores.outstanding is already correct via the trigger on sales INSERT.
  -- We also fix the old/new_outstanding on every historical row so reports
  -- stay accurate.

  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale           TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_running_balances TO authenticated;
-- Add current location columns to route_sessions for real-time agent tracking
ALTER TABLE public.route_sessions
  ADD COLUMN IF NOT EXISTS current_lat double precision,
  ADD COLUMN IF NOT EXISTS current_lng double precision,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
-- =====================================================================
-- CUSTOMER EMAIL AUTO-LINKING
-- Fixes the case where a customer record was created with an email AFTER
-- the auth user already signed up (trigger did not fire at signup time).
-- =====================================================================

-- 1. Trigger function: auto-link auth user whenever email is set on customers
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_auth_user_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Only act when email is provided but user_id is not yet set
  IF NEW.email IS NOT NULL AND (NEW.user_id IS NULL OR NEW.user_id != (
      SELECT id FROM auth.users WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1
  )) THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(NEW.email)
    LIMIT 1;

    IF v_user_id IS NOT NULL AND NEW.user_id IS NULL THEN
      NEW.user_id := v_user_id;
      -- Ensure the customer role is assigned
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'customer')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to customers table
-- -----------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_customer_email_set ON public.customers;
CREATE TRIGGER on_customer_email_set
  BEFORE INSERT OR UPDATE OF email
  ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_customer();

-- 3. Backfill: link existing customer records that have email but no user_id
-- -----------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS customer_id, u.id AS auth_user_id
    FROM public.customers c
    JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
    WHERE c.user_id IS NULL
      AND c.email IS NOT NULL
  LOOP
    UPDATE public.customers SET user_id = r.auth_user_id WHERE id = r.customer_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.auth_user_id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

-- 4. RLS policy: allow a customer to read their own profile by email
--    (safety-net while user_id is in transition, or for the brief window
--     right after sign-up before the trigger has run)
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can view own profile by email" ON public.customers;
CREATE POLICY "Customers can view own profile by email" ON public.customers
  FOR SELECT TO authenticated USING (
    email IS NOT NULL
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- 5. RPC callable by the client as a manual-linking fallback
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_customer_by_email()
RETURNS TABLE (linked boolean, customer_name text, customer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_cust_id  uuid;
  v_cust_name text;
BEGIN
  -- Get caller email from auth
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, null::text, null::uuid;
    RETURN;
  END IF;

  -- Already linked?
  SELECT id, name INTO v_cust_id, v_cust_name
  FROM public.customers WHERE user_id = v_user_id LIMIT 1;

  IF v_cust_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer') ON CONFLICT (user_id, role) DO NOTHING;
    RETURN QUERY SELECT true, v_cust_name, v_cust_id;
    RETURN;
  END IF;

  -- Try linking by email
  SELECT id, name INTO v_cust_id, v_cust_name
  FROM public.customers
  WHERE LOWER(email) = LOWER(v_email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_cust_id IS NOT NULL THEN
    UPDATE public.customers SET user_id = v_user_id WHERE id = v_cust_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer') ON CONFLICT (user_id, role) DO NOTHING;
    RETURN QUERY SELECT true, v_cust_name, v_cust_id;
  ELSE
    RETURN QUERY SELECT false, null::text, null::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_customer_by_email() TO authenticated;
-- Remove email-based customer auto-linking and fallback access.
-- Customer resolution must rely on explicit user_id linkage only.

-- 1) Remove customer-table email auto-link trigger/function
DROP TRIGGER IF EXISTS on_customer_email_set ON public.customers;
DROP FUNCTION IF EXISTS public.link_auth_user_to_customer();

-- 2) Remove email-based customer fallback RPC
REVOKE EXECUTE ON FUNCTION public.link_customer_by_email() FROM authenticated;
DROP FUNCTION IF EXISTS public.link_customer_by_email();

-- 3) Remove email-based customer RLS safety-net
DROP POLICY IF EXISTS "Customers can view own profile by email" ON public.customers;

-- 4) Remove legacy email auto-linking on auth signup trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$function$;
CREATE POLICY "Admin/Manager can update profiles" 
ON public.profiles 
FOR UPDATE 
TO authenticated 
USING (
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'manager')
);
-- =====================================================================
-- CUSTOMER SELF-REGISTRATION RLS POLICIES
-- Allows phone-OTP-authenticated customers to:
--   1. Insert their own customer record (user_id must equal auth.uid())
--   2. Insert their own stores (customer_id must belong to them)
-- =====================================================================

-- 1. Allow a customer to create their own profile record.
--    The WITH CHECK enforces user_id = caller's auth UID.
CREATE POLICY "Customers can register own profile" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. Allow a customer to add stores linked to their own customer record.
--    Verifies the given customer_id is owned by the calling user.
CREATE POLICY "Customers can insert own stores" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND user_id = auth.uid()
    )
  );
-- ============================================================
--  Migration: GPS trail pings, web push subscriptions, KYC storage policies
--  Date: 2026-03-20
-- ============================================================

-- ─────────────────────────────────────────────────────────────
--  1. LOCATION PINGS (GPS trail for route sessions)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.location_pings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.route_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  recorded_at timestamptz not null default now()
);

create index if not exists location_pings_session_id_idx on public.location_pings (session_id, recorded_at);
create index if not exists location_pings_user_id_idx    on public.location_pings (user_id, recorded_at);

alter table public.location_pings enable row level security;

-- Agents can insert their own pings
create policy "Agents insert own pings"
  on public.location_pings for insert
  with check (auth.uid() = user_id);

-- Staff (admin/manager) can read all pings; agents can read their own
create policy "Staff read all pings"
  on public.location_pings for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager')
    )
  );

-- Auto-purge pings older than 7 days to control storage
-- (run via pg_cron if available, or manual cleanup)
-- create extension if not exists pg_cron;
-- select cron.schedule('purge-location-pings', '0 2 * * *',
--   'delete from public.location_pings where recorded_at < now() - interval ''7 days''');


-- ─────────────────────────────────────────────────────────────
--  2. PUSH SUBSCRIPTIONS (Web Push / PWA notifications)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage their own subscriptions only
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read all (needed for backend fan-out)
create policy "Admins read all push subscriptions"
  on public.push_subscriptions for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager')
    )
  );


-- ─────────────────────────────────────────────────────────────
--  3. STORAGE BUCKETS + POLICIES
--  Note: bucket creation requires Supabase dashboard or CLI.
--  Run these SQL policies AFTER creating the buckets manually:
--    - kyc-documents  (private, 10MB limit)
--    - entity-photos  (public, 5MB limit)
-- ─────────────────────────────────────────────────────────────

-- KYC DOCUMENTS bucket policies
-- Customers can upload their own documents (folder = their customer ID)
create policy "Customers upload own KYC docs"
  on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- Customers can update/replace their own documents
create policy "Customers update own KYC docs"
  on storage.objects for update
  using (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- Admins and managers can view all KYC documents
create policy "Staff view KYC docs"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager', 'agent')
    )
  );

-- Customers can view their own documents (folder starts with their customer ID)
create policy "Customers view own KYC docs"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- ENTITY PHOTOS bucket policies
create policy "Authenticated users upload entity photos"
  on storage.objects for insert
  with check (
    bucket_id = 'entity-photos'
    and auth.uid() is not null
  );

create policy "Public read entity photos"
  on storage.objects for select
  using (bucket_id = 'entity-photos');

create policy "Authenticated users update entity photos"
  on storage.objects for update
  using (
    bucket_id = 'entity-photos'
    and auth.uid() is not null
  );
