-- ============================================================================
-- MIGRATION: Staff Inventory System Enhancement
-- Applied: 2026-04-12
-- ============================================================================
-- Purpose: Enhanced staff stock management with value tracking and timestamps

-- 1. Add new columns to staff_stock table
ALTER TABLE public.staff_stock
ADD COLUMN IF NOT EXISTS amount_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS transfer_count INTEGER DEFAULT 0;

-- Create index for value calculations
CREATE INDEX IF NOT EXISTS idx_staff_stock_value ON public.staff_stock(user_id, amount_value) WHERE amount_value > 0;
CREATE INDEX IF NOT EXISTS idx_staff_stock_dates ON public.staff_stock(last_received_at, last_sale_at);

-- 2. Create staff_inventory_summary view
DROP VIEW IF EXISTS public.staff_inventory_summary;
CREATE VIEW public.staff_inventory_summary AS
SELECT 
    ss.user_id,
    p.full_name,
    p.email,
    p.avatar_url,
    ur.role as user_role,
    ss.warehouse_id,
    w.name as warehouse_name,
    COUNT(ss.product_id) as total_products,
    SUM(ss.quantity) as total_quantity,
    SUM(ss.amount_value) as total_value,
    COUNT(CASE WHEN ss.is_negative THEN 1 END) as negative_products,
    SUM(CASE WHEN ss.is_negative THEN ss.amount_value ELSE 0 END) as negative_value,
    MAX(ss.last_received_at) as last_received,
    MAX(ss.last_sale_at) as last_sale,
    SUM(ss.transfer_count) as total_transfers
FROM public.staff_stock ss
LEFT JOIN public.profiles p ON ss.user_id = p.id
LEFT JOIN public.user_roles ur ON ss.user_id = ur.user_id
LEFT JOIN public.warehouses w ON ss.warehouse_id = w.id
GROUP BY ss.user_id, p.full_name, p.email, p.avatar_url, ur.role, ss.warehouse_id, w.name;

-- 3. Create calculate_staff_inventory_value function
CREATE OR REPLACE FUNCTION public.calculate_staff_inventory_value(p_user_id UUID, p_warehouse_id UUID DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_value NUMERIC;
BEGIN
    SELECT COALESCE(SUM(ss.quantity * COALESCE(p.base_price, 0)), 0)
    INTO total_value
    FROM public.staff_stock ss
    JOIN public.products p ON ss.product_id = p.id
    WHERE ss.user_id = p_user_id
    AND (p_warehouse_id IS NULL OR ss.warehouse_id = p_warehouse_id)
    AND NOT ss.is_negative;
    
    RETURN total_value;
END;
$$;

-- 4. Create trigger to auto-update amount_value and timestamps
CREATE OR REPLACE FUNCTION public.update_staff_stock_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    product_price NUMERIC;
BEGIN
    -- Get product base price
    SELECT base_price INTO product_price
    FROM public.products
    WHERE id = NEW.product_id;
    
    -- Calculate amount value
    NEW.amount_value := NEW.quantity * COALESCE(product_price, 0);
    
    -- Update timestamps based on operation
    IF NEW.quantity > COALESCE(OLD.quantity, 0) THEN
        NEW.last_received_at := NOW();
        NEW.transfer_count := COALESCE(OLD.transfer_count, 0) + 1;
    ELSIF NEW.quantity < COALESCE(OLD.quantity, NEW.quantity) THEN
        NEW.last_sale_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_staff_stock_value ON public.staff_stock;
CREATE TRIGGER trigger_update_staff_stock_value
    BEFORE INSERT OR UPDATE ON public.staff_stock
    FOR EACH ROW
    EXECUTE FUNCTION public.update_staff_stock_value();

-- 5. Add RLS policies for staff inventory summary
ALTER VIEW public.staff_inventory_summary OWNER TO postgres;

-- Grant access to authenticated users
GRANT SELECT ON public.staff_inventory_summary TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.staff_inventory_summary IS 'Aggregated view of staff inventory holdings with value calculations';
COMMENT ON FUNCTION public.calculate_staff_inventory_value IS 'Calculates total inventory value for a staff member';
