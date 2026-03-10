-- ==========================================
-- BIZMANAGER - COMPLETE DATABASE SCHEMA
-- Run this single file on a fresh Supabase project
-- to recreate the entire backend.
-- ==========================================

-- ==========================================
-- 1. EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ==========================================
-- 2. ENUMS
-- ==========================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'agent', 'marketer', 'pos', 'customer');

-- ==========================================
-- 3. UTILITY FUNCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Security definer: check if user has a role (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Duplicate phone check for customers
CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers WHERE phone = NEW.phone AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid) AND is_active = true
  ) THEN
    RAISE EXCEPTION 'A customer with phone % already exists', NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

-- Protect POS system records from deactivation
CREATE OR REPLACE FUNCTION public.protect_pos_system_records()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF OLD.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.is_active := true;
    NEW.name := OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

-- Auto-create profile + customer role on signup
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

  -- Auto-link customer record if email matches
  UPDATE public.customers
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==========================================
-- 4. TABLES
-- ==========================================

-- Profiles
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

-- User roles (separate table per security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

-- Products
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

-- Product categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Store types
CREATE TABLE public.store_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL DEFAULT 'simple',
  auto_order_enabled BOOLEAN NOT NULL DEFAULT false,
  credit_limit_kyc NUMERIC NOT NULL DEFAULT 0,
  credit_limit_no_kyc NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
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
  kyc_selfie_url TEXT,
  kyc_aadhar_front_url TEXT,
  kyc_aadhar_back_url TEXT,
  kyc_submitted_at TIMESTAMPTZ,
  kyc_verified_at TIMESTAMPTZ,
  kyc_verified_by UUID REFERENCES auth.users(id),
  credit_limit_override NUMERIC DEFAULT NULL,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Routes
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  route_id UUID REFERENCES public.routes(id),
  address TEXT,
  street TEXT,
  area TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
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

-- Store type products (access matrix)
CREATE TABLE public.store_type_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_type_id, product_id)
);

-- Store type pricing overrides
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

-- Store QR codes
CREATE TABLE public.store_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL UNIQUE,
  payee_name TEXT,
  raw_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
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

-- Sale items
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions (payments)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  logged_by uuid,
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

-- Orders
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

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Handovers
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
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, handover_date)
);

-- Handover snapshots (daily balance)
CREATE TABLE public.handover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  balance_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Balance adjustments
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

-- Activity logs
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

-- Company settings
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User permissions
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

-- Notifications
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

-- Staff invitations
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

-- Promotional banners
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

-- Route sessions
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

-- Store visits
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

-- Sequences for display IDs
CREATE SEQUENCE IF NOT EXISTS customer_seq START 1;
CREATE SEQUENCE IF NOT EXISTS store_seq START 1;

-- ==========================================
-- 5. INDEXES
-- ==========================================
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);

-- ==========================================
-- 6. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 7. RLS POLICIES
-- ==========================================

-- === PROFILES ===
CREATE POLICY "Staff can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
    OR public.has_role(auth.uid(), 'pos') OR (user_id = auth.uid())
  );
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- === USER ROLES ===
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (
    (user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- === PRODUCTS ===
CREATE POLICY "Authenticated can view products" ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can update products" ON public.products
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admin can delete products" ON public.products
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- === PRODUCT CATEGORIES ===
CREATE POLICY "Authenticated can view product categories" ON public.product_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert product categories" ON public.product_categories
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admin can update product categories" ON public.product_categories
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admin can delete product categories" ON public.product_categories
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- === STORE TYPES ===
CREATE POLICY "Authenticated can view store types" ON public.store_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert store types" ON public.store_types
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update store types" ON public.store_types
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete store types" ON public.store_types
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- === CUSTOMERS ===
CREATE POLICY "Staff can view all customers" ON public.customers
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
    OR user_id = auth.uid()
  );
CREATE POLICY "Staff can insert customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY "Customers can update own KYC" ON public.customers
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'customer'::app_role) AND user_id = auth.uid()
  );
CREATE POLICY "Cannot delete system POS customer" ON public.customers
  FOR DELETE TO authenticated USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

-- === ROUTES ===
CREATE POLICY "Staff can view routes" ON public.routes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent')
  );
CREATE POLICY "Admin can insert routes" ON public.routes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can update routes" ON public.routes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin can delete routes" ON public.routes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- === STORES ===
CREATE POLICY "Staff can view all stores" ON public.stores
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Customers can view own stores" ON public.stores
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'customer'::app_role) AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );
CREATE POLICY "POS can view stores for sales" ON public.stores
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'pos'::app_role));
CREATE POLICY "Staff can insert stores" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update stores" ON public.stores
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY "Cannot delete system POS store" ON public.stores
  FOR DELETE TO authenticated USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

-- === STORE TYPE PRODUCTS ===
CREATE POLICY "Authenticated can view store type products" ON public.store_type_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type products" ON public.store_type_products
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- === STORE TYPE PRICING ===
CREATE POLICY "Authenticated can view store type pricing" ON public.store_type_pricing
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type pricing" ON public.store_type_pricing
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- === STORE PRICING ===
CREATE POLICY "Authenticated can view store pricing" ON public.store_pricing
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store pricing" ON public.store_pricing
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- === STORE QR CODES ===
CREATE POLICY "Staff and store owners can view QR codes" ON public.store_qr_codes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'marketer')
    OR public.has_role(auth.uid(), 'pos')
    OR (store_id IN (SELECT s.id FROM public.stores s JOIN public.customers c ON s.customer_id = c.id WHERE c.user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert store QR codes" ON public.store_qr_codes
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'agent'::app_role) OR has_role(auth.uid(), 'marketer'::app_role)
  );
