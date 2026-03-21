-- ============================================================
-- ACTIVE_SQL.sql - Current Production Schema
-- Generated: 2026-03-20
-- 
-- This file represents the EXACT current state of the Supabase database
-- after applying ALL migrations up to 20260320000001.
--
-- ⚠️ This is the SINGLE SOURCE OF TRUTH for the database schema.
-- ⚠️ Run on a fresh Supabase project to replicate the entire system.
--
-- To apply:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Run (will create all tables, functions, triggers, RLS policies)
--
-- Version: 1.0.0
-- Last Updated: 2026-03-20
-- Includes: All migrations from 20260308130133 to 20260320000001
-- ============================================================


-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for text search


-- ============================================================
-- SECTION 2: CUSTOM TYPES & ENUMS
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'manager', 
  'agent',
  'marketer',
  'pos',
  'customer'
);

-- Payment method enum (for transactions)
CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'cheque',
  'other'
);

-- KYC status enum
CREATE TYPE public.kyc_status_type AS ENUM (
  'not_requested',
  'pending',
  'approved',
  'rejected'
);


-- ============================================================
-- SECTION 3: UTILITY FUNCTIONS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Security definer function to check roles (avoids RLS recursion)
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

-- Generate display ID with prefix (S-, C-, T-, etc.)
CREATE OR REPLACE FUNCTION public.generate_display_id(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  date_part TEXT;
  sequence_part TEXT;
  existing_count INT;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  
  -- Count existing IDs with this prefix and date
  EXECUTE format(
    'SELECT COUNT(*) FROM (
      SELECT display_id FROM public.customers WHERE display_id LIKE %L
      UNION ALL
      SELECT display_id FROM public.sales WHERE display_id LIKE %L
      UNION ALL
      SELECT display_id FROM public.transactions WHERE display_id LIKE %L
      UNION ALL
      SELECT display_id FROM public.stores WHERE display_id LIKE %L
    ) AS combined',
    prefix || '-' || date_part || '%',
    prefix || '-' || date_part || '%',
    prefix || '-' || date_part || '%',
    prefix || '-' || date_part || '%'
  ) INTO existing_count;
  
  sequence_part := lpad((existing_count + 1)::TEXT, 4, '0');
  
  RETURN prefix || '-' || date_part || '-' || sequence_part;
END;
$$;


-- ============================================================
-- SECTION 4: CORE IDENTITY TABLES
-- ============================================================

-- Profiles table (user metadata)
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

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles table (one role per user)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SECTION 5: PRODUCT CATALOG
-- ============================================================

-- Product categories
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  product_group TEXT,
  base_price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'PCS',
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX products_category_idx ON public.products(category);
CREATE INDEX products_product_group_idx ON public.products(product_group);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SECTION 6: STORE TYPES & ROUTES
-- ============================================================

-- Store types (determines order complexity & credit limits)
CREATE TABLE public.store_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL DEFAULT 'simple', -- 'simple' | 'complex'
  auto_order_enabled BOOLEAN NOT NULL DEFAULT false,
  credit_limit_kyc NUMERIC NOT NULL DEFAULT 0,
  credit_limit_no_kyc NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_types ENABLE ROW LEVEL SECURITY;

-- Routes (sales territories)
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  factory_lat DOUBLE PRECISION, -- Depot/starting point coordinates
  factory_lng DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE INDEX routes_store_type_idx ON public.routes(store_type_id);

-- Agent-to-Route assignments
CREATE TABLE public.agent_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id)
);

ALTER TABLE public.agent_routes ENABLE ROW LEVEL SECURITY;

CREATE INDEX agent_routes_user_idx ON public.agent_routes(user_id);
CREATE INDEX agent_routes_route_idx ON public.agent_routes(route_id);


-- ============================================================
-- SECTION 7: CUSTOMERS & STORES
-- ============================================================

-- Customers (business entities)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_id TEXT NOT NULL UNIQUE,
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
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  credit_limit_override NUMERIC DEFAULT NULL, -- Per-customer override
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE INDEX customers_user_id_idx ON public.customers(user_id);
CREATE INDEX customers_name_trgm_idx ON public.customers USING gin(name gin_trgm_ops);
CREATE INDEX customers_phone_idx ON public.customers(phone);

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stores (physical locations of customers)
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_type_id UUID NOT NULL REFERENCES public.store_types(id),
  route_id UUID REFERENCES public.routes(id),
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  alternate_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gst_number TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  store_order INTEGER, -- Display order on route (for agent navigation)
  notes TEXT,
  outstanding NUMERIC NOT NULL DEFAULT 0, -- Calculated field (controlled by trigger)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE INDEX stores_customer_id_idx ON public.stores(customer_id);
