-- ============================================================
-- TOTAL MIGRATION - Complete Database Schema for Distribution App
-- Generated: 2026-03-08
-- Run this on a fresh Supabase project to replicate the entire schema
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'agent', 'marketer', 'pos', 'customer');


-- ============================================================
-- 2. TABLES (ordered by dependency)
-- ============================================================

-- product_categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_categories_name_key ON public.product_categories (name);

-- products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  product_group text,
  base_price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'PCS',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_sku_key ON public.products (sku);

-- store_types
CREATE TABLE public.store_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_type text NOT NULL DEFAULT 'simple',
  auto_order_enabled boolean NOT NULL DEFAULT false,
  credit_limit_kyc numeric NOT NULL DEFAULT 0,
  credit_limit_no_kyc numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_types_name_key ON public.store_types (name);

-- customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_id text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  gst_number text,
  photo_url text,
  kyc_status text NOT NULL DEFAULT 'not_requested',
  kyc_rejection_reason text,
  kyc_selfie_url text,
  kyc_aadhar_front_url text,
  kyc_aadhar_back_url text,
  kyc_submitted_at timestamptz,
  kyc_verified_at timestamptz,
  kyc_verified_by uuid REFERENCES auth.users(id),
  opening_balance numeric NOT NULL DEFAULT 0,
  credit_limit_override numeric DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_display_id_key ON public.customers (display_id);

-- routes
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_type_id uuid NOT NULL REFERENCES public.store_types(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- stores
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_type_id uuid NOT NULL REFERENCES public.store_types(id),
  route_id uuid REFERENCES public.routes(id),
  display_id text NOT NULL,
  name text NOT NULL,
  phone text,
  alternate_phone text,
  address text,
  street text,
  area text,
  city text,
  district text,
  state text,
  pincode text,
  lat double precision,
  lng double precision,
  photo_url text,
  opening_balance numeric NOT NULL DEFAULT 0,
  outstanding numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stores_display_id_key ON public.stores (display_id);

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles (user_id);

-- user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

-- user_permissions
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_permissions_user_id_permission_key ON public.user_permissions (user_id, permission);

-- company_settings
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_settings_key_key ON public.company_settings (key);

-- orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  cancelled_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'manual',
  order_type text NOT NULL DEFAULT 'simple',
  requirement_note text,
  cancellation_reason text,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- order_items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sales
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  logged_by uuid,
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

-- sale_items
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  logged_by uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- handovers
CREATE TABLE public.handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  handed_to uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  handover_date date NOT NULL DEFAULT CURRENT_DATE,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX handovers_user_id_handover_date_key ON public.handovers (user_id, handover_date);

-- handover_snapshots
CREATE TABLE public.handover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  balance_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX handover_snapshots_user_id_snapshot_date_key ON public.handover_snapshots (user_id, snapshot_date);

-- route_sessions
CREATE TABLE public.route_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- store_visits
CREATE TABLE public.store_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.route_sessions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  lat double precision,
  lng double precision,
  notes text,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_visits_session_id_store_id_key ON public.store_visits (session_id, store_id);

-- store_pricing
CREATE TABLE public.store_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_pricing_store_id_product_id_key ON public.store_pricing (store_id, product_id);

-- store_type_pricing
CREATE TABLE public.store_type_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_type_pricing_store_type_id_product_id_key ON public.store_type_pricing (store_type_id, product_id);

-- store_type_products
CREATE TABLE public.store_type_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_type_products_store_type_id_product_id_key ON public.store_type_products (store_type_id, product_id);

-- store_qr_codes
CREATE TABLE public.store_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  upi_id text NOT NULL,
  payee_name text,
  raw_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_qr_codes_upi_id_key ON public.store_qr_codes (upi_id);

-- balance_adjustments
CREATE TABLE public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  adjusted_by uuid NOT NULL,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  adjustment_amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- activity_logs
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_user ON public.activity_logs (user_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs (created_at DESC);

-- notifications
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
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);


-- ============================================================
-- 3. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

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


-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Auth trigger: auto-create profile + role on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Duplicate phone check
CREATE TRIGGER check_customer_phone_before_insert
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_customer_phone();

CREATE TRIGGER check_customer_phone_before_update
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_customer_phone();

-- Protect POS system records
CREATE TRIGGER protect_pos_customer
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_pos_system_records();

CREATE TRIGGER protect_pos_store
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.protect_pos_system_records();

-- updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.handovers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.store_type_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 5. ROW LEVEL SECURITY (Enable + Policies)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---- activity_logs ----
CREATE POLICY "Authenticated can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (user_id = auth.uid()));

-- ---- balance_adjustments ----
CREATE POLICY "Authorized staff can insert balance adjustments" ON public.balance_adjustments FOR INSERT TO authenticated WITH CHECK (adjusted_by = auth.uid());
CREATE POLICY "Staff can view balance adjustments" ON public.balance_adjustments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));

