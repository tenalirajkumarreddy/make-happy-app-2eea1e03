-- ==========================================
-- RAW MATERIALS MANAGEMENT SCHEMA
-- ==========================================
-- Supports raw material inventory tracking with:
-- - Per-warehouse stock levels
-- - Stock adjustments (Used/Remaining)
-- - Vendor linking for procurement
-- - Integration with purchases

-- 1. Raw Materials Master Table
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'kg',
  category TEXT,
  min_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0,
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  hsn_code TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_raw_materials_name ON public.raw_materials(name);
CREATE INDEX idx_raw_materials_category ON public.raw_materials(category);
CREATE INDEX idx_raw_materials_is_active ON public.raw_materials(is_active);

-- 2. Raw Material Stock by Warehouse (similar to product_stock)
CREATE TABLE IF NOT EXISTS public.raw_material_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(raw_material_id, warehouse_id)
);

ALTER TABLE public.raw_material_stock ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_raw_material_stock_material ON public.raw_material_stock(raw_material_id);
CREATE INDEX idx_raw_material_stock_warehouse ON public.raw_material_stock(warehouse_id);

-- 3. Raw Material Stock Adjustments
-- Tracks "Used" (consumption) and "Remaining" (physical count) adjustments
CREATE TABLE IF NOT EXISTS public.raw_material_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('used', 'remaining', 'purchase', 'return', 'transfer_in', 'transfer_out', 'initial')),
  quantity_before NUMERIC(12,3) NOT NULL,
  quantity_change NUMERIC(12,3) NOT NULL, -- Negative for used/transfer_out, positive for purchase/return/transfer_in
  quantity_after NUMERIC(12,3) NOT NULL,
  reason TEXT,
  reference_id TEXT, -- Optional: link to purchase_id, etc.
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_material_adjustments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_rm_adjustments_material ON public.raw_material_adjustments(raw_material_id);
CREATE INDEX idx_rm_adjustments_warehouse ON public.raw_material_adjustments(warehouse_id);
CREATE INDEX idx_rm_adjustments_type ON public.raw_material_adjustments(adjustment_type);
CREATE INDEX idx_rm_adjustments_created ON public.raw_material_adjustments(created_at);

-- 4. Vendor-Raw Material Linking (for procurement)
CREATE TABLE IF NOT EXISTS public.vendor_raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, raw_material_id)
);

ALTER TABLE public.vendor_raw_materials ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vendor_rm_vendor ON public.vendor_raw_materials(vendor_id);
CREATE INDEX idx_vendor_rm_material ON public.vendor_raw_materials(raw_material_id);

-- 5. Display ID Sequence for Raw Materials
CREATE SEQUENCE IF NOT EXISTS public.raw_material_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.rm_adjustment_display_seq START 1;

-- 6. RLS Policies

-- Raw Materials: Staff can view, super_admin/manager can modify
CREATE POLICY "Staff can view raw materials" ON public.raw_materials
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'agent'::app_role)
  OR public.has_role(auth.uid(), 'marketer'::app_role)
  OR public.has_role(auth.uid(), 'pos'::app_role)
);

CREATE POLICY "Admin/Manager can insert raw materials" ON public.raw_materials
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Admin/Manager can update raw materials" ON public.raw_materials
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Admin can delete raw materials" ON public.raw_materials
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Raw Material Stock: Staff can view, admin/manager can modify
CREATE POLICY "Staff can view raw material stock" ON public.raw_material_stock
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'agent'::app_role)
  OR public.has_role(auth.uid(), 'pos'::app_role)
);

CREATE POLICY "Admin/Manager can modify raw material stock" ON public.raw_material_stock
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Raw Material Adjustments: Staff can view, admin/manager/pos can insert
CREATE POLICY "Staff can view rm adjustments" ON public.raw_material_adjustments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'pos'::app_role)
);

CREATE POLICY "Staff can insert rm adjustments" ON public.raw_material_adjustments
FOR INSERT TO authenticated
WITH CHECK (
  adjusted_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'pos'::app_role)
  )
);

-- Vendor Raw Materials: Staff can view, admin/manager can modify
CREATE POLICY "Staff can view vendor raw materials" ON public.vendor_raw_materials
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Admin/Manager can modify vendor raw materials" ON public.vendor_raw_materials
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 7. Trigger to update raw_materials.current_stock when raw_material_stock changes
CREATE OR REPLACE FUNCTION public.sync_raw_material_current_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the current_stock on raw_materials as sum of all warehouse stocks
  UPDATE public.raw_materials
  SET current_stock = COALESCE((
    SELECT SUM(quantity)
    FROM public.raw_material_stock
    WHERE raw_material_id = COALESCE(NEW.raw_material_id, OLD.raw_material_id)
  ), 0),
  updated_at = now()
  WHERE id = COALESCE(NEW.raw_material_id, OLD.raw_material_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_rm_current_stock
AFTER INSERT OR UPDATE OR DELETE ON public.raw_material_stock
FOR EACH ROW EXECUTE FUNCTION public.sync_raw_material_current_stock();

-- 8. Updated_at triggers
CREATE TRIGGER set_raw_materials_updated_at
BEFORE UPDATE ON public.raw_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_raw_material_stock_updated_at
BEFORE UPDATE ON public.raw_material_stock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_vendor_raw_materials_updated_at
BEFORE UPDATE ON public.vendor_raw_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
