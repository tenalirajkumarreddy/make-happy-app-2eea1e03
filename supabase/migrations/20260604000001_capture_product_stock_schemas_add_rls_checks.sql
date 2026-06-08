-- Migration: Capture 15 missing product/stock table schemas, add CHECK constraints, RLS policies, missing RPCs
-- Date: 2026-06-04
--
-- These tables exist on the live Supabase project but had no CREATE TABLE in any migration.
-- A fresh supabase db pull → supabase db reset would fail to reconstruct the schema.
--
-- Changes:
-- 1. CREATE TABLE IF NOT EXISTS for: warehouses, product_stock, stock_transfers,
--    stock_movements, production_log, raw_materials, bill_of_materials,
--    raw_material_stock, raw_material_adjustments, vendor_raw_materials,
--    raw_material_categories, unit_conversions, product_categories,
--    store_pricing, store_type_products, store_type_pricing
-- 2. All missing indexes (CREATE INDEX IF NOT EXISTS)
-- 3. All RLS policies (CREATE POLICY IF NOT EXISTS)
-- 4. CHECK(quantity >= 0) constraints on quantity columns
-- 5. Products hard-delete prevention trigger
-- 6. Missing RPCs: generate_display_id, adjust_raw_material_stock, process_production_log

-- ============================================================
-- PART 1: TABLE SCHEMAS
-- ============================================================

-- 1.1 warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'main',
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_default BOOLEAN DEFAULT false,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    phone TEXT,
    deleted_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    enable_geofencing BOOLEAN DEFAULT false,
    geofence_radius_meters INTEGER DEFAULT 500,
    latitude NUMERIC,
    longitude NUMERIC
);

-- 1.2 product_stock
CREATE TABLE IF NOT EXISTS public.product_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 1.3 stock_transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT ('TRF-' || gen_random_uuid()::text),
    transfer_type TEXT NOT NULL,
    from_warehouse_id UUID,
    from_user_id UUID,
    to_warehouse_id UUID,
    to_user_id UUID,
    product_id UUID NOT NULL,
    quantity NUMERIC NOT NULL,
    description TEXT,
    reference_id TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT DEFAULT 'completed',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    actual_quantity NUMERIC,
    difference NUMERIC DEFAULT 0,
    action_taken TEXT,
    error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    is_approved BOOLEAN DEFAULT false,
    requested_by UUID
);

-- 1.4 stock_movements
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity NUMERIC NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    reference_id TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    agent_id UUID,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    raw_material_id UUID,
    from_user_id UUID,
    to_user_id UUID,
    transfer_id UUID,
    unit_price NUMERIC DEFAULT 0,
    total_value NUMERIC DEFAULT 0,
    from_location TEXT,
    to_location TEXT
);

-- 1.5 production_log
CREATE TABLE IF NOT EXISTS public.production_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity_produced INTEGER NOT NULL,
    production_date DATE NOT NULL DEFAULT CURRENT_DATE,
    wastage_quantity INTEGER NOT NULL DEFAULT 0,
    wastage_cost NUMERIC DEFAULT 0,
    notes TEXT,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6 raw_materials
CREATE TABLE IF NOT EXISTS public.raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'kg',
    category TEXT,
    min_stock_level NUMERIC DEFAULT 0,
    current_stock NUMERIC DEFAULT 0,
    unit_cost NUMERIC DEFAULT 0,
    hsn_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    vendor_id UUID,
    image_url TEXT,
    updated_by UUID,
    warehouse_id UUID,
    deleted_at TIMESTAMPTZ,
    minimum_stock NUMERIC DEFAULT 0,
    enable_low_stock_alert BOOLEAN DEFAULT true,
    piece_weight_grams NUMERIC,
    pieces_per_case INTEGER,
    category_id UUID
);

-- 1.7 bill_of_materials
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finished_product_id UUID NOT NULL,
    warehouse_id UUID,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    raw_material_id UUID,
    raw_material_category_id UUID,
    quantity NUMERIC NOT NULL DEFAULT 0,
    quantity_unit TEXT NOT NULL DEFAULT 'pieces',
    notes TEXT,
    deleted_by UUID
);