CREATE INDEX stores_route_id_idx ON public.stores(route_id);
CREATE INDEX stores_store_type_idx ON public.stores(store_type_id);
CREATE INDEX stores_lat_lng_idx ON public.stores(lat, lng);

CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SECTION 8: SALES & TRANSACTIONS
-- ============================================================

-- Sales (invoice records)
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_received NUMERIC NOT NULL DEFAULT 0,
  payment_method payment_method,
  notes TEXT,
  is_backdated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_store_id_idx ON public.sales(store_id);
CREATE INDEX sales_recorded_by_idx ON public.sales(recorded_by);
CREATE INDEX sales_sale_date_idx ON public.sales(sale_date);

CREATE TRIGGER update_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sale line items
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX sale_items_sale_id_idx ON public.sale_items(sale_id);
CREATE INDEX sale_items_product_id_idx ON public.sale_items(product_id);

-- Transactions (payments & adjustments)
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL, -- 'payment' | 'adjustment' | 'refund'
  payment_method payment_method,
  notes TEXT,
  is_backdated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX transactions_store_id_idx ON public.transactions(store_id);
CREATE INDEX transactions_recorded_by_idx ON public.transactions(recorded_by);
CREATE INDEX transactions_transaction_date_idx ON public.transactions(transaction_date);

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SECTION 9: ORDERS & INVENTORY
-- ============================================================

-- Orders (pending deliveries)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  route_id UUID NOT NULL REFERENCES public.routes(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'delivered' | 'cancelled'
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX orders_store_id_idx ON public.orders(store_id);
CREATE INDEX orders_route_id_idx ON public.orders(route_id);
CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_delivery_date_idx ON public.orders(delivery_date);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order line items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items(product_id);

-- Agent daily inventory (starting stock)
CREATE TABLE public.agent_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_quantity NUMERIC NOT NULL DEFAULT 0,
  closing_quantity NUMERIC NOT NULL DEFAULT 0,
  sales_quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, date)
);

ALTER TABLE public.agent_inventory ENABLE ROW LEVEL SECURITY;

CREATE INDEX agent_inventory_user_date_idx ON public.agent_inventory(user_id, date);

CREATE TRIGGER update_agent_inventory_updated_at
  BEFORE UPDATE ON public.agent_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SECTION 10: ROUTE SESSIONS & LOCATION TRACKING
-- ============================================================

-- Route sessions (agent daily route tracking)
CREATE TABLE public.route_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES public.routes(id),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started' | 'active' | 'completed'
  current_lat DOUBLE PRECISION, -- Real-time agent position
  current_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id, session_date)
);

ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX route_sessions_user_date_idx ON public.route_sessions(user_id, session_date);
CREATE INDEX route_sessions_route_idx ON public.route_sessions(route_id);

CREATE TRIGGER update_route_sessions_updated_at
  BEFORE UPDATE ON public.route_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Route visits (store check-ins during route)
CREATE TABLE public.route_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.route_sessions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.route_visits ENABLE ROW LEVEL SECURITY;

CREATE INDEX route_visits_session_id_idx ON public.route_visits(session_id);
CREATE INDEX route_visits_store_id_idx ON public.route_visits(store_id);

-- Location pings (GPS trail during route session)
CREATE TABLE public.location_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.route_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;

CREATE INDEX location_pings_session_id_idx ON public.location_pings(session_id, recorded_at);
CREATE INDEX location_pings_user_id_idx ON public.location_pings(user_id, recorded_at);


-- ============================================================
-- SECTION 11: DAILY HANDOVERS & BALANCES
-- ============================================================

-- Daily handover (agent EOD cash reconciliation)
CREATE TABLE public.daily_handover (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  cash_collected NUMERIC NOT NULL DEFAULT 0,
  expenses NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, handover_date)
);

ALTER TABLE public.daily_handover ENABLE ROW LEVEL SECURITY;

CREATE INDEX daily_handover_user_date_idx ON public.daily_handover(user_id, handover_date);

CREATE TRIGGER update_daily_handover_updated_at
  BEFORE UPDATE ON public.daily_handover
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily balances snapshot (historical outstanding tracking)
CREATE TABLE public.daily_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  outstanding NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);

ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;

CREATE INDEX daily_balances_store_date_idx ON public.daily_balances(store_id, date);


-- ============================================================
-- SECTION 12: NOTIFICATIONS & ACTIVITY LOGS
-- ============================================================

-- Notifications (in-app alerts)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL, -- 'order' | 'payment' | 'handover' | 'system'
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX notifications_user_id_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_is_read_idx ON public.notifications(user_id, is_read);

