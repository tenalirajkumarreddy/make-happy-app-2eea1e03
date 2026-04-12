-- ============================================================================
-- MIGRATION: Warehouse POS Integration
-- Applied: 2026-04-12
-- ============================================================================
-- Purpose: Enable POS sales to draw from warehouse stock

-- 1. Create pos_stores table
CREATE TABLE IF NOT EXISTS public.pos_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT UNIQUE NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pos_stores_warehouse ON public.pos_stores(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_pos_stores_active ON public.pos_stores(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.pos_stores ENABLE ROW LEVEL SECURITY;

-- 2. Create trigger to auto-create POS store for new warehouses
CREATE OR REPLACE FUNCTION public.auto_create_pos_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    pos_display_id TEXT;
BEGIN
    -- Generate display ID
    pos_display_id := 'POS-' || UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 6));
    
    -- Create POS store for this warehouse
    INSERT INTO public.pos_stores (display_id, warehouse_id, name, is_active)
    VALUES (
        pos_display_id,
        NEW.id,
        COALESCE(NEW.name, 'POS Store') || ' - Counter',
        true
    );
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_pos_store ON public.warehouses;
CREATE TRIGGER trigger_auto_create_pos_store
    AFTER INSERT ON public.warehouses
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_pos_store();

-- 3. Add pos_store_id to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS pos_store_id UUID REFERENCES public.pos_stores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS stock_source TEXT DEFAULT 'warehouse' CHECK (stock_source IN ('warehouse', 'staff', 'pos_store'));

CREATE INDEX IF NOT EXISTS idx_sales_pos_store ON public.sales(pos_store_id) WHERE pos_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_stock_source ON public.sales(stock_source);

-- 4. Create get_sale_stock_source function
CREATE OR REPLACE FUNCTION public.get_sale_stock_source(
    p_user_id UUID,
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity NUMERIC
)
RETURNS TABLE (
    source_type TEXT,
    source_id UUID,
    available_quantity NUMERIC,
    can_fulfill BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role TEXT;
    v_warehouse_stock NUMERIC;
    v_staff_stock NUMERIC;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- Check warehouse stock
    SELECT COALESCE(quantity, 0) INTO v_warehouse_stock
    FROM public.product_stock
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
    
    -- Check staff stock
    SELECT COALESCE(quantity, 0) INTO v_staff_stock
    FROM public.staff_stock
    WHERE user_id = p_user_id AND product_id = p_product_id AND warehouse_id = p_warehouse_id;
    
    -- Determine source based on role and availability
    IF v_user_role = 'pos' THEN
        -- POS always uses warehouse stock
        RETURN QUERY SELECT 
            'warehouse'::TEXT,
            p_warehouse_id::UUID,
            v_warehouse_stock::NUMERIC,
            (v_warehouse_stock >= p_quantity)::BOOLEAN;
    ELSIF v_user_role IN ('agent', 'marketer') AND v_staff_stock >= p_quantity THEN
        -- Agents/marketers prefer staff stock if available
        RETURN QUERY SELECT 
            'staff'::TEXT,
            p_user_id::UUID,
            v_staff_stock::NUMERIC,
            true::BOOLEAN;
    ELSE
        -- Default to warehouse stock
        RETURN QUERY SELECT 
            'warehouse'::TEXT,
            p_warehouse_id::UUID,
            v_warehouse_stock::NUMERIC,
            (v_warehouse_stock >= p_quantity)::BOOLEAN;
    END IF;
END;
$$;

-- 5. Create RLS policies for pos_stores
CREATE POLICY "pos_stores_super_admin_all" ON public.pos_stores
    FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "pos_stores_manager_view" ON public.pos_stores
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role = 'manager' 
        AND ur.warehouse_id = pos_stores.warehouse_id
    ));

CREATE POLICY "pos_stores_pos_view_own" ON public.pos_stores
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role = 'pos'
        AND ur.warehouse_id = pos_stores.warehouse_id
    ));

-- 6. Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_stores;

-- Add comments
COMMENT ON TABLE public.pos_stores IS 'POS stores linked to warehouses for stock management';
COMMENT ON FUNCTION public.get_sale_stock_source IS 'Determines the best stock source for a sale based on user role and availability';
