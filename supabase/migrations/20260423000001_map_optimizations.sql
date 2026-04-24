-- Migration: Map Page Optimizations
-- Created: 2026-04-23
-- Purpose: Optimize database queries and add security for MapPage component

-- ============================================
-- 1. COMPOSITE INDEXES FOR MAP QUERIES
-- ============================================

-- Index for fetching stores with location data (used in MapPage)
CREATE INDEX IF NOT EXISTS idx_stores_map_location 
ON public.stores (warehouse_id, store_type_id, is_active) 
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Index for route-based store filtering
CREATE INDEX IF NOT EXISTS idx_stores_route_location 
ON public.stores (route_id, is_active) 
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Index for active sessions with location
CREATE INDEX IF NOT EXISTS idx_route_sessions_active_location 
ON public.route_sessions (status, user_id) 
WHERE status = 'active' AND current_lat IS NOT NULL AND current_lng IS NOT NULL;

-- Index for store visits lookup by session
CREATE INDEX IF NOT EXISTS idx_store_visits_session 
ON public.store_visits (session_id, store_id) 
WHERE visited_at IS NOT NULL;

-- Index for pending orders by store
CREATE INDEX IF NOT EXISTS idx_orders_pending_store 
ON public.orders (store_id, warehouse_id, status) 
WHERE status = 'pending';

-- ============================================
-- 2. OPTIMIZED VIEW FOR MAP DATA
-- ============================================

CREATE OR REPLACE VIEW public.stores_for_map AS
SELECT 
    s.id,
    s.name,
    s.display_id,
    s.address,
    s.lat,
    s.lng,
    s.outstanding,
    s.is_active,
    s.phone,
    s.store_type_id,
    s.route_id,
    s.warehouse_id,
    st.name AS store_type_name,
    r.name AS route_name,
    c.name AS customer_name
FROM public.stores s
LEFT JOIN public.store_types st ON s.store_type_id = st.id
LEFT JOIN public.routes r ON s.route_id = r.id
LEFT JOIN public.customers c ON s.customer_id = c.id
WHERE s.deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON VIEW public.stores_for_map IS 
'Optimized view for map display with all necessary joins pre-computed. Use with warehouse_id filter for best performance.';

-- ============================================
-- 3. FUNCTION FOR EFFICIENT MAP DATA FETCHING
-- ============================================

CREATE OR REPLACE FUNCTION public.get_stores_for_map(
    p_warehouse_id UUID DEFAULT NULL,
    p_store_type_id UUID DEFAULT NULL,
    p_route_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    outstanding NUMERIC,
    is_active BOOLEAN,
    phone TEXT,
    store_type_id UUID,
    route_id UUID,
    store_type_name TEXT,
    route_name TEXT,
    customer_name TEXT
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.display_id,
        s.address,
        s.lat,
        s.lng,
        s.outstanding,
        s.is_active,
        s.phone,
        s.store_type_id,
        s.route_id,
        st.name AS store_type_name,
        r.name AS route_name,
        c.name AS customer_name
    FROM public.stores s
    LEFT JOIN public.store_types st ON s.store_type_id = st.id
    LEFT JOIN public.routes r ON s.route_id = r.id
    LEFT JOIN public.customers c ON s.customer_id = c.id
    WHERE s.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
    AND (p_store_type_id IS NULL OR s.store_type_id = p_store_type_id)
    AND (p_route_id IS NULL OR s.route_id = p_route_id)
    ORDER BY s.name
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_stores_for_map IS 
'Efficient function for fetching store data for map display. Supports filtering by warehouse, store type, and route.';

-- ============================================
-- 4. FUNCTION FOR AGENT LOCATIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_active_agent_locations(
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
    session_id UUID,
    user_id UUID,
    started_at TIMESTAMPTZ,
    current_lat DOUBLE PRECISION,
    current_lng DOUBLE PRECISION,
    location_updated_at TIMESTAMPTZ,
    route_name TEXT,
    agent_name TEXT
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rs.id AS session_id,
        rs.user_id,
        rs.started_at,
        rs.current_lat,
        rs.current_lng,
        rs.location_updated_at,
        r.name AS route_name,
        p.full_name AS agent_name
    FROM public.route_sessions rs
    LEFT JOIN public.routes r ON rs.route_id = r.id
    LEFT JOIN public.profiles p ON rs.user_id = p.id
    WHERE rs.status = 'active'
    AND rs.current_lat IS NOT NULL 
    AND rs.current_lng IS NOT NULL
    AND (p_warehouse_id IS NULL OR rs.warehouse_id = p_warehouse_id OR r.warehouse_id = p_warehouse_id);
END;
$$;

COMMENT ON FUNCTION public.get_active_agent_locations IS 
'Fetch real-time agent locations for map display. Returns only active sessions with valid GPS coordinates.';

-- ============================================
-- 5. RLS POLICY FOR route_sessions
-- ============================================

-- First enable RLS if not already enabled
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated to view active sessions" ON public.route_sessions;
DROP POLICY IF EXISTS "Allow agents to manage their own sessions" ON public.route_sessions;

-- Policy: Allow staff to view active sessions (for map display)
CREATE POLICY "Allow authenticated to view active sessions"
ON public.route_sessions
FOR SELECT
TO authenticated
USING (
    status = 'active' 
    AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
);

-- Policy: Allow agents to manage their own sessions
CREATE POLICY "Allow agents to manage their own sessions"
ON public.route_sessions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================
-- 6. INDEX FOR VISITED STORES QUERY
-- ============================================

CREATE INDEX IF NOT EXISTS idx_store_visits_session_store_visited 
ON public.store_visits (session_id, store_id, visited_at);

-- ============================================
-- 7. OPTIMIZE store_visits RLS
-- ============================================

ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to view visits" ON public.store_visits;
DROP POLICY IF EXISTS "Allow agents to manage their visits" ON public.store_visits;

-- Policy: Allow staff to view all visits (for map display)
CREATE POLICY "Allow authenticated to view visits"
ON public.store_visits
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'manager', 'agent', 'marketer')
    )
);

-- Policy: Allow agents to manage their own visits
CREATE POLICY "Allow agents to manage their visits"
ON public.store_visits
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.route_sessions rs
        WHERE rs.id = store_visits.session_id
        AND rs.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.route_sessions rs
        WHERE rs.id = store_visits.session_id
        AND rs.user_id = auth.uid()
    )
);

-- ============================================
-- 8. FUNCTION FOR VISITED STORES COUNT
-- ============================================

CREATE OR REPLACE FUNCTION public.get_visited_store_count(
    p_session_ids UUID[]
)
RETURNS INTEGER
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT store_id) INTO v_count
    FROM public.store_visits
    WHERE session_id = ANY(p_session_ids)
    AND visited_at IS NOT NULL;
    
    RETURN v_count;
END;
$$;

-- ============================================
-- 9. FUNCTION FOR PENDING ORDERS COUNT BY STORE
-- ============================================

CREATE OR REPLACE FUNCTION public.get_pending_order_stores(
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (store_id UUID)
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT o.store_id
    FROM public.orders o
    WHERE o.status = 'pending'
    AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);
END;
$$;

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.stores_for_map TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stores_for_map TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_agent_locations TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visited_store_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_order_stores TO authenticated;