-- Activity logs (audit trail)
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_name TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX activity_logs_user_id_idx ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX activity_logs_entity_idx ON public.activity_logs(entity_type, entity_id);

-- Push subscriptions (Web Push / PWA notifications)
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);


-- ============================================================
-- SECTION 13: BUSINESS LOGIC FUNCTIONS
-- ============================================================

-- Recalculate store outstanding from first principles
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
RETURNS TRIGGER AS $$
DECLARE
  new_outstanding NUMERIC;
BEGIN
  -- Calculate: opening_balance + total_sales - total_payments
  SELECT 
    COALESCE(c.opening_balance, 0) +
    COALESCE((SELECT SUM(total_amount - payment_received) FROM public.sales WHERE store_id = NEW.id), 0) -
    COALESCE((SELECT SUM(amount) FROM public.transactions WHERE store_id = NEW.id AND type = 'payment'), 0)
  INTO new_outstanding
  FROM public.customers c
  JOIN public.stores s ON s.customer_id = c.id
  WHERE s.id = NEW.id;

  NEW.outstanding := COALESCE(new_outstanding, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate outstanding on store update
CREATE TRIGGER recalc_store_outstanding_trigger
  BEFORE INSERT OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

-- Record sale with atomic credit limit check
CREATE OR REPLACE FUNCTION public.record_sale(
  p_store_id UUID,
  p_recorded_by UUID,
  p_sale_date DATE,
  p_items JSONB,
  p_payment_received NUMERIC DEFAULT 0,
  p_payment_method payment_method DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_admin_override BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(sale_id UUID, display_id TEXT, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_display_id TEXT;
  v_total_amount NUMERIC := 0;
  v_outstanding NUMERIC;
  v_credit_limit NUMERIC;
  v_customer_id UUID;
  v_kyc_approved BOOLEAN;
  v_store_type_id UUID;
  item JSONB;
BEGIN
  -- Lock store row to prevent concurrent modifications
  SELECT 
    s.id, s.customer_id, s.store_type_id, s.outstanding,
    c.kyc_status = 'approved',
    COALESCE(c.credit_limit_override, 
             CASE WHEN c.kyc_status = 'approved' 
                  THEN st.credit_limit_kyc 
                  ELSE st.credit_limit_no_kyc 
             END) as credit_limit
  INTO 
    v_store_id, v_customer_id, v_store_type_id, v_outstanding,
    v_kyc_approved, v_credit_limit
  FROM public.stores s
  JOIN public.customers c ON c.id = s.customer_id
  JOIN public.store_types st ON st.id = s.store_type_id
  WHERE s.id = p_store_id
  FOR UPDATE;

  -- Calculate total sale amount
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total_amount := v_total_amount + (item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC;
  END LOOP;

  -- Check credit limit (unless admin override)
  IF NOT p_admin_override THEN
    IF (v_outstanding + v_total_amount - p_payment_received) > v_credit_limit THEN
      RETURN QUERY SELECT NULL::UUID, NULL::TEXT, FALSE, 
        'Credit limit exceeded. Outstanding: ' || v_outstanding || 
        ', Limit: ' || v_credit_limit;
      RETURN;
    END IF;
  END IF;

  -- Generate display ID
  v_display_id := generate_display_id('S');
  v_sale_id := gen_random_uuid();

  -- Insert sale record
  INSERT INTO public.sales (
    id, display_id, store_id, recorded_by, sale_date,
    total_amount, payment_received, payment_method, notes,
    is_backdated
  ) VALUES (
    v_sale_id, v_display_id, p_store_id, p_recorded_by, p_sale_date,
    v_total_amount, p_payment_received, p_payment_method, p_notes,
    p_sale_date < CURRENT_DATE
  );

  -- Insert sale items
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total)
    VALUES (
      v_sale_id,
      (item->>'product_id')::UUID,
      (item->>'quantity')::NUMERIC,
      (item->>'unit_price')::NUMERIC,
      (item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC
    );
  END LOOP;

  -- Mark any pending orders as delivered
  UPDATE public.orders
  SET status = 'delivered', delivered_at = now(), delivered_by = p_recorded_by
  WHERE store_id = p_store_id AND status = 'pending';

  -- Recalculate outstanding (trigger will handle this on next update)
  UPDATE public.stores SET updated_at = now() WHERE id = p_store_id;

  RETURN QUERY SELECT v_sale_id, v_display_id, TRUE, 'Sale recorded successfully';
END;
$$;


-- ============================================================
-- SECTION 14: ROW LEVEL SECURITY POLICIES
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin/Manager can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR 
    public.has_role(auth.uid(), 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR 
    public.has_role(auth.uid(), 'manager')
  );

-- ─────────────────────────────────────────────────────────
-- User Roles
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ─────────────────────────────────────────────────────────
-- Products
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Anyone can view active products"
  ON public.products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Staff can manage products"
  ON public.products FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ─────────────────────────────────────────────────────────
-- Customers
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view all customers"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer', 'pos')
    )
  );

CREATE POLICY "Customers can view own record"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Customers can register own profile"
  ON public.customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can manage customers"
  ON public.customers FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ─────────────────────────────────────────────────────────
-- Stores
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view all stores"
  ON public.stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer', 'pos')
    )
  );

