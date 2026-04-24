-- Migration: Create stock_movements_with_creator view
-- Date: 2026-04-22
-- Description: Optimized view that joins stock_movements with creator profiles

-- ============================================================================
-- VIEW: stock_movements_with_creator
-- Combines stock_movements with creator profile info to eliminate N+1 queries
-- ============================================================================

DROP VIEW IF EXISTS public.stock_movements_with_creator;

CREATE VIEW public.stock_movements_with_creator AS
SELECT 
    sm.id,
    sm.quantity,
    sm.type,
    sm.reason,
    sm.created_at,
    sm.created_by,
    sm.warehouse_id,
    sm.product_id,
    p.name as product_name,
    p.sku as product_sku,
    p.unit as product_unit,
    prof.full_name as creator_name,
    prof.avatar_url as creator_avatar
FROM public.stock_movements sm
LEFT JOIN public.products p ON sm.product_id = p.id
LEFT JOIN public.profiles prof ON sm.created_by = prof.user_id;

-- Add RLS policy for the view (inherits from underlying tables)
ALTER VIEW public.stock_movements_with_creator SET (security_invoker = on);

-- Grant select permissions
GRANT SELECT ON public.stock_movements_with_creator TO authenticated;
GRANT SELECT ON public.stock_movements_with_creator TO service_role;

-- ============================================================================
-- FUNCTION: get_stock_movements_with_creator
-- RPC function for optimized stock movements fetching
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_stock_movements_with_creator(
    p_warehouse_id UUID,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    quantity NUMERIC,
    type TEXT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    warehouse_id UUID,
    product_id UUID,
    product_name TEXT,
    product_sku TEXT,
    product_unit TEXT,
    creator_name TEXT,
    creator_avatar TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT 
        smwc.id,
        smwc.quantity,
        smwc.type,
        smwc.reason,
        smwc.created_at,
        smwc.created_by,
        smwc.warehouse_id,
        smwc.product_id,
        smwc.product_name,
        smwc.product_sku,
        smwc.product_unit,
        smwc.creator_name,
        smwc.creator_avatar
    FROM public.stock_movements_with_creator smwc
    WHERE smwc.warehouse_id = p_warehouse_id
    ORDER BY smwc.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_stock_movements_with_creator(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_movements_with_creator(UUID, INTEGER, INTEGER) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.get_stock_movements_with_creator IS 
'Optimized function to get stock movements with creator profiles in a single query. Eliminates N+1 pattern.';
