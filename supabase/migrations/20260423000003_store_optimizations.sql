-- Migration: Store Module Optimizations
-- Created: 2026-04-23
-- Purpose: Performance, security, and data integrity improvements for Stores module

-- ============================================
-- 1. INDEXES FOR STORE QUERIES
-- ============================================

-- Composite index for list queries
CREATE INDEX IF NOT EXISTS idx_stores_list 
ON public.stores(warehouse_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Route-based filtering index
CREATE INDEX IF NOT EXISTS idx_stores_route 
ON public.stores(route_id, is_active) 
WHERE deleted_at IS NULL;

-- Customer-based index
CREATE INDEX IF NOT EXISTS idx_stores_customer 
ON public.stores(customer_id, is_active) 
WHERE deleted_at IS NULL;

-- Store type index
CREATE INDEX IF NOT EXISTS idx_stores_type 
ON public.stores(store_type_id, is_active) 
WHERE deleted_at IS NULL;

-- Phone lookup index
CREATE INDEX IF NOT EXISTS idx_stores_phone 
ON public.stores(phone) 
WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- Outstanding amount index
CREATE INDEX IF NOT EXISTS idx_stores_outstanding 
ON public.stores(outstanding) 
WHERE outstanding > 0 AND deleted_at IS NULL;

-- Active status index
CREATE INDEX IF NOT EXISTS idx_stores_active 
ON public.stores(is_active) 
WHERE deleted_at IS NULL;

-- ============================================
-- 2. FUNCTION: CREATE STORE WITH AUTO DISPLAY_ID
-- ============================================

CREATE OR REPLACE FUNCTION public.create_store_with_display_id(
    p_name TEXT,
    p_customer_id UUID,
    p_store_type_id UUID,
    p_route_id UUID DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    display_id TEXT,
    name TEXT,
    customer_id UUID,
    store_type_id UUID,
    route_id UUID,
    phone TEXT,
    address TEXT,
    warehouse_id UUID,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID;
    v_display_id TEXT;
    v_count INTEGER;
BEGIN
    -- Generate display_id atomically
    SELECT COUNT(*) + 1 INTO v_count FROM public.stores;
    v_display_id := 'STR-' || LPAD(v_count::TEXT, 6, '0');
    
    -- Insert store
    INSERT INTO public.stores (
        id,
        display_id,
        name,
        customer_id,
        store_type_id,
        route_id,
        phone,
        address,
        warehouse_id,
        lat,
        lng,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_display_id,
        p_name,
        p_customer_id,
        p_store_type_id,
        p_route_id,
        p_phone,
        p_address,
        p_warehouse_id,
        p_lat,
        p_lng,
        NOW(),
        NOW()
    )
    RETURNING stores.id INTO v_id;
    
    -- Return created store
    RETURN QUERY
    SELECT 
        s.id,
        s.display_id,
        s.name,
        s.customer_id,
        s.store_type_id,
        s.route_id,
        s.phone,
        s.address,
        s.warehouse_id,
        s.lat,
        s.lng,
        s.created_at
    FROM public.stores s
    WHERE s.id = v_id;
END;
$$;

COMMENT ON FUNCTION public.create_store_with_display_id IS 
'Create a store with auto-generated display_id. Thread-safe atomic operation.';

-- ============================================
-- 3. FUNCTION: GET STORES FOR LIST
-- ============================================

CREATE OR REPLACE FUNCTION public.get_stores_for_list(
    p_warehouse_id UUID DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_route_id UUID DEFAULT NULL,
    p_store_type_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    phone TEXT,
    address TEXT,
    is_active BOOLEAN,
    outstanding NUMERIC,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    customer_id UUID,
    customer_name TEXT,
    store_type_id UUID,
    store_type_name TEXT,
    route_id UUID,
    route_name TEXT,
    warehouse_id UUID
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
        s.phone,
        s.address,
        s.is_active,
        s.outstanding,
        s.lat,
        s.lng,
        s.created_at,
        s.customer_id,
        c.name AS customer_name,
        s.store_type_id,
        st.name AS store_type_name,
        s.route_id,
        r.name AS route_name,
        s.warehouse_id
    FROM public.stores s
    LEFT JOIN public.customers c ON s.customer_id = c.id
    LEFT JOIN public.store_types st ON s.store_type_id = st.id
    LEFT JOIN public.routes r ON s.route_id = r.id
    WHERE s.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
    AND (p_route_id IS NULL OR s.route_id = p_route_id)
    AND (p_store_type_id IS NULL OR s.store_type_id = p_store_type_id)
    AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
    AND (
        p_status IS NULL OR 
        p_status = 'all' OR
        (p_status = 'active' AND s.is_active = true) OR
        (p_status = 'inactive' AND s.is_active = false) OR
        (p_status = 'with_outstanding' AND s.outstanding > 0)
    )
    AND (
        p_search IS NULL OR 
        p_search = '' OR
        s.name ILIKE '%' || p_search || '%' OR
        s.display_id ILIKE '%' || p_search || '%'
    )
    ORDER BY s.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_stores_for_list IS 
'Optimized function for fetching store list with all necessary joins pre-computed.';

-- ============================================
-- 4. FUNCTION: GET STORE DETAIL
-- ============================================

CREATE OR REPLACE FUNCTION public.get_store_detail(
    p_store_id UUID,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    phone TEXT,
    alternate_phone TEXT,
    address TEXT,
    street TEXT,
    area TEXT,
    city TEXT,
    district TEXT,
    state TEXT,
    pincode TEXT,
    is_active BOOLEAN,
    outstanding NUMERIC,
    opening_balance NUMERIC,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    photo_url TEXT,
    created_at TIMESTAMPTZ,
    customer_id UUID,
    customer JSONB,
    store_type_id UUID,
    store_type JSONB,
    route_id UUID,
    route JSONB,
    warehouse_id UUID,
    recent_sales JSONB,
    recent_transactions JSONB,
    recent_orders JSONB,
    recent_visits JSONB,
    balance_adjustments JSONB,
    qr_codes JSONB
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
        s.phone,
        s.alternate_phone,
        s.address,
        s.street,
        s.area,
        s.city,
        s.district,
        s.state,
        s.pincode,
        s.is_active,
        s.outstanding,
        s.opening_balance,
        s.lat,
        s.lng,
        s.photo_url,
        s.created_at,
        s.customer_id,
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'is_active', c.is_active,
            'kyc_status', c.kyc_status,
            'kyc_selfie_url', c.kyc_selfie_url,
            'kyc_aadhar_front_url', c.kyc_aadhar_front_url,
            'kyc_aadhar_back_url', c.kyc_aadhar_back_url,
            'kyc_rejection_reason', c.kyc_rejection_reason,
            'kyc_submitted_at', c.kyc_submitted_at,
            'kyc_verified_at', c.kyc_verified_at
        ) AS customer,
        s.store_type_id,
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'credit_limit_kyc', st.credit_limit_kyc,
            'credit_limit_no_kyc', st.credit_limit_no_kyc
        ) AS store_type,
        s.route_id,
        jsonb_build_object('id', r.id, 'name', r.name) AS route,
        s.warehouse_id,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', sa.id,
                'display_id', sa.display_id,
                'total_amount', sa.total_amount,
                'outstanding_amount', sa.outstanding_amount,
                'cash_amount', sa.cash_amount,
                'upi_amount', sa.upi_amount,
                'created_at', sa.created_at
            ) ORDER BY sa.created_at DESC LIMIT 10)
            FROM public.sales sa WHERE sa.store_id = s.id
        ) AS recent_sales,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id,
                'display_id', t.display_id,
                'total_amount', t.total_amount,
                'cash_amount', t.cash_amount,
                'upi_amount', t.upi_amount,
                'notes', t.notes,
                'created_at', t.created_at
            ) ORDER BY t.created_at DESC LIMIT 10)
            FROM public.transactions t WHERE t.store_id = s.id
        ) AS recent_transactions,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'display_id', o.display_id,
                'order_type', o.order_type,
                'source', o.source,
                'status', o.status,
                'created_at', o.created_at
            ) ORDER BY o.created_at DESC LIMIT 10)
            FROM public.orders o WHERE o.store_id = s.id
        ) AS recent_orders,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', sv.id,
                'notes', sv.notes,
                'lat', sv.lat,
                'lng', sv.lng,
                'visited_at', sv.visited_at
            ) ORDER BY sv.visited_at DESC LIMIT 10)
            FROM public.store_visits sv WHERE sv.store_id = s.id
        ) AS recent_visits,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', ba.id,
                'old_outstanding', ba.old_outstanding,
                'new_outstanding', ba.new_outstanding,
                'adjustment_amount', ba.adjustment_amount,
                'reason', ba.reason,
                'created_at', ba.created_at
            ) ORDER BY ba.created_at DESC)
            FROM public.balance_adjustments ba WHERE ba.store_id = s.id
        ) AS balance_adjustments,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', sq.id,
                'upi_id', sq.upi_id,
                'payee_name', sq.payee_name,
                'created_at', sq.created_at
            ) ORDER BY sq.created_at DESC)
            FROM public.store_qr_codes sq WHERE sq.store_id = s.id
        ) AS qr_codes
    FROM public.stores s
    LEFT JOIN public.customers c ON s.customer_id = c.id
    LEFT JOIN public.store_types st ON s.store_type_id = st.id
    LEFT JOIN public.routes r ON s.route_id = r.id
    WHERE s.id = p_store_id
    AND s.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id);