CREATE POLICY "Admin can update store QR codes" ON public.store_qr_codes
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admin can delete store QR codes" ON public.store_qr_codes
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- === SALES ===
CREATE POLICY "Staff can view sales" ON public.sales FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'pos') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'pos'));
CREATE POLICY "Admin/Manager can update sales" ON public.sales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- === SALE ITEMS ===
CREATE POLICY "View sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (sale_id IN (SELECT id FROM public.sales));
CREATE POLICY "Insert sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (sale_id IN (SELECT id FROM public.sales));

-- === TRANSACTIONS ===
CREATE POLICY "Staff can view transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'marketer') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Admin/Manager can update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- === ORDERS ===
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status = 'pending')
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid())
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

-- === ORDER ITEMS ===
CREATE POLICY "View order items" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Insert order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.orders));

-- === HANDOVERS ===
CREATE POLICY "Users can view own handovers" ON public.handovers FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
    OR user_id = auth.uid() OR handed_to = auth.uid()
  );
CREATE POLICY "Users can insert own handovers" ON public.handovers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users/managers can update handovers" ON public.handovers FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
    OR user_id = auth.uid() OR handed_to = auth.uid()
  );

-- === HANDOVER SNAPSHOTS ===
CREATE POLICY "Users can view own snapshots" ON public.handover_snapshots FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR user_id = auth.uid());
CREATE POLICY "System can insert snapshots" ON public.handover_snapshots FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- === BALANCE ADJUSTMENTS ===
CREATE POLICY "Staff can view balance adjustments" ON public.balance_adjustments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer'));
CREATE POLICY "Staff can insert balance adjustments" ON public.balance_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    (adjusted_by = auth.uid()) AND (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'agent'::app_role))
  );

-- === ACTIVITY LOGS ===
CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') OR user_id = auth.uid());
CREATE POLICY "Authenticated can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- === COMPANY SETTINGS ===
CREATE POLICY "Authenticated can view settings" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage settings" ON public.company_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- === USER PERMISSIONS ===
CREATE POLICY "Admin can manage permissions" ON public.user_permissions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- === NOTIFICATIONS ===
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Staff can insert notifications" ON public.notifications FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'agent'::app_role) OR has_role(auth.uid(), 'marketer'::app_role)
    OR has_role(auth.uid(), 'pos'::app_role)
  );

-- === STAFF INVITATIONS ===
CREATE POLICY "Admin can manage invitations" ON public.staff_invitations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Managers can view invitations" ON public.staff_invitations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

-- === PROMOTIONAL BANNERS ===
CREATE POLICY "Admin can manage banners" ON public.promotional_banners FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Authenticated can view active banners" ON public.promotional_banners FOR SELECT TO authenticated
  USING (is_active = true);

-- === ROUTE SESSIONS ===
CREATE POLICY "Users can view own sessions" ON public.route_sessions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR user_id = auth.uid());
CREATE POLICY "Users can insert own sessions" ON public.route_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sessions" ON public.route_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- === STORE VISITS ===
CREATE POLICY "View visits" ON public.store_visits FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Insert visits" ON public.store_visits FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() AND status = 'active'));

-- ==========================================
-- 8. TRIGGERS
-- ==========================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_handovers_updated_at BEFORE UPDATE ON public.handovers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER check_customer_phone_duplicate
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_customer_phone();

CREATE TRIGGER protect_pos_store BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.protect_pos_system_records();
CREATE TRIGGER protect_pos_customer BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_pos_system_records();

-- ==========================================
-- 9. STORAGE BUCKETS
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('entity-photos', 'entity-photos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies: KYC documents
CREATE POLICY "Customers can upload own KYC docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Staff can view KYC docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (storage.foldername(name))[1] = auth.uid()::text
  ));

-- Storage policies: Entity photos
CREATE POLICY "Authenticated can upload entity photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entity-photos');
CREATE POLICY "Anyone can view entity photos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'entity-photos');
CREATE POLICY "Authenticated can update entity photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'entity-photos');
CREATE POLICY "Authenticated can delete entity photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'entity-photos');

-- ==========================================
-- 10. REALTIME
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
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

-- ==========================================
-- 11. SEED DATA
-- ==========================================

-- Default company settings
INSERT INTO public.company_settings (key, value) VALUES
  ('company_name', 'BizManager Corp'),
  ('gst_number', ''),
  ('customer_care_number', ''),
  ('address', ''),
  ('location_validation', 'false'),
  ('auto_orders', 'false'),
  ('push_notifications', 'false'),
  ('partial_collections', 'false');

-- Default store types
INSERT INTO public.store_types (name, order_type) VALUES
  ('Retail', 'simple'),
  ('Wholesale', 'detailed'),
  ('Restaurant', 'detailed');

-- POS system records (protected from deletion/deactivation)
INSERT INTO public.store_types (id, name, order_type, is_active, auto_order_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'POS/Counter', 'simple', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers (id, display_id, name, is_active, kyc_status, opening_balance)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST-POS', 'POS', true, 'not_requested', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (id, display_id, name, customer_id, store_type_id, is_active, outstanding, opening_balance)
VALUES (
  '00000000-0000-0000-0000-000000000001', 'STR-POS', 'POS Counter',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  true, 0, 0
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- DONE! Your BizManager backend is ready.
-- Next: Deploy edge functions (in supabase/functions/)
-- ==========================================