-- 1.8 raw_material_stock
CREATE TABLE IF NOT EXISTS public.raw_material_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_material_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.9 raw_material_adjustments
CREATE TABLE IF NOT EXISTS public.raw_material_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL,
    raw_material_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    adjustment_type TEXT NOT NULL,
    quantity_before NUMERIC NOT NULL,
    quantity_change NUMERIC NOT NULL,
    quantity_after NUMERIC NOT NULL,
    reason TEXT,
    reference_id TEXT,
    adjusted_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    performed_by UUID
);

-- 1.10 vendor_raw_materials
CREATE TABLE IF NOT EXISTS public.vendor_raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
    raw_material_id UUID NOT NULL,
    unit_price NUMERIC,
    lead_time_days INTEGER DEFAULT 7,
    is_preferred BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.11 raw_material_categories
CREATE TABLE IF NOT EXISTS public.raw_material_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    base_unit TEXT NOT NULL DEFAULT 'kg',
    warehouse_id UUID
);

-- 1.12 unit_conversions
CREATE TABLE IF NOT EXISTS public.unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_material_id UUID,
    from_unit TEXT NOT NULL,
    to_unit TEXT NOT NULL,
    conversion_rate NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    warehouse_id UUID
);

-- 1.13 product_categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- 1.14 store_pricing
CREATE TABLE IF NOT EXISTS public.store_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    warehouse_id UUID,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- 1.15 store_type_products
CREATE TABLE IF NOT EXISTS public.store_type_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_type_id UUID NOT NULL,
    product_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- 1.16 store_type_pricing
CREATE TABLE IF NOT EXISTS public.store_type_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_type_id UUID NOT NULL,
    product_id UUID NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    warehouse_id UUID,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);


-- ============================================================
-- PART 2: FOREIGN KEY CONSTRAINTS
-- ============================================================
-- Add FK constraints that may not exist on a fresh project.
-- On the live DB these already exist, so we check first.

