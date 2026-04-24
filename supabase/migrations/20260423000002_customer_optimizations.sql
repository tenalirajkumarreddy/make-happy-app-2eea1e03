-- Migration: Customer Module Optimizations
-- Created: 2026-04-23
-- Purpose: Performance, security, and data integrity improvements for Customers module

-- ============================================
-- 1. INDEXES FOR CUSTOMER QUERIES
-- ============================================

-- Phone lookup index for duplicate checks
CREATE INDEX IF NOT EXISTS idx_customers_phone 
ON public.customers(phone) 
WHERE phone IS NOT NULL;

-- Composite index for list queries with warehouse filtering
CREATE INDEX IF NOT EXISTS idx_customers_list 
ON public.customers(warehouse_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- KYC status index for filtering
CREATE INDEX IF NOT EXISTS idx_customers_kyc_status 
ON public.customers(kyc_status) 
WHERE deleted_at IS NULL;

-- Active status index
CREATE INDEX IF NOT EXISTS idx_customers_active 
ON public.customers(is_active) 
WHERE deleted_at IS NULL;

-- Customer lookup by ID with store data (for detail page)
CREATE INDEX IF NOT EXISTS idx_stores_customer 
ON public.stores(customer_id, is_active) 
WHERE deleted_at IS NULL;

-- ============================================
-- 2. FUNCTION: CHECK DUPLICATE PHONE
-- ============================================

CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone(
    p_phone TEXT,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    is_active BOOLEAN
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_phone IS NULL OR LENGTH(TRIM(p_phone)) < 6 THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.display_id,
        c.is_active
    FROM public.customers c
    WHERE c.phone = p_phone
    AND c.deleted_at IS NULL
    AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.check_duplicate_customer_phone IS 
'Check if a phone number is already used by another customer. Returns matching customer or empty if not found.';

-- ============================================
-- 3. FUNCTION: GET CUSTOMERS FOR LIST
-- ============================================

CREATE OR REPLACE FUNCTION public.get_customers_for_list(
    p_warehouse_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    is_active BOOLEAN,
    kyc_status TEXT,
    created_at TIMESTAMPTZ,
    store_count BIGINT,
    total_outstanding NUMERIC
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.display_id,
        c.phone,
        c.email,
        c.address,
        c.is_active,
        c.kyc_status,
        c.created_at,
        COUNT(DISTINCT s.id) AS store_count,
        COALESCE(SUM(s.outstanding), 0) AS total_outstanding
    FROM public.customers c
    LEFT JOIN public.stores s ON s.customer_id = c.id AND s.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_customers_for_list IS 
'Optimized function for fetching customer list with aggregated store data. Much faster than client-side joins.';

-- ============================================
-- 4. FUNCTION: GET CUSTOMER DETAIL
-- ============================================

CREATE OR REPLACE FUNCTION public.get_customer_detail(
    p_customer_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gst_number TEXT,
    photo_url TEXT,
    is_active BOOLEAN,
    kyc_status TEXT,
    kyc_selfie_url TEXT,
    kyc_aadhar_front_url TEXT,
    kyc_aadhar_back_url TEXT,
    kyc_rejection_reason TEXT,
    kyc_verified_at TIMESTAMPTZ,
    kyc_verified_by UUID,
    kyc_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    warehouse_id UUID
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.display_id,
        c.phone,
        c.email,
        c.address,
        c.gst_number,
        c.photo_url,
        c.is_active,
        c.kyc_status,
        c.kyc_selfie_url,
        c.kyc_aadhar_front_url,
        c.kyc_aadhar_back_url,
        c.kyc_rejection_reason,
        c.kyc_verified_at,
        c.kyc_verified_by,
        c.kyc_submitted_at,
        c.created_at,
        c.warehouse_id
    FROM public.customers c
    WHERE c.id = p_customer_id
    AND c.deleted_at IS NULL;
END;
$$;

-- ============================================
-- 5. FUNCTION: FILTER CUSTOMERS BY ROUTE ACCESS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_accessible_customers(
    p_user_id UUID,
    p_warehouse_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    display_id TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN,
    kyc_status TEXT,
    created_at TIMESTAMPTZ,
    store_count BIGINT,
    total_outstanding NUMERIC
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_role TEXT;
    v_has_restrictions BOOLEAN;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- Super admin and manager see everything
    IF v_user_role IN ('super_admin', 'manager') THEN
        RETURN QUERY
        SELECT * FROM public.get_customers_for_list(p_warehouse_id, p_limit, p_offset);
        RETURN;
    END IF;
    
    -- Check if user has route/store restrictions
    SELECT EXISTS(
        SELECT 1 FROM public.agent_routes ar WHERE ar.user_id = p_user_id
        UNION
        SELECT 1 FROM public.agent_store_types ast WHERE ast.user_id = p_user_id
    ) INTO v_has_restrictions;
    
    -- If no restrictions, return all customers
    IF NOT v_has_restrictions THEN
        RETURN QUERY
        SELECT * FROM public.get_customers_for_list(p_warehouse_id, p_limit, p_offset);
        RETURN;
    END IF;
    
    -- Otherwise, return only customers with accessible stores
    RETURN QUERY
    SELECT DISTINCT ON (c.id)
        c.id,
        c.name,
        c.display_id,
        c.phone,
        c.email,
        c.is_active,
        c.kyc_status,
        c.created_at,
        COUNT(DISTINCT s.id) AS store_count,
        COALESCE(SUM(s.outstanding), 0) AS total_outstanding
    FROM public.customers c
    INNER JOIN public.stores s ON s.customer_id = c.id
    WHERE c.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
    AND (
        -- Check route access
        EXISTS(
            SELECT 1 FROM public.agent_routes ar 
            WHERE ar.user_id = p_user_id 
            AND ar.route_id = s.route_id
        )
        OR
        -- Check store type access
        EXISTS(
            SELECT 1 FROM public.agent_store_types ast 
            WHERE ast.user_id = p_user_id 
            AND ast.store_type_id = s.store_type_id
        )
    )
    GROUP BY c.id
    ORDER BY c.id, c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_accessible_customers IS 
'Returns customers filtered by user route/store access restrictions. Handles super_admin, manager, agent, and marketer roles.';

-- ============================================
-- 6. FUNCTION: BULK UPDATE CUSTOMERS
-- ============================================

CREATE OR REPLACE FUNCTION public.bulk_update_customers(
    p_updates JSONB
)
RETURNS TABLE (
    customer_id UUID,
    success BOOLEAN,
    error_message TEXT
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_update JSONB;
    v_result RECORD;
BEGIN
    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        customer_id := (v_update->>'id')::UUID;
        BEGIN
            UPDATE public.customers
            SET 
                name = COALESCE(v_update->>'name', name),
                phone = COALESCE(v_update->>'phone', phone),
                email = COALESCE(v_update->>'email', email),
                updated_at = NOW()
            WHERE id = customer_id
            AND deleted_at IS NULL;
            
            IF FOUND THEN
                success := true;
                error_message := NULL;
            ELSE
                success := false;
                error_message := 'Customer not found';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            success := false;
            error_message := SQLERRM;
        END;
        RETURN NEXT;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_customers IS 
'Update multiple customers in a single transaction. Returns status for each update. Partial failures are tracked individually.';

-- ============================================
-- 7. RLS POLICY IMPROVEMENTS
-- ============================================

-- Ensure RLS is enabled on customers table
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated users to view customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated users to create customers" ON public.customers;
DROP POLICY IF EXISTS "Allow super_admin/manager to update/delete customers" ON public.customers;

-- Policy: Allow authenticated users to view customers
CREATE POLICY "Allow authenticated users to view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
    deleted_at IS NULL
);

-- Policy: Allow authenticated users to create customers
CREATE POLICY "Allow authenticated users to create customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow super_admin and manager to update/delete
CREATE POLICY "Allow super_admin/manager to update/delete customers"
ON public.customers
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'manager')
    )
);

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.check_duplicate_customer_phone TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customers_for_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_customers TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_customers TO authenticated;

-- ============================================
-- 9. OPTIMIZE customer_ledger VIEW
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_date 
ON public.customer_ledger(customer_id, transaction_date DESC);

-- ============================================
-- 10. ANALYZE TABLES
-- ============================================

ANALYZE public.customers;
ANALYZE public.stores;
ANALYZE public.customer_ledger;
