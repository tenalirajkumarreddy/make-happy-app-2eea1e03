-- ============================================================================
-- MIGRATION: Enhanced Stock Movements
-- Applied: 2026-04-12
-- ============================================================================
-- Purpose: Add location tracking and value columns to stock movements

-- 1. Add location tracking columns to stock_movements
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS from_location TEXT,
ADD COLUMN IF NOT EXISTS to_location TEXT,
ADD COLUMN IF NOT EXISTS from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.stock_transfers(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_user ON public.stock_movements(from_user_id) WHERE from_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_user ON public.stock_movements(to_user_id) WHERE to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer ON public.stock_movements(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_value ON public.stock_movements(total_value) WHERE total_value > 0;

-- 2. Add similar columns to raw_material_adjustments
ALTER TABLE public.raw_material_adjustments
ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raw_material_adjustments_vendor ON public.raw_material_adjustments(vendor_id) WHERE vendor_id IS NOT NULL;

-- 3. Create record_stock_movement function
CREATE OR REPLACE FUNCTION public.record_stock_movement(
    p_product_id UUID,
    p_warehouse_id UUID,
    p_quantity NUMERIC,
    p_type TEXT,
    p_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_from_user_id UUID DEFAULT NULL,
    p_to_user_id UUID DEFAULT NULL,
    p_transfer_id UUID DEFAULT NULL,
    p_unit_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_new_quantity NUMERIC;
    v_product_price NUMERIC;
    v_total_value NUMERIC;
    v_stock_record_id UUID;
    v_from_location TEXT;
    v_to_location TEXT;
BEGIN
    -- Get product price if not provided
    IF p_unit_price IS NULL OR p_unit_price = 0 THEN
        SELECT base_price INTO v_product_price
        FROM public.products
        WHERE id = p_product_id;
    ELSE
        v_product_price := p_unit_price;
    END IF;
    
    -- Calculate total value
    v_total_value := ABS(p_quantity) * COALESCE(v_product_price, 0);
    
    -- Determine locations based on movement type
    CASE p_type
        WHEN 'transfer_in' THEN
            v_from_location := 'Warehouse Transfer';
            v_to_location := 'Current Warehouse';
        WHEN 'transfer_out' THEN
            v_from_location := 'Current Warehouse';
            v_to_location := 'Warehouse Transfer';
        WHEN 'staff_to_warehouse' THEN
            v_from_location := 'Staff Stock';
            v_to_location := 'Warehouse';
        WHEN 'warehouse_to_staff' THEN
            v_from_location := 'Warehouse';
            v_to_location := 'Staff Stock';
        ELSE
            v_from_location := 'Warehouse';
            v_to_location := 'Warehouse';
    END CASE;
    
    -- Record the movement
    INSERT INTO public.stock_movements (
        product_id,
        warehouse_id,
        quantity,
        type,
        reason,
        created_by,
        from_user_id,
        to_user_id,
        transfer_id,
        unit_price,
        total_value,
        from_location,
        to_location
    ) VALUES (
        p_product_id,
        p_warehouse_id,
        p_quantity,
        p_type,
        p_reason,
        p_user_id,
        p_from_user_id,
        p_to_user_id,
        p_transfer_id,
        v_product_price,
        v_total_value,
        v_from_location,
        v_to_location
    );
    
    -- Update or insert stock record
    SELECT id, COALESCE(quantity, 0) INTO v_stock_record_id, v_new_quantity
    FROM public.product_stock
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id
    FOR UPDATE;
    
    IF v_stock_record_id IS NOT NULL THEN
        v_new_quantity := v_new_quantity + p_quantity;
        
        UPDATE public.product_stock
        SET quantity = v_new_quantity,
            updated_at = NOW()
        WHERE id = v_stock_record_id;
    ELSE
        v_new_quantity := p_quantity;
        
        INSERT INTO public.product_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, p_product_id, v_new_quantity);
    END IF;
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'warehouse_id', p_warehouse_id,
        'quantity_change', p_quantity,
        'new_quantity', v_new_quantity,
        'total_value', v_total_value,
        'type', p_type
    );
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'product_id', p_product_id
        );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.record_stock_movement TO authenticated;

-- 4. Create trigger to auto-calculate total_value
CREATE OR REPLACE FUNCTION public.calculate_movement_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_price NUMERIC;
BEGIN
    -- Only calculate if unit_price is 0 or null
    IF COALESCE(NEW.unit_price, 0) = 0 THEN
        SELECT base_price INTO v_product_price
        FROM public.products
        WHERE id = NEW.product_id;
        
        NEW.unit_price := COALESCE(v_product_price, 0);
    END IF;
    
    -- Calculate total value
    NEW.total_value := ABS(NEW.quantity) * NEW.unit_price;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_calculate_movement_value ON public.stock_movements;
CREATE TRIGGER trigger_calculate_movement_value
    BEFORE INSERT OR UPDATE ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_movement_value();

-- 5. Create stock_movements_summary view
DROP VIEW IF EXISTS public.stock_movements_summary;
CREATE VIEW public.stock_movements_summary AS
SELECT 
    sm.*,
    p.name as product_name,
    p.sku as product_sku,
    p.base_price as current_base_price,
    w.name as warehouse_name,
    from_user.full_name as from_user_name,
    to_user.full_name as to_user_name,
    creator.full_name as created_by_name
FROM public.stock_movements sm
LEFT JOIN public.products p ON sm.product_id = p.id
LEFT JOIN public.warehouses w ON sm.warehouse_id = w.id
LEFT JOIN public.profiles from_user ON sm.from_user_id = from_user.id
LEFT JOIN public.profiles to_user ON sm.to_user_id = to_user.id
LEFT JOIN public.profiles creator ON sm.created_by = creator.id;

-- Grant access
GRANT SELECT ON public.stock_movements_summary TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.record_stock_movement IS 'Records a stock movement with automatic value calculation and stock updates';
COMMENT ON VIEW public.stock_movements_summary IS 'Enhanced view of stock movements with user and product details';