DO $$
BEGIN
  -- product_stock
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_product_id_fkey') THEN
    ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_warehouse_id_fkey') THEN
    ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;
  END IF;

  -- stock_transfers
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_product_id_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_from_warehouse_id_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_from_warehouse_id_fkey
      FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_to_warehouse_id_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_to_warehouse_id_fkey
      FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_from_user_id_profiles_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_from_user_id_profiles_fkey
      FOREIGN KEY (from_user_id) REFERENCES public.profiles(user_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_to_user_id_profiles_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_to_user_id_profiles_fkey
      FOREIGN KEY (to_user_id) REFERENCES public.profiles(user_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_approved_by_fkey') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- stock_movements
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_product_id_fkey') THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_warehouse_id_fkey') THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_agent_id_fkey') THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES public.profiles(user_id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_raw_material_id_fkey') THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_transfer_id_fkey') THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_transfer_id_fkey
      FOREIGN KEY (transfer_id) REFERENCES public.stock_transfers(id) ON DELETE SET NULL;
  END IF;

  -- production_log
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_log_warehouse_id_fkey') THEN
    ALTER TABLE public.production_log ADD CONSTRAINT production_log_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_log_product_id_fkey') THEN
    ALTER TABLE public.production_log ADD CONSTRAINT production_log_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
  END IF;

  -- raw_materials
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_materials_category_id_fkey') THEN
    ALTER TABLE public.raw_materials ADD CONSTRAINT raw_materials_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.raw_material_categories(id) ON DELETE SET NULL;
  END IF;

  -- bill_of_materials
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_of_materials_finished_product_id_fkey') THEN
    ALTER TABLE public.bill_of_materials ADD CONSTRAINT bill_of_materials_finished_product_id_fkey
      FOREIGN KEY (finished_product_id) REFERENCES public.products(id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_of_materials_raw_material_id_fkey') THEN
    ALTER TABLE public.bill_of_materials ADD CONSTRAINT bill_of_materials_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_of_materials_raw_material_category_id_fkey') THEN
    ALTER TABLE public.bill_of_materials ADD CONSTRAINT bill_of_materials_raw_material_category_id_fkey
      FOREIGN KEY (raw_material_category_id) REFERENCES public.raw_material_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_of_materials_warehouse_id_fkey') THEN
    ALTER TABLE public.bill_of_materials ADD CONSTRAINT bill_of_materials_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE NO ACTION;
  END IF;

  -- raw_material_stock
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_stock_raw_material_id_fkey') THEN
    ALTER TABLE public.raw_material_stock ADD CONSTRAINT raw_material_stock_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_stock_warehouse_id_fkey') THEN
    ALTER TABLE public.raw_material_stock ADD CONSTRAINT raw_material_stock_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;
  END IF;

  -- raw_material_adjustments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_adjustments_raw_material_id_fkey') THEN
    ALTER TABLE public.raw_material_adjustments ADD CONSTRAINT raw_material_adjustments_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_adjustments_warehouse_id_fkey') THEN
    ALTER TABLE public.raw_material_adjustments ADD CONSTRAINT raw_material_adjustments_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;

  -- vendor_raw_materials
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_raw_materials_vendor_id_fkey') THEN
    ALTER TABLE public.vendor_raw_materials ADD CONSTRAINT vendor_raw_materials_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_raw_materials_raw_material_id_fkey') THEN
    ALTER TABLE public.vendor_raw_materials ADD CONSTRAINT vendor_raw_materials_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;
  END IF;

  -- unit_conversions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_conversions_raw_material_id_fkey') THEN
    ALTER TABLE public.unit_conversions ADD CONSTRAINT unit_conversions_raw_material_id_fkey
      FOREIGN KEY (raw_material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;
  END IF;

  -- store_pricing
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_pricing_store_id_fkey') THEN
    ALTER TABLE public.store_pricing ADD CONSTRAINT store_pricing_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_pricing_product_id_fkey') THEN
    ALTER TABLE public.store_pricing ADD CONSTRAINT store_pricing_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_pricing_warehouse_id_fkey') THEN
    ALTER TABLE public.store_pricing ADD CONSTRAINT store_pricing_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE NO ACTION;
  END IF;

  -- store_type_products
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_type_products_store_type_id_fkey') THEN
    ALTER TABLE public.store_type_products ADD CONSTRAINT store_type_products_store_type_id_fkey
      FOREIGN KEY (store_type_id) REFERENCES public.store_types(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_type_products_product_id_fkey') THEN
    ALTER TABLE public.store_type_products ADD CONSTRAINT store_type_products_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  -- store_type_pricing
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_type_pricing_store_type_id_fkey') THEN
    ALTER TABLE public.store_type_pricing ADD CONSTRAINT store_type_pricing_store_type_id_fkey
      FOREIGN KEY (store_type_id) REFERENCES public.store_types(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_type_pricing_product_id_fkey') THEN
    ALTER TABLE public.store_type_pricing ADD CONSTRAINT store_type_pricing_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_type_pricing_warehouse_id_fkey') THEN
    ALTER TABLE public.store_type_pricing ADD CONSTRAINT store_type_pricing_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE NO ACTION;
  END IF;
END $$;


-- ============================================================
-- PART 3: UNIQUE CONSTRAINTS (as indexes, since Supabase uses indexes)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS product_stock_product_id_warehouse_id_key
    ON public.product_stock USING btree (product_id, warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_display_id_key
    ON public.stock_transfers USING btree (display_id);
CREATE UNIQUE INDEX IF NOT EXISTS raw_materials_display_id_key
    ON public.raw_materials USING btree (display_id);
CREATE UNIQUE INDEX IF NOT EXISTS raw_material_stock_raw_material_id_warehouse_id_key
    ON public.raw_material_stock USING btree (raw_material_id, warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_key
    ON public.product_categories USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS store_pricing_store_id_product_id_key
    ON public.store_pricing USING btree (store_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS store_type_products_store_type_id_product_id_key
    ON public.store_type_products USING btree (store_type_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS store_type_pricing_store_type_id_product_id_key
    ON public.store_type_pricing USING btree (store_type_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_raw_materials_vendor_id_raw_material_id_key
    ON public.vendor_raw_materials USING btree (vendor_id, raw_material_id);


-- ============================================================
-- PART 4: INDEXES
-- ============================================================

-- bill_of_materials
CREATE INDEX IF NOT EXISTS idx_bill_of_materials_warehouse
    ON public.bill_of_materials USING btree (warehouse_id);

-- product_stock
CREATE INDEX IF NOT EXISTS idx_product_stock_deleted_at
    ON public.product_stock USING btree (deleted_at);

-- production_log
CREATE INDEX IF NOT EXISTS idx_prod_log_date
    ON public.production_log USING btree (production_date);
CREATE INDEX IF NOT EXISTS idx_prod_log_product
    ON public.production_log USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_prod_log_warehouse
    ON public.production_log USING btree (warehouse_id);

-- raw_materials
CREATE INDEX IF NOT EXISTS idx_raw_materials_category
    ON public.raw_materials USING btree (category);
CREATE INDEX IF NOT EXISTS idx_raw_materials_category_id
    ON public.raw_materials USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_name
    ON public.raw_materials USING btree (name);
CREATE INDEX IF NOT EXISTS idx_raw_materials_vendor
    ON public.raw_materials USING btree (vendor_id);

-- Trigram index for name search (only create if extension exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_raw_materials_name_trgm
      ON public.raw_materials USING gin (name gin_trgm_ops) WHERE (deleted_at IS NULL);
  END IF;
END $$;

-- raw_material_stock
CREATE INDEX IF NOT EXISTS idx_raw_material_stock_material
    ON public.raw_material_stock USING btree (raw_material_id);
CREATE INDEX IF NOT EXISTS idx_raw_material_stock_warehouse
    ON public.raw_material_stock USING btree (warehouse_id);

-- staff_stock indexes (table already exists but indexes may be missing)
CREATE INDEX IF NOT EXISTS idx_staff_stock_negative
    ON public.staff_stock USING btree (is_negative) WHERE (is_negative = true);
CREATE INDEX IF NOT EXISTS idx_staff_stock_product
    ON public.staff_stock USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_user
    ON public.staff_stock USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_user_product
    ON public.staff_stock USING btree (user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_warehouse
    ON public.staff_stock USING btree (warehouse_id);

-- stock_movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_user
    ON public.stock_movements USING btree (from_user_id) WHERE (from_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
    ON public.stock_movements USING btree (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
    ON public.stock_movements USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sale_ref
    ON public.stock_movements USING btree (reference_id, type) WHERE (type = 'sale'::text);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_user
    ON public.stock_movements USING btree (to_user_id) WHERE (to_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_movements_total_value
    ON public.stock_movements USING btree (total_value) WHERE (total_value > (0)::numeric);
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer
    ON public.stock_movements USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created
    ON public.stock_movements USING btree (type, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_created
    ON public.stock_movements USING btree (warehouse_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id
    ON public.stock_movements USING btree (warehouse_id);

-- stock_transfers
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at
    ON public.stock_transfers USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_user
    ON public.stock_transfers USING btree (from_user_id) WHERE (from_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse
    ON public.stock_transfers USING btree (from_warehouse_id) WHERE (from_warehouse_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_product
    ON public.stock_transfers USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_requested_by
    ON public.stock_transfers USING btree (requested_by) WHERE (requested_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status_warehouse
    ON public.stock_transfers USING btree (status, from_warehouse_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_user
    ON public.stock_transfers USING btree (to_user_id) WHERE (to_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse
    ON public.stock_transfers USING btree (to_warehouse_id) WHERE (to_warehouse_id IS NOT NULL);

-- vendor_raw_materials
CREATE INDEX IF NOT EXISTS idx_vendor_rm_material
    ON public.vendor_raw_materials USING btree (raw_material_id);
CREATE INDEX IF NOT EXISTS idx_vendor_rm_vendor
    ON public.vendor_raw_materials USING btree (vendor_id);


-- ============================================================
-- PART 5: ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS (idempotent — already enabled on live DB)
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_type_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: CREATE POLICY IF NOT EXISTS requires PostgreSQL 15+

-- warehouses
CREATE POLICY IF NOT EXISTS "Admins can manage warehouses" ON public.warehouses
    FOR ALL TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])))
        AND deleted_at IS NULL)
    WITH CHECK ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])))
        AND deleted_at IS NULL);

CREATE POLICY IF NOT EXISTS "Staff can view warehouses" ON public.warehouses
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'agent'::app_role, 'marketer'::app_role, 'operator'::app_role])))
        AND deleted_at IS NULL);

-- product_stock
CREATE POLICY IF NOT EXISTS "Admins can manage stock" ON public.product_stock
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "Staff can view stock" ON public.product_stock
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'agent'::app_role, 'marketer'::app_role, 'operator'::app_role])))
        AND deleted_at IS NULL);

-- stock_transfers
CREATE POLICY IF NOT EXISTS "manager_view_stock_transfers" ON public.stock_transfers
    FOR SELECT TO public
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'::app_role
        AND (ur.warehouse_id = stock_transfers.from_warehouse_id OR ur.warehouse_id = stock_transfers.to_warehouse_id)));