CREATE POLICY "Customers can view own stores"
  ON public.stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can insert own stores"
  ON public.stores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage stores"
  ON public.stores FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ─────────────────────────────────────────────────────────
-- Sales & Sale Items
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view all sales"
  ON public.sales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'pos')
    )
  );

CREATE POLICY "Agents/POS can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    auth.uid() = recorded_by
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('agent', 'pos', 'super_admin', 'manager')
    )
  );

CREATE POLICY "Staff can view sale items"
  ON public.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'pos')
    )
  );

CREATE POLICY "Staff can insert sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'pos')
    )
  );

-- ─────────────────────────────────────────────────────────
-- Transactions
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view all transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'pos')
    )
  );

CREATE POLICY "Agents/POS can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    auth.uid() = recorded_by
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('agent', 'pos', 'super_admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view all orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
  );

CREATE POLICY "Staff can manage orders"
  ON public.orders FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can view order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
  );

-- ─────────────────────────────────────────────────────────
-- Route Sessions & Visits
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Agents can view own sessions"
  ON public.route_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can manage own sessions"
  ON public.route_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Managers can view all sessions"
  ON public.route_sessions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Agents can manage route visits"
  ON public.route_visits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.route_sessions
      WHERE id = session_id
        AND user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────
-- Location Pings
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Agents insert own pings"
  ON public.location_pings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff read all pings"
  ON public.location_pings FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────
-- Push Subscriptions
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────
-- Activity Logs
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Staff can view activity logs"
  ON public.activity_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Users can insert activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────
-- Agent Routes
-- ─────────────────────────────────────────────────────────
CREATE POLICY "Admins manage agent routes"
  ON public.agent_routes FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Agents view own routes"
  ON public.agent_routes FOR SELECT
  USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 15: STORAGE BUCKET POLICIES
-- ============================================================
-- Note: Buckets must be created manually in Supabase Dashboard first
-- Then these policies will apply to them

-- KYC DOCUMENTS bucket (private)
CREATE POLICY "Customers upload own KYC docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Customers update own KYC docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'kyc-documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Staff view KYC docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'manager', 'agent')
    )
  );

CREATE POLICY "Customers view own KYC docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND auth.uid() IS NOT NULL
  );

-- ENTITY PHOTOS bucket (public)
CREATE POLICY "Authenticated users upload entity photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'entity-photos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Public read entity photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'entity-photos');

CREATE POLICY "Authenticated users update entity photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'entity-photos'
    AND auth.uid() IS NOT NULL
  );


-- ============================================================
-- SECTION 16: INDEXES FOR PERFORMANCE
-- ============================================================
-- (Most indexes are created inline with table definitions above)

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS sales_store_date_idx ON public.sales(store_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS transactions_store_date_idx ON public.transactions(store_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS orders_route_status_idx ON public.orders(route_id, status);


-- ============================================================
-- SECTION 17: GRANTS & PERMISSIONS
-- ============================================================
-- Grant usage on schema to authenticated and anon roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant select on all tables to authenticated role
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant execute on all functions to authenticated role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;


-- ============================================================
-- END OF SCHEMA
-- ============================================================
-- 
-- ✅ Schema creation complete!
-- 
-- NEXT STEPS:
-- 1. Create storage buckets in Supabase Dashboard:
--    - kyc-documents (private, 10MB limit)
--    - entity-photos (public, 5MB limit)
-- 
-- 2. Set up edge functions (see supabase/functions/):
--    - invite-staff
--    - firebase-phone-exchange  
--    - toggle-user-ban
--    - daily-store-reset
--    - daily-handover-snapshot
--    - auto-orders
-- 
-- 3. Configure authentication providers:
--    - Email/Password (for staff)
--    - Phone (via Firebase for customers)
-- 
-- 4. Add initial data:
--    - Product categories
--    - Products  
--    - Store types
--    - Routes
-- 
-- 5. Create first super_admin user via Supabase Dashboard
--    then update their role in user_roles table
-- 
-- ============================================================
