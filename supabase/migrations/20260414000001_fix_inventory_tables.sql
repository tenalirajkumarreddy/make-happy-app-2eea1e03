-- ============================================================================
-- MIGRATION: Fix Inventory Tables - Add Missing warehouses and product_stock
-- ============================================================================
-- Date: 2026-04-14
-- Purpose: Create missing tables required by Inventory page

-- ============================================================================
-- 1. CREATE WAREHOUSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_active ON public.warehouses(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_warehouses_name ON public.warehouses(name);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for warehouses
CREATE POLICY "Staff can view warehouses" ON public.warehouses
FOR SELECT TO authenticated
USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'agent'::app_role)
    OR public.has_role(auth.uid(), 'marketer'::app_role)
    OR public.has_role(auth.uid(), 'pos'::app_role)
);

CREATE POLICY "Admin can manage warehouses" ON public.warehouses
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER set_warehouses_updated_at
BEFORE UPDATE ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. CREATE PRODUCT_STOCK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL DEFAULT 0,
    min_stock_level NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_product ON public.product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_warehouse ON public.product_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_low_stock ON public.product_stock(quantity, min_stock_level) WHERE quantity <= min_stock_level;

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_stock
CREATE POLICY "Staff can view product_stock" ON public.product_stock
FOR SELECT TO authenticated
USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'agent'::app_role)
    OR public.has_role(auth.uid(), 'marketer'::app_role)
    OR public.has_role(auth.uid(), 'pos'::app_role)
);

CREATE POLICY "Admin/Manager can modify product_stock" ON public.product_stock
FOR ALL TO authenticated
USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER set_product_stock_updated_at
BEFORE UPDATE ON public.product_stock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. ADD REALTIME SUPPORT
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_stock;

-- ============================================================================
-- 4. INSERT DEFAULT WAREHOUSE (optional - for existing data migration)
-- ============================================================================
-- If you have existing data that needs a default warehouse, uncomment:
-- INSERT INTO public.warehouses (id, name, is_active)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'Main Warehouse', true)
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.warehouses IS 'Storage locations for inventory management';
COMMENT ON TABLE public.product_stock IS 'Per-warehouse product stock levels';