-- ---- company_settings ----
CREATE POLICY "Admin can manage settings" ON public.company_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated can view settings" ON public.company_settings FOR SELECT TO authenticated USING (true);

-- ---- customers ----
CREATE POLICY "Staff can view all customers" ON public.customers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer') OR (user_id = auth.uid()));
CREATE POLICY "Staff can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Admin/Manager can update customers" ON public.customers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Customers can update own KYC" ON public.customers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'customer') AND (user_id = auth.uid()));
CREATE POLICY "Cannot delete system POS customer" ON public.customers FOR DELETE TO authenticated USING (id <> '00000000-0000-0000-0000-000000000001'::uuid);

-- ---- handover_snapshots ----
CREATE POLICY "System can insert snapshots" ON public.handover_snapshots FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Users can view own snapshots" ON public.handover_snapshots FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (user_id = auth.uid()));

-- ---- handovers ----
CREATE POLICY "Users can insert own handovers" ON public.handovers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own handovers" ON public.handovers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (user_id = auth.uid()) OR (handed_to = auth.uid()));
CREATE POLICY "Users/managers can update handovers" ON public.handovers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (user_id = auth.uid()) OR (handed_to = auth.uid()));

-- ---- notifications ----
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Staff can insert notifications" ON public.notifications FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer') OR has_role(auth.uid(), 'pos'));

-- ---- order_items ----
CREATE POLICY "Insert order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (order_id IN (SELECT id FROM orders));
CREATE POLICY "View order items" ON public.order_items FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM orders));

-- ---- orders ----
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer') OR (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))));
CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'marketer') OR (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))));
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (has_role(auth.uid(), 'agent') AND (status = 'pending')) OR (has_role(auth.uid(), 'marketer') AND (created_by = auth.uid())) OR (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))));

-- ---- product_categories ----
CREATE POLICY "Authenticated can view product categories" ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert product categories" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can update product categories" ON public.product_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete product categories" ON public.product_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- ---- products ----
CREATE POLICY "Authenticated can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can update products" ON public.products FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete products" ON public.products FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ---- profiles ----
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ---- route_sessions ----
CREATE POLICY "Users can insert own sessions" ON public.route_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own sessions" ON public.route_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (user_id = auth.uid()));
CREATE POLICY "Users can update own sessions" ON public.route_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ---- routes ----
CREATE POLICY "Staff can view routes" ON public.routes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent'));
CREATE POLICY "Admin can insert routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update routes" ON public.routes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete routes" ON public.routes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ---- sale_items ----
CREATE POLICY "Insert sale items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (sale_id IN (SELECT id FROM sales));
CREATE POLICY "View sale items" ON public.sale_items FOR SELECT TO authenticated USING (sale_id IN (SELECT id FROM sales));

-- ---- sales ----
CREATE POLICY "Staff can view sales" ON public.sales FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (has_role(auth.uid(), 'agent') AND ((recorded_by = auth.uid()) OR (assigned_to = auth.uid()))) OR (has_role(auth.uid(), 'pos') AND ((recorded_by = auth.uid()) OR (assigned_to = auth.uid()))) OR (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))));
CREATE POLICY "Staff can insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'pos'));
CREATE POLICY "Admin/Manager can update sales" ON public.sales FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- ---- store_pricing ----
CREATE POLICY "Admin can manage store pricing" ON public.store_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated can view store pricing" ON public.store_pricing FOR SELECT TO authenticated USING (true);