CREATE POLICY IF NOT EXISTS "staff_insert_stock_transfers" ON public.stock_transfers
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role, 'agent'::app_role, 'marketer'::app_role, 'pos'::app_role])));

CREATE POLICY IF NOT EXISTS "staff_update_stock_transfers" ON public.stock_transfers
    FOR UPDATE TO public
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "staff_view_all_stock_transfers" ON public.stock_transfers
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role, 'agent'::app_role, 'marketer'::app_role, 'pos'::app_role])));

CREATE POLICY IF NOT EXISTS "staff_view_own_transfers" ON public.stock_transfers
    FOR SELECT TO authenticated
    USING ((from_user_id = auth.uid()) OR (to_user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "super_admin_all_stock_transfers" ON public.stock_transfers
    FOR ALL TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'super_admin'::app_role)) AND deleted_at IS NULL)
    WITH CHECK ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'super_admin'::app_role)) AND deleted_at IS NULL);

-- stock_movements
CREATE POLICY IF NOT EXISTS "Staff can create movements" ON public.stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'pos'::app_role])));

CREATE POLICY IF NOT EXISTS "Staff can view movements" ON public.stock_movements
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'agent'::app_role, 'marketer'::app_role, 'operator'::app_role])))
        AND deleted_at IS NULL);

-- production_log
CREATE POLICY IF NOT EXISTS "Staff can view production log" ON public.production_log
    FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role));

CREATE POLICY IF NOT EXISTS "production_log_all" ON public.production_log
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

-- raw_materials
CREATE POLICY IF NOT EXISTS "raw_materials_delete" ON public.raw_materials
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'super_admin'::app_role));

CREATE POLICY IF NOT EXISTS "raw_materials_insert" ON public.raw_materials
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "raw_materials_select" ON public.raw_materials
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role])))
        AND deleted_at IS NULL);

CREATE POLICY IF NOT EXISTS "raw_materials_update" ON public.raw_materials
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role])));

-- bill_of_materials
CREATE POLICY IF NOT EXISTS "Admin can manage BOMs" ON public.bill_of_materials
    FOR ALL TO authenticated
    USING ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
        AND (deleted_at IS NULL))
    WITH CHECK ((has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
        AND (deleted_at IS NULL));

-- raw_material_stock
CREATE POLICY IF NOT EXISTS "Staff can view raw material stock" ON public.raw_material_stock
    FOR SELECT TO public
    USING (has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY IF NOT EXISTS "raw_material_stock_all" ON public.raw_material_stock
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role])));

-- raw_material_adjustments — default RLS (admin only)
CREATE POLICY IF NOT EXISTS "raw_material_adjustments_all" ON public.raw_material_adjustments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "raw_material_adjustments_select" ON public.raw_material_adjustments
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role, 'operator'::app_role])));

-- vendor_raw_materials
CREATE POLICY IF NOT EXISTS "Staff can view vendor raw materials" ON public.vendor_raw_materials
    FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY IF NOT EXISTS "vendor_raw_materials_all" ON public.vendor_raw_materials
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "vendor_raw_materials_delete" ON public.vendor_raw_materials
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "vendor_raw_materials_insert" ON public.vendor_raw_materials
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

CREATE POLICY IF NOT EXISTS "vendor_raw_materials_update" ON public.vendor_raw_materials
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

-- raw_material_categories
CREATE POLICY IF NOT EXISTS "Staff can view categories" ON public.raw_material_categories
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY IF NOT EXISTS "raw_material_categories_all" ON public.raw_material_categories
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

-- unit_conversions
CREATE POLICY IF NOT EXISTS "Staff can view conversions" ON public.unit_conversions
    FOR SELECT TO authenticated
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY IF NOT EXISTS "unit_conversions_all" ON public.unit_conversions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])));

-- product_categories
CREATE POLICY IF NOT EXISTS "Admin can delete product categories" ON public.product_categories
    FOR DELETE TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY IF NOT EXISTS "Admin can insert product categories" ON public.product_categories
    FOR INSERT TO authenticated
    WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY IF NOT EXISTS "Admin can update product categories" ON public.product_categories
    FOR UPDATE TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY IF NOT EXISTS "Authenticated can view product categories" ON public.product_categories
    FOR SELECT TO authenticated
    USING ((has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role)
        OR has_role(auth.uid(), 'marketer'::app_role)
        OR has_role(auth.uid(), 'customer'::app_role))
        AND (deleted_at IS NULL));

-- store_pricing
CREATE POLICY IF NOT EXISTS "Admin can manage store pricing" ON public.store_pricing
    FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY IF NOT EXISTS "store_pricing_select" ON public.store_pricing
    FOR SELECT TO authenticated
    USING ((has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role))
        AND (deleted_at IS NULL));

-- store_type_products
CREATE POLICY IF NOT EXISTS "Admin can manage store type products" ON public.store_type_products
    FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY IF NOT EXISTS "store_type_products_select" ON public.store_type_products
    FOR SELECT TO authenticated
    USING ((has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role))
        AND (deleted_at IS NULL));

-- store_type_pricing
CREATE POLICY IF NOT EXISTS "Admin can manage store type pricing" ON public.store_type_pricing
    FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'super_admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY IF NOT EXISTS "store_type_pricing_select" ON public.store_type_pricing
    FOR SELECT TO authenticated
    USING ((has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role))
        AND (deleted_at IS NULL));

-- staff_stock RLS (table already exists, but policies may be missing on fresh project)
CREATE POLICY IF NOT EXISTS "manager_view_staff_stock" ON public.staff_stock
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['manager'::app_role, 'super_admin'::app_role])
        AND ur.warehouse_id = staff_stock.warehouse_id)) OR (user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "operator_view_staff_stock" ON public.staff_stock
    FOR SELECT TO authenticated
    USING ((EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['operator'::app_role, 'manager'::app_role, 'super_admin'::app_role])
        AND (ur.warehouse_id = staff_stock.warehouse_id OR staff_stock.user_id = auth.uid())))
        OR (user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "staff_view_own_stock" ON public.staff_stock
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());


-- ============================================================
-- PART 6: CHECK CONSTRAINTS (non-negative stock)
-- ============================================================

-- Add CHECK(quantity >= 0) with NOT VALID to allow existing data to pass
-- then VALIDATE to catch future violations

DO $$
BEGIN
  -- product_stock.quantity >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_quantity_non_negative') THEN
    ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_quantity_non_negative
      CHECK (quantity >= 0) NOT VALID;
  END IF;

  -- staff_stock.quantity >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_stock_quantity_non_negative') THEN
    ALTER TABLE public.staff_stock ADD CONSTRAINT staff_stock_quantity_non_negative
      CHECK (quantity >= 0) NOT VALID;
  END IF;

  -- raw_material_stock.quantity >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_stock_quantity_non_negative') THEN
    ALTER TABLE public.raw_material_stock ADD CONSTRAINT raw_material_stock_quantity_non_negative
      CHECK (quantity >= 0) NOT VALID;
  END IF;

  -- stock_transfers.quantity >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_quantity_non_negative') THEN
    ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_quantity_non_negative
      CHECK (quantity >= 0) NOT VALID;
  END IF;
END $$;

-- Validate constraints against existing data
ALTER TABLE public.product_stock VALIDATE CONSTRAINT product_stock_quantity_non_negative;
ALTER TABLE public.staff_stock VALIDATE CONSTRAINT staff_stock_quantity_non_negative;
ALTER TABLE public.raw_material_stock VALIDATE CONSTRAINT raw_material_stock_quantity_non_negative;
ALTER TABLE public.stock_transfers VALIDATE CONSTRAINT stock_transfers_quantity_non_negative;


-- ============================================================
-- PART 7: TRIGGERS (for tables that already have them on the live DB)
-- ============================================================

-- Soft-delete handler for applicable tables
-- Note: The soft_delete_handler function is expected to exist already.
-- This trigger is for bill_of_materials which already has it on the live DB.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'soft_delete_handler' AND tgrelid = 'public.bill_of_materials'::regclass) THEN
    CREATE TRIGGER soft_delete_handler
      BEFORE UPDATE ON public.bill_of_materials
      FOR EACH ROW EXECUTE FUNCTION soft_delete_handler();
  END IF;
END $$;

-- raw_material_stock updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_raw_material_stock_updated_at') THEN
    CREATE TRIGGER set_raw_material_stock_updated_at
      BEFORE UPDATE ON public.raw_material_stock
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- raw_material_stock sync trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_rm_current_stock') THEN
    CREATE TRIGGER trg_sync_rm_current_stock
      AFTER INSERT OR DELETE OR UPDATE ON public.raw_material_stock
      FOR EACH ROW EXECUTE FUNCTION sync_raw_material_current_stock();
  END IF;
END $$;

-- stock_transfer notification trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'stock_transfer_notification') THEN
    CREATE TRIGGER stock_transfer_notification
      AFTER INSERT ON public.stock_transfers
      FOR EACH ROW EXECUTE FUNCTION notify_stock_transfer();
  END IF;
END $$;

-- vendor_raw_materials updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_vendor_raw_materials_updated_at') THEN
    CREATE TRIGGER set_vendor_raw_materials_updated_at
      BEFORE UPDATE ON public.vendor_raw_materials
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- warehouse triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_warehouse_created' AND tgrelid = 'public.warehouses'::regclass) THEN
    CREATE TRIGGER on_warehouse_created
      AFTER INSERT ON public.warehouses
      FOR EACH ROW EXECUTE FUNCTION handle_warehouse_created();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'soft_delete_handler' AND tgrelid = 'public.warehouses'::regclass) THEN
    CREATE TRIGGER soft_delete_handler
      BEFORE UPDATE ON public.warehouses
      FOR EACH ROW EXECUTE FUNCTION soft_delete_handler();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_create_default_shop' AND tgrelid = 'public.warehouses'::regclass) THEN
    CREATE TRIGGER trigger_create_default_shop
      AFTER INSERT ON public.warehouses
      FOR EACH ROW EXECUTE FUNCTION create_default_shop_on_warehouse();
  END IF;
END $$;

-- soft_delete_handler for raw_materials
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'soft_delete_handler' AND tgrelid = 'public.raw_materials'::regclass) THEN
    CREATE TRIGGER soft_delete_handler
      BEFORE UPDATE ON public.raw_materials
      FOR EACH ROW EXECUTE FUNCTION soft_delete_handler();
  END IF;
END $$;


-- ============================================================
-- PART 8: PRODUCTS HARD-DELETE PREVENTION
-- ============================================================
-- Block hard DELETE on products that have references in stock tables.
-- Products should be soft-deleted via is_active = false or deleted_at.
-- This prevents silent data loss from ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.prevent_product_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Cannot hard-delete product %. Products must be deactivated (is_active = false) or soft-deleted (set deleted_at) to preserve stock and pricing history.',
    OLD.id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_product_hard_delete') THEN
    CREATE TRIGGER prevent_product_hard_delete
      BEFORE DELETE ON public.products
      FOR EACH ROW EXECUTE FUNCTION prevent_product_hard_delete();
  END IF;
END $$;


-- ============================================================
-- PART 9: MISSING RPCs
-- ============================================================

-- 9.1 generate_display_id
-- Returns formatted display IDs using sequences: PREFIX-NNNNNN
CREATE OR REPLACE FUNCTION public.generate_display_id(prefix TEXT, seq_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN prefix || '-' || lpad(next_val::TEXT, 6, '0');
END;
$$;

-- 9.2 adjust_raw_material_stock
-- Adjusts raw material stock level with audit trail
CREATE OR REPLACE FUNCTION public.adjust_raw_material_stock(
  p_raw_material_id UUID,
  p_warehouse_id UUID,
  p_adjustment_type TEXT,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, previous_quantity NUMERIC, new_quantity NUMERIC, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_quantity NUMERIC;
  v_quantity_before NUMERIC;
  v_quantity_after NUMERIC;
  v_quantity_change NUMERIC;
  v_display_id TEXT;
BEGIN
  SELECT COALESCE(quantity, 0) INTO v_current_quantity
  FROM public.raw_material_stock
  WHERE raw_material_id = p_raw_material_id AND warehouse_id = p_warehouse_id;

  v_quantity_before := v_current_quantity;

  IF p_adjustment_type = 'used' THEN
    v_quantity_change := -p_quantity;
    v_quantity_after := GREATEST(v_current_quantity - p_quantity, 0);
  ELSE
    v_quantity_after := p_quantity;
    v_quantity_change := p_quantity - v_current_quantity;
  END IF;

  v_display_id := public.generate_display_id('ADJ-RM', 'raw_material_adjustment_display_seq');

  INSERT INTO public.raw_material_adjustments (
    raw_material_id, warehouse_id, adjustment_type,
    quantity_before, quantity_change, quantity_after,
    display_id, reason, performed_by
  ) VALUES (
    p_raw_material_id, p_warehouse_id, p_adjustment_type,
    v_quantity_before, v_quantity_change, v_quantity_after,
    v_display_id,
    COALESCE(p_reason, CASE WHEN p_adjustment_type = 'used' THEN 'Consumption' ELSE 'Physical count' END),
    p_performed_by
  );

  INSERT INTO public.raw_material_stock (raw_material_id, warehouse_id, quantity, updated_at)
  VALUES (p_raw_material_id, p_warehouse_id, v_quantity_after, now())
  ON CONFLICT (raw_material_id, warehouse_id)
  DO UPDATE SET quantity = v_quantity_after, updated_at = now();

  RETURN QUERY SELECT true, v_quantity_before, v_quantity_after, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, SQLERRM;
END;
$$;

-- 9.3 process_production_log
-- Records production batch: deducts BOM raw materials, adds finished goods to stock
CREATE OR REPLACE FUNCTION public.process_production_log(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced NUMERIC,
  p_wastage_quantity NUMERIC DEFAULT 0,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bom RECORD;
  v_total_raw_qty NUMERIC;
  v_materials_consumed INTEGER := 0;
  v_log_id UUID;
  v_rows_affected INTEGER;
  v_success BOOLEAN;
BEGIN
  IF p_quantity_produced <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Quantity produced must be positive');
  END IF;

  INSERT INTO public.production_log (
    warehouse_id, product_id, quantity_produced, wastage_quantity,
    production_date, notes, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, p_quantity_produced, p_wastage_quantity,
    p_production_date, p_notes, p_created_by
  ) RETURNING id INTO v_log_id;

  FOR v_bom IN
    SELECT b.*
    FROM public.bill_of_materials b
    WHERE b.finished_product_id = p_product_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND b.raw_material_id IS NOT NULL
      AND (b.warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
  LOOP
    v_total_raw_qty := v_bom.quantity * p_quantity_produced;

    SELECT success INTO v_success
    FROM public.adjust_raw_material_stock(
      p_raw_material_id := v_bom.raw_material_id,
      p_warehouse_id := p_warehouse_id,
      p_adjustment_type := 'used',
      p_quantity := v_total_raw_qty,
      p_reason := 'Production log ' || v_log_id::TEXT,
      p_performed_by := p_created_by
    );

    IF v_success THEN
      v_materials_consumed := v_materials_consumed + 1;
    END IF;
  END LOOP;

  UPDATE public.product_stock
  SET quantity = quantity + p_quantity_produced, updated_at = now()
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, p_quantity_produced, now());
  END IF;

  INSERT INTO public.stock_movements (
    product_id, warehouse_id, quantity, type,
    reference_id, reason, created_by, created_at
  ) VALUES (
    p_product_id, p_warehouse_id, p_quantity_produced, 'production',
    v_log_id::TEXT, 'Production batch', p_created_by, now()
  );

  RETURN json_build_object('success', true, 'production_log_id', v_log_id, 'materials_consumed', v_materials_consumed);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9.4 get_bom_summary
-- Returns a summary of BOM requirements for a product
CREATE OR REPLACE FUNCTION public.get_bom_summary(p_product_id UUID)
RETURNS TABLE(
  raw_material_id UUID,
  raw_material_name TEXT,
  raw_material_unit TEXT,
  category_name TEXT,
  quantity_per_unit NUMERIC,
  quantity_unit TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.raw_material_id,
    rm.name AS raw_material_name,
    rm.unit AS raw_material_unit,
    rmc.name AS category_name,
    b.quantity AS quantity_per_unit,
    b.quantity_unit
  FROM public.bill_of_materials b
  LEFT JOIN public.raw_materials rm ON rm.id = b.raw_material_id
  LEFT JOIN public.raw_material_categories rmc ON rmc.id = b.raw_material_category_id
  WHERE b.finished_product_id = p_product_id
    AND b.is_active = true
    AND b.deleted_at IS NULL;
END;
$$;


-- ============================================================
-- PART 10: SEQUENCES (for generate_display_id)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.raw_material_adjustment_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.raw_material_display_seq START 1;
