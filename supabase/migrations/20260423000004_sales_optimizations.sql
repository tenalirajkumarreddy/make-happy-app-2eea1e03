-- Migration: Sales Module Optimizations
-- Created: 2026-04-23
-- Purpose: Security, data integrity, and performance improvements for Sales module

-- ============================================
-- 1. INDEXES FOR SALES QUERIES
-- ============================================

-- Index for sales by date range (most common filter)
CREATE INDEX IF NOT EXISTS idx_sales_date_range 
ON public.sales(warehouse_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for sales by store
CREATE INDEX IF NOT EXISTS idx_sales_store 
ON public.sales(store_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for sales by recorded_by (for agent filtering)
CREATE INDEX IF NOT EXISTS idx_sales_recorded_by 
ON public.sales(recorded_by, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for outstanding amounts
CREATE INDEX IF NOT EXISTS idx_sales_outstanding 
ON public.sales(outstanding_amount) 
WHERE outstanding_amount > 0 AND deleted_at IS NULL;

-- Index for payment methods
CREATE INDEX IF NOT EXISTS idx_sales_payment 
ON public.sales(cash_amount, upi_amount) 
WHERE deleted_at IS NULL;

-- Index for sale items lookup
CREATE INDEX IF NOT EXISTS idx_sale_items_sale 
ON public.sale_items(sale_id) 
WHERE deleted_at IS NULL;

-- ============================================
-- 2. FUNCTION: ATOMIC SALE RECORDING WITH CREDIT CHECK
-- ============================================

CREATE OR REPLACE FUNCTION public.record_sale_atomic(
    p_display_id TEXT,
    p_store_id UUID,
    p_customer_id UUID,
    p_recorded_by UUID,
    p_logged_by UUID,
    p_total_amount NUMERIC,
    p_cash_amount NUMERIC,
    p_upi_amount NUMERIC,
    p_outstanding_amount NUMERIC,
    p_sale_items JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    sale_id UUID,
    display_id TEXT,
    old_outstanding NUMERIC,
    new_outstanding NUMERIC
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_credit_limit NUMERIC;
    v_credit_limit_no_kyc NUMERIC;
    v_kyc_status TEXT;
    v_customer_id UUID;
    v_store_type_id UUID;
    v_current_outstanding NUMERIC;
    v_item JSONB;
BEGIN
    -- Get store info with lock
    SELECT s.customer_id, s.store_type_id, s.outstanding 
    INTO v_customer_id, v_store_type_id, v_old_outstanding
    FROM public.stores s
    WHERE s.id = p_store_id
    AND s.deleted_at IS NULL
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;
    
    -- Verify customer matches
    IF v_customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Customer mismatch';
    END IF;
    
    -- Get customer KYC status
    SELECT c.kyc_status INTO v_kyc_status
    FROM public.customers c
    WHERE c.id = v_customer_id
    AND c.deleted_at IS NULL;
    
    -- Get credit limits
    SELECT COALESCE(st.credit_limit_kyc, 0), COALESCE(st.credit_limit_no_kyc, 0)
    INTO v_credit_limit, v_credit_limit_no_kyc
    FROM public.store_types st
    WHERE st.id = v_store_type_id;
    
    -- Calculate credit limit based on KYC
    IF v_kyc_status = 'verified' THEN
        v_credit_limit := COALESCE(v_credit_limit, v_credit_limit_no_kyc, 0);
    ELSE
        v_credit_limit := COALESCE(v_credit_limit_no_kyc, 0);
    END IF;
    
    -- Calculate new outstanding
    v_current_outstanding := COALESCE(v_old_outstanding, 0);
    v_new_outstanding := v_current_outstanding + p_outstanding_amount;
    
    -- Credit limit check (only if there's an outstanding amount)
    IF p_outstanding_amount > 0 AND v_credit_limit > 0 THEN
        IF v_new_outstanding > v_credit_limit THEN
            RAISE EXCEPTION 'credit_limit_exceeded: Outstanding would exceed credit limit of ₹%', v_credit_limit;
        END IF;
    END IF;
    
    -- Stock availability check
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        DECLARE
            v_available NUMERIC;
            v_product_name TEXT;
        BEGIN
            SELECT p.name INTO v_product_name
            FROM public.products p
            WHERE p.id = (v_item->>'product_id')::UUID;
            
            -- Check available stock
            SELECT COALESCE(ps.available_qty, 0) INTO v_available
            FROM public.product_stock ps
            WHERE ps.product_id = (v_item->>'product_id')::UUID
            AND ps.warehouse_id = (SELECT warehouse_id FROM public.stores WHERE id = p_store_id);
            
            IF v_available < COALESCE((v_item->>'quantity')::NUMERIC, 0) THEN
                RAISE EXCEPTION 'insufficient_stock: Only % units available for %', v_available, v_product_name;
            END IF;
        END;
    END LOOP;
    
    -- Insert sale
    INSERT INTO public.sales (
        display_id,
        store_id,
        customer_id,
        recorded_by,
        logged_by,
        total_amount,
        cash_amount,
        upi_amount,
        outstanding_amount,
        created_at,
        updated_at
    ) VALUES (
        p_display_id,
        p_store_id,
        p_customer_id,
        p_recorded_by,
        p_logged_by,
        p_total_amount,
        p_cash_amount,
        p_upi_amount,
        p_outstanding_amount,
        COALESCE(p_created_at, NOW()),
        NOW()
    )
    RETURNING id INTO v_sale_id;
    
    -- Insert sale items
    INSERT INTO public.sale_items (
        sale_id,
        product_id,
        quantity,
        unit_price,
        total_price,
        created_at
    )
    SELECT 
        v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'total_price')::NUMERIC,
        NOW()
    FROM jsonb_array_elements(p_sale_items) AS item;
    
    -- Update store outstanding
    UPDATE public.stores
    SET outstanding = v_new_outstanding,
        updated_at = NOW()
    WHERE id = p_store_id;
    
    -- Auto-deliver pending orders
    UPDATE public.orders
    SET status = 'delivered',
        delivered_at = NOW(),
        updated_at = NOW()
    WHERE store_id = p_store_id
    AND status = 'pending';
    
    -- Decrement stock
    UPDATE public.product_stock ps
    SET 
        quantity = ps.quantity - (item->>'quantity')::NUMERIC,
        updated_at = NOW()
    FROM jsonb_array_elements(p_sale_items) AS item
    WHERE ps.product_id = (item->>'product_id')::UUID
    AND ps.warehouse_id = (SELECT warehouse_id FROM public.stores WHERE id = p_store_id);
    
    -- Return result
    RETURN QUERY
    SELECT v_sale_id, p_display_id, v_old_outstanding, v_new_outstanding;
END;
$$;

COMMENT ON FUNCTION public.record_sale_atomic IS 
'Atomically records a sale with credit limit validation, stock checks, and order fulfillment. All operations are wrapped in a single transaction.';

-- ============================================
-- 3. FUNCTION: GET SALES FOR LIST
-- ============================================

CREATE OR REPLACE FUNCTION public.get_sales_for_list(
    p_warehouse_id UUID DEFAULT NULL,
    p_recorded_by UUID DEFAULT NULL,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_store_id UUID DEFAULT NULL,
    p_store_type_id UUID DEFAULT NULL,
    p_route_id UUID DEFAULT NULL,
    p_payment_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    display_id TEXT,
    store_id UUID,
    store_name TEXT,
    store_display_id TEXT,
    store_type_id UUID,
    store_route_id UUID,
    customer_id UUID,
    customer_name TEXT,
    recorded_by UUID,
    total_amount NUMERIC,
    cash_amount NUMERIC,
    upi_amount NUMERIC,
    outstanding_amount NUMERIC,
    created_at TIMESTAMPTZ,
    fulfilled_order_id UUID
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.display_id,
        s.store_id,
        st.name AS store_name,
        st.display_id AS store_display_id,
        st.store_type_id,
        st.route_id AS store_route_id,
        s.customer_id,
        c.name AS customer_name,
        s.recorded_by,
        s.total_amount,
        s.cash_amount,
        s.upi_amount,
        s.outstanding_amount,
        s.created_at,
        s.fulfilled_order_id
    FROM public.sales s
    LEFT JOIN public.stores st ON s.store_id = st.id
    LEFT JOIN public.customers c ON s.customer_id = c.id
    WHERE s.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
    AND (p_recorded_by IS NULL OR s.recorded_by = p_recorded_by)
    AND (p_from_date IS NULL OR s.created_at >= p_from_date::TIMESTAMPTZ)
    AND (p_to_date IS NULL OR s.created_at < (p_to_date + INTERVAL '1 day')::TIMESTAMPTZ)
    AND (p_store_id IS NULL OR s.store_id = p_store_id)
    AND (p_store_type_id IS NULL OR st.store_type_id = p_store_type_id)
    AND (p_route_id IS NULL OR st.route_id = p_route_id)
    AND (
        p_payment_type IS NULL OR 
        p_payment_type = 'all' OR
        (p_payment_type = 'cash' AND s.cash_amount > 0) OR
        (p_payment_type = 'upi' AND s.upi_amount > 0) OR
        (p_payment_type = 'outstanding' AND s.outstanding_amount > 0)
    )
    ORDER BY s.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_sales_for_list IS 
'Optimized function for fetching sales list with all filters applied server-side.';

-- ============================================
-- 4. FUNCTION: GET SALE DETAIL
-- ============================================

CREATE OR REPLACE FUNCTION public.get_sale_detail(
    p_sale_id UUID
)
RETURNS TABLE (
    id UUID,
    display_id TEXT,
    store_id UUID,
    store JSONB,
    customer_id UUID,
    customer JSONB,
    recorded_by UUID,
    recorded_by_name TEXT,
    total_amount NUMERIC,
    cash_amount NUMERIC,
    upi_amount NUMERIC,
    outstanding_amount NUMERIC,
    created_at TIMESTAMPTZ,
    items JSONB,
    fulfilled_order_id UUID
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.display_id,
        s.store_id,
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'display_id', st.display_id,
            'address', st.address,
            'outstanding', st.outstanding
        ) AS store,
        s.customer_id,
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'phone', c.phone
        ) AS customer,
        s.recorded_by,
        p.full_name AS recorded_by_name,
        s.total_amount,
        s.cash_amount,
        s.upi_amount,
        s.outstanding_amount,
        s.created_at,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', si.id,
                'product_id', si.product_id,
                'quantity', si.quantity,
                'unit_price', si.unit_price,
                'total_price', si.total_price,
                'product_name', pr.name,
                'product_sku', pr.sku
            ))
            FROM public.sale_items si
            LEFT JOIN public.products pr ON si.product_id = pr.id
            WHERE si.sale_id = s.id
        ) AS items,
        s.fulfilled_order_id
    FROM public.sales s
    LEFT JOIN public.stores st ON s.store_id = st.id
    LEFT JOIN public.customers c ON s.customer_id = c.id
    LEFT JOIN public.profiles p ON s.recorded_by = p.user_id
    WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL;
END;
$$;

-- ============================================
-- 5. FUNCTION: PROCESS SALE RETURN
-- ============================================

CREATE OR REPLACE FUNCTION public.process_sale_return(
    p_sale_id UUID,
    p_return_items JSONB, -- [{sale_item_id, quantity, unit_price}]
    p_reason TEXT,
    p_cash_refund NUMERIC DEFAULT 0,
    p_upi_refund NUMERIC DEFAULT 0
)
RETURNS TABLE (
    return_id UUID,
    display_id TEXT,
    total_refund NUMERIC,
    new_outstanding NUMERIC
) SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_return_id UUID;
    v_display_id TEXT;
    v_store_id UUID;
    v_customer_id UUID;
    v_total_refund NUMERIC := 0;
    v_current_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_item JSONB;
    v_sale_item RECORD;
BEGIN
    -- Get sale info
    SELECT s.store_id, s.customer_id, s.outstanding_amount
    INTO v_store_id, v_customer_id, v_current_outstanding
    FROM public.sales s
    WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;
    
    -- Generate return ID
    SELECT 'RET-' || LPAD((COUNT(*) + 1)::TEXT, 6, '0') INTO v_display_id
    FROM public.sale_returns;
    
    -- Calculate total refund
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
    LOOP
        v_total_refund := v_total_refund + (
            COALESCE((v_item->>'quantity')::NUMERIC, 0) * 
            COALESCE((v_item->>'unit_price')::NUMERIC, 0)
        );
    END LOOP;
    
    -- Insert return record
    INSERT INTO public.sale_returns (
        display_id,
        sale_id,
        store_id,
        customer_id,
        total_refund,
        cash_refund,
        upi_refund,
        reason,
        status,
        created_at
    ) VALUES (
        v_display_id,
        p_sale_id,
        v_store_id,
        v_customer_id,
        v_total_refund,
        p_cash_refund,
        p_upi_refund,
        p_reason,
        'completed',
        NOW()
    )
    RETURNING id INTO v_return_id;
    
    -- Insert return items
    INSERT INTO public.sale_return_items (
        return_id,
        sale_item_id,
        quantity,
        unit_price,
        total_price,
        created_at
    )
    SELECT 
        v_return_id,
        (item->>'sale_item_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC,
        NOW()
    FROM jsonb_array_elements(p_return_items) AS item;
    
    -- Update store outstanding
    v_new_outstanding := v_current_outstanding - v_total_refund;
    IF v_new_outstanding < 0 THEN
        v_new_outstanding := 0;
    END IF;
    
    UPDATE public.stores
    SET outstanding = v_new_outstanding,
        updated_at = NOW()
    WHERE id = v_store_id;
    
    -- Restore stock
    UPDATE public.product_stock ps
    SET 
        quantity = ps.quantity + (item->>'quantity')::NUMERIC,
        updated_at = NOW()
    FROM jsonb_array_elements(p_return_items) AS item
    JOIN public.sale_items si ON si.id = (item->>'sale_item_id')::UUID
    WHERE ps.product_id = si.product_id
    AND ps.warehouse_id = (SELECT warehouse_id FROM public.stores WHERE id = v_store_id);
    
    -- Return result
    RETURN QUERY
    SELECT v_return_id, v_display_id, v_total_refund, v_new_outstanding;
END;
$$;

COMMENT ON FUNCTION public.process_sale_return IS 
'Process a sale return with stock restoration and outstanding adjustment.';

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.record_sale_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_for_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_return TO authenticated;

-- ============================================
-- 7. ANALYZE TABLES
-- ============================================

ANALYZE public.sales;
ANALYZE public.sale_items;
ANALYZE public.sale_returns;
ANALYZE public.stores;
ANALYZE public.product_stock;