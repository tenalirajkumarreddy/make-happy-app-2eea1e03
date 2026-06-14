-- Migration: Fix get_accessible_customers Role Handling
-- Date: 2026-06-15
-- Priority: P2 - MEDIUM (Access Control)
--
-- Issue: get_accessible_customers includes 'operator' role which doesn't exist in the app
-- (roles are: super_admin, manager, agent, marketer, pos, customer)
-- Fix: Remove 'operator' from the role check, add 'pos' if needed, and ensure agent/marketer logic is correct.

DROP FUNCTION IF EXISTS public.get_accessible_customers(UUID, UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_accessible_customers(
    p_user_id UUID,
    p_warehouse_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    display_id TEXT,
    name TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN,
    kyc_status TEXT,
    created_at TIMESTAMPTZ,
    store_count BIGINT,
    total_outstanding NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id LIMIT 1;

    -- Super admin and manager: all customers in warehouse
    IF v_role IN ('super_admin', 'manager') THEN
        RETURN QUERY
        SELECT
            c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
            COUNT(s.id)::BIGINT AS store_count,
            COALESCE(SUM(s.outstanding), 0) AS total_outstanding
        FROM public.customers c
        LEFT JOIN public.stores s ON s.customer_id = c.id AND s.is_active = true
        WHERE (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT p_limit
        OFFSET p_offset;

    -- Agent / marketer / pos: customers with stores on their assigned routes
    ELSIF v_role IN ('agent', 'marketer', 'pos') THEN
        RETURN QUERY
        SELECT
            c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
            COUNT(DISTINCT s.id)::BIGINT AS store_count,
            COALESCE(SUM(s.outstanding) FILTER (WHERE s.is_active = true), 0) AS total_outstanding
        FROM public.customers c
        LEFT JOIN public.stores s ON s.customer_id = c.id
        LEFT JOIN public.route_sessions rs ON rs.user_id = p_user_id AND rs.status = 'active'
        LEFT JOIN public.route_visits rv ON rv.session_id = rs.id AND rv.store_id = s.id
        WHERE (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
          AND (
            -- Staff can see customers with stores even without active session
            EXISTS (SELECT 1 FROM public.stores s2 WHERE s2.customer_id = c.id)
          )
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT p_limit
        OFFSET p_offset;

    -- Customer role: only themselves
    ELSE
        RETURN QUERY
        SELECT
            c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
            COUNT(s.id)::BIGINT AS store_count,
            COALESCE(SUM(s.outstanding), 0) AS total_outstanding
        FROM public.customers c
        LEFT JOIN public.stores s ON s.customer_id = c.id AND s.is_active = true
        WHERE c.user_id = p_user_id
          AND (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT p_limit
        OFFSET p_offset;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_customers(UUID, UUID, INTEGER, INTEGER) TO authenticated;