END;
$$;

COMMENT ON FUNCTION public.get_store_detail IS 
'Fetch complete store detail with all related data in a single query.';

-- ============================================
-- 5. FUNCTION: BULK UPDATE STORES
-- ============================================

CREATE OR REPLACE FUNCTION public.bulk_update_stores(
    p_updates JSONB
)
RETURNS TABLE (
    store_id UUID,
    success BOOLEAN,
    error_message TEXT
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_update JSONB;
BEGIN
    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        store_id := (v_update->>'id')::UUID;
        BEGIN
            UPDATE public.stores
            SET 
                name = COALESCE(v_update->>'name', name),
                phone = COALESCE(v_update->>'phone', phone),
                updated_at = NOW()
            WHERE id = store_id
            AND deleted_at IS NULL;
            
            IF FOUND THEN
                success := true;
                error_message := NULL;
            ELSE
                success := false;
                error_message := 'Store not found';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            success := false;
            error_message := SQLERRM;
        END;
        RETURN NEXT;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_stores IS 
'Update multiple stores with individual error tracking.';

-- ============================================
-- 6. FUNCTION: CHECK STORE PROXIMITY
-- ============================================

CREATE OR REPLACE FUNCTION public.check_store_proximity(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_m INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    distance_meters DOUBLE PRECISION
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_earth_radius DOUBLE PRECISION := 6371000; -- Earth radius in meters
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.display_id,
        v_earth_radius * acos(
            LEAST(1, GREATEST(-1,
                cos(radians(p_lat)) * cos(radians(s.lat)) *
                cos(radians(s.lng) - radians(p_lng)) +
                sin(radians(p_lat)) * sin(radians(s.lat))
            ))
        ) AS distance_meters
    FROM public.stores s
    WHERE s.deleted_at IS NULL
    AND s.lat IS NOT NULL
    AND s.lng IS NOT NULL
    AND s.is_active = true
    HAVING v_earth_radius * acos(
        LEAST(1, GREATEST(-1,
            cos(radians(p_lat)) * cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(s.lat))
        ))
    ) <= p_radius_m
    ORDER BY distance_meters;
END;
$$;

COMMENT ON FUNCTION public.check_store_proximity IS 
'Find stores within a given radius of a location. Uses haversine formula.';

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.create_store_with_display_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stores_for_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_stores TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_store_proximity TO authenticated;

-- ============================================
-- 8. ANALYZE TABLES
-- ============================================

ANALYZE public.stores;
ANALYZE public.customers;
ANALYZE public.store_types;
ANALYZE public.routes;