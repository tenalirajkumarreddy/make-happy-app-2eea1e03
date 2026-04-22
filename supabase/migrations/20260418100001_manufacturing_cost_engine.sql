-- ==========================================
-- MANUFACTURING COST ENGINE
-- ==========================================
-- Phase 1: Schema + Functions for WAC auto-calc, BOM costing, overhead absorption
-- Applied via Supabase MCP on 2026-04-18

BEGIN;

-- 1. Enhance raw_materials with unit conversion columns
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS piece_weight_grams NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS pieces_per_case INTEGER,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.raw_material_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raw_materials_category_id ON public.raw_materials(category_id);

-- 2. Enhance raw_material_categories with warehouse + base_unit
ALTER TABLE public.raw_material_categories
  ADD COLUMN IF NOT EXISTS base_unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;

ALTER TABLE public.raw_material_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff can view categories' AND tablename = 'raw_material_categories') THEN
    CREATE POLICY "Staff can view categories" ON public.raw_material_categories
    FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can manage categories' AND tablename = 'raw_material_categories') THEN
    CREATE POLICY "Admin can manage categories" ON public.raw_material_categories
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));
  END IF;
END $$;

-- 3. Enhance bill_of_materials
ALTER TABLE public.bill_of_materials
  ADD COLUMN IF NOT EXISTS raw_material_id UUID,
  ADD COLUMN IF NOT EXISTS raw_material_category_id UUID REFERENCES public.raw_material_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT NOT NULL DEFAULT 'pieces',
  ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;

-- 4. Manufacturing Expenses Table
CREATE TABLE IF NOT EXISTS public.manufacturing_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('salary', 'rent', 'electricity', 'maintenance', 'depreciation', 'fuel', 'packaging', 'other')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  period_month DATE NOT NULL,
  description TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.manufacturing_expenses ENABLE ROW LEVEL SECURITY;

-- 5. Production Log Table
CREATE TABLE IF NOT EXISTS public.production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_produced INTEGER NOT NULL CHECK (quantity_produced > 0),
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  wastage_quantity INTEGER NOT NULL DEFAULT 0 CHECK (wastage_quantity >= 0),
  wastage_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.production_log ENABLE ROW LEVEL SECURITY;

-- 6. WAC Trigger
CREATE OR REPLACE FUNCTION public.recalculate_wac_on_purchase() RETURNS TRIGGER AS $$ ... $$;
DROP TRIGGER IF EXISTS trg_wac_on_purchase ON public.raw_material_adjustments;
CREATE TRIGGER trg_wac_on_purchase AFTER INSERT ON public.raw_material_adjustments FOR EACH ROW EXECUTE FUNCTION public.recalculate_wac_on_purchase();

-- 7-10. RPC Functions
-- calculate_bom_cost(product_id, warehouse_id) -> NUMERIC
-- calculate_overhead_per_unit(warehouse_id) -> NUMERIC
-- calculate_total_product_cost(product_id, warehouse_id) -> TABLE(bom_cost, overhead_cost, total_cost)
-- get_pieces_per_kg(piece_weight_grams) -> INTEGER

NOTIFY pgrst, 'reload schema';
COMMIT;