-- ---- store_qr_codes ----
CREATE POLICY "Authenticated can view store QR codes" ON public.store_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert store QR codes" ON public.store_qr_codes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Admin can update store QR codes" ON public.store_qr_codes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete store QR codes" ON public.store_qr_codes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- ---- store_type_pricing ----
CREATE POLICY "Admin can manage store type pricing" ON public.store_type_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated can view store type pricing" ON public.store_type_pricing FOR SELECT TO authenticated USING (true);

-- ---- store_type_products ----
CREATE POLICY "Admin can manage store type products" ON public.store_type_products FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated can view store type products" ON public.store_type_products FOR SELECT TO authenticated USING (true);

-- ---- store_types ----
CREATE POLICY "Authenticated can view store types" ON public.store_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert store types" ON public.store_types FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update store types" ON public.store_types FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete store types" ON public.store_types FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ---- store_visits ----
CREATE POLICY "Insert visits" ON public.store_visits FOR INSERT TO authenticated WITH CHECK (session_id IN (SELECT id FROM route_sessions WHERE user_id = auth.uid() AND status = 'active'));
CREATE POLICY "View visits" ON public.store_visits FOR SELECT TO authenticated USING (session_id IN (SELECT id FROM route_sessions WHERE user_id = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')));

-- ---- stores ----
CREATE POLICY "Staff can view all stores" ON public.stores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Customers can view own stores" ON public.stores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())));
CREATE POLICY "POS can view stores for sales" ON public.stores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'pos'));
CREATE POLICY "Staff can insert stores" ON public.stores FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Admin/Manager can update stores" ON public.stores FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Cannot delete system POS store" ON public.stores FOR DELETE TO authenticated USING (id <> '00000000-0000-0000-0000-000000000001'::uuid);

-- ---- transactions ----
CREATE POLICY "Staff can view transactions" ON public.transactions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (has_role(auth.uid(), 'agent') AND ((recorded_by = auth.uid()) OR (assigned_to = auth.uid()))) OR (has_role(auth.uid(), 'marketer') AND ((recorded_by = auth.uid()) OR (assigned_to = auth.uid()))) OR (has_role(auth.uid(), 'customer') AND (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))));
CREATE POLICY "Staff can insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Admin/Manager can update transactions" ON public.transactions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- ---- user_permissions ----
CREATE POLICY "Admin can manage permissions" ON public.user_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- ---- user_roles ----
CREATE POLICY "Authenticated can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));


-- ============================================================
-- 6. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
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
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ============================================================
-- 7. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('entity-photos', 'entity-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false);

-- Storage policies
CREATE POLICY "Anyone can view entity photos" ON storage.objects FOR SELECT USING (bucket_id = 'entity-photos');
CREATE POLICY "Authenticated can upload entity photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'entity-photos');
CREATE POLICY "Authenticated can update entity photos" ON storage.objects FOR UPDATE USING (bucket_id = 'entity-photos');
CREATE POLICY "Authenticated can delete entity photos" ON storage.objects FOR DELETE USING (bucket_id = 'entity-photos');
CREATE POLICY "Customers can upload own KYC docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Staff can view KYC docs" ON storage.objects FOR SELECT USING (bucket_id = 'kyc-documents' AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR (storage.foldername(name))[1] = (auth.uid())::text));


-- ============================================================
-- 8. SEED DATA (System POS records)
-- ============================================================
-- NOTE: Uncomment and modify these if you need the system POS customer/store:
-- INSERT INTO public.customers (id, display_id, name, is_active) VALUES ('00000000-0000-0000-0000-000000000001', 'CUST-POS', 'POS Walk-in Customer', true);
-- INSERT INTO public.store_types (id, name) VALUES (gen_random_uuid(), 'POS');
-- INSERT INTO public.stores (id, display_id, name, customer_id, store_type_id) VALUES ('00000000-0000-0000-0000-000000000001', 'STORE-POS', 'POS Counter', '00000000-0000-0000-0000-000000000001', '<store_type_id_here>');


-- ============================================================
-- END OF TOTAL MIGRATION
-- ============================================================
