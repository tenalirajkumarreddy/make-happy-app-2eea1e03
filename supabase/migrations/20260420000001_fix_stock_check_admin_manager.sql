-- ============================================================================
-- MIGRATION: Fix Stock Check for Admin/Manager Sale Recording
-- ============================================================================
-- PROBLEM:
-- 1. check_stock_availability function doesn't exist or has incorrect logic
-- 2. Admins/Managers get "stock 0" error because it checks staff_stock first
-- 3. When recording on behalf of someone, it doesn't check the right stock
--
-- SOLUTION:
-- 1. Create check_stock_availability function with proper role-based logic
-- 2. Update record_sale to handle admin/manager scenarios correctly
-- ============================================================================

-- ============================================================================
-- FUNCTION: check_stock_availability
-- Check stock based on who is recording and who the sale is for
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_stock_availability(
    p_user_id UUID,
    p_recorded_for UUID, -- NULL if recording for self
    p_items JSONB
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    requested_qty NUMERIC,
    available_qty NUMERIC,
    available BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_target_user_id UUID;
    v_warehouse_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_requested_qty NUMERIC;
    v_product_name TEXT;
    v_warehouse_stock NUMERIC;
    v_staff_stock NUMERIC;
    v_total_available NUMERIC;
BEGIN
    -- Determine who we're checking stock for
    v_target_user_id := COALESCE(p_recorded_for, p_user_id);
    
    -- Get caller's role
    SELECT role INTO v_caller_role
    FROM public.user_roles
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- Get warehouse
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.user_roles
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- Loop through items and check availability
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        -- Get product name
        SELECT name INTO v_product_name
        FROM public.products
        WHERE id = v_product_id;
        
        v_warehouse_stock := 0;
        v_staff_stock := 0;
        
        -- Check warehouse stock (always available for admin/manager)
        SELECT COALESCE(quantity, 0) INTO v_warehouse_stock
        FROM public.product_stock
        WHERE product_id = v_product_id 
        AND warehouse_id = v_warehouse_id;
        
        -- Check staff stock for the target user
        SELECT COALESCE(quantity, 0) INTO v_staff_stock
        FROM public.staff_stock
        WHERE user_id = v_target_user_id 
        AND product_id = v_product_id
        AND warehouse_id = v_warehouse_id;
        
        -- Determine available quantity based on who is recording
        IF v_caller_role IN ('super_admin', 'manager') THEN
            -- Admin/Manager recording:
            -- If recording for self: use warehouse stock
            -- If recording on behalf of staff: use that staff's staff_stock
            IF p_recorded_for IS NULL THEN
                -- Recording for self - use warehouse stock
                v_total_available := COALESCE(v_warehouse_stock, 0);
            ELSE
                -- Recording on behalf of someone - check their staff stock
                v_total_available := COALESCE(v_staff_stock, 0);
            END IF;
        ELSE
            -- Agent/Marketer/POS recording - check their own staff stock first, fallback to warehouse
            v_total_available := COALESCE(v_staff_stock, v_warehouse_stock, 0);
        END IF;
        
        RETURN QUERY SELECT 
            v_product_id,
            COALESCE(v_product_name, 'Unknown'),
            v_requested_qty,
            v_total_available,
            v_total_available >= v_requested_qty;
    END LOOP;
    
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_stock_availability(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.check_stock_availability IS 
'Checks stock availability based on user role and who they are recording for.
- Admin/Manager recording for self: checks warehouse stock
- Admin/Manager recording on behalf: checks target staff stock
- Others: checks their own staff stock with warehouse fallback';


-- ============================================================================
-- FUNCTION: record_sale (UPDATED)
-- Enhanced to handle admin/manager stock deduction correctly
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_sale(
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
RETURNS TABLE(
    sale_id UUID,
    sale_display_id TEXT,
    new_outstanding NUMERIC,
    stock_reserved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_credit_limit NUMERIC := 0;
    v_store_type_id UUID;
    v_store_customer_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_is_manager BOOLEAN;
    v_caller_role TEXT;
    v_warehouse_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_available_stock NUMERIC;
    v_stock_after_sale NUMERIC;
    v_insufficient_stock_products TEXT[] := ARRAY[]::TEXT[];
    v_target_user_id UUID; -- Who to deduct stock from
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get warehouse ID for stock operations
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.user_roles
    WHERE user_id = p_recorded_by
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'User has no warehouse assignment';
    END IF;

    -- Get caller's role
    SELECT role INTO v_caller_role
    FROM public.user_roles
    WHERE user_id = p_recorded_by
    LIMIT 1;
    
    v_caller_is_admin := v_caller_role = 'super_admin';
    v_caller_is_manager := v_caller_role = 'manager';

    -- Determine who to deduct stock from
    -- If logged_by is set, it means admin/manager is recording on behalf of someone
    IF p_logged_by IS NOT NULL THEN
        -- Recording on behalf of p_recorded_by (which is the target staff)
        v_target_user_id := p_recorded_by;
    ELSE
        -- Recording for self
        v_target_user_id := p_recorded_by;
    END IF;

    -- Lock store row for outstanding update
    SELECT s.outstanding, s.store_type_id, s.customer_id
    INTO v_old_outstanding, v_store_type_id, v_store_customer_id
    FROM public.stores s
    WHERE s.id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    -- Compute outstanding delta server-side
    v_computed_outstanding := p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0);
    v_new_outstanding := v_old_outstanding + v_computed_outstanding;

    -- Credit limit check
    SELECT c.kyc_status, c.credit_limit_override
    INTO v_kyc_status, v_credit_limit_override
    FROM public.customers c
    WHERE c.id = v_store_customer_id;

    IF v_credit_limit_override IS NOT NULL THEN
        v_credit_limit := v_credit_limit_override;
    ELSE
        SELECT CASE
            WHEN v_kyc_status IN ('verified', 'approved')
            THEN COALESCE(credit_limit_kyc, 0)
            ELSE COALESCE(credit_limit_no_kyc, 0)
        END
        INTO v_credit_limit
        FROM public.store_types
        WHERE id = v_store_type_id;
    END IF;

    IF v_credit_limit > 0
        AND v_new_outstanding > v_credit_limit
        AND NOT v_caller_is_admin
    THEN
        RAISE EXCEPTION 'credit_limit_exceeded';
    END IF;

    -- ATOMIC STOCK CHECK: Check and reserve stock for each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        -- Determine where to check stock based on role and recording context
        IF (v_caller_is_admin OR v_caller_is_manager) AND p_logged_by IS NULL THEN
            -- Admin/Manager recording for self: check warehouse stock only
            SELECT quantity INTO v_available_stock
            FROM public.product_stock
            WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
            FOR UPDATE;
            
            IF v_available_stock IS NULL OR v_available_stock < v_quantity THEN
                SELECT name INTO v_product_id
                FROM public.products
                WHERE id = (v_item->>'product_id')::UUID;
                
                v_insufficient_stock_products := array_append(
                    v_insufficient_stock_products,
                    COALESCE(v_product_id::TEXT, 'Product ' || (v_item->>'product_id'))
                );
            END IF;
        ELSE
            -- Recording on behalf OR agent/marketer/pos: check staff stock first
            SELECT quantity INTO v_available_stock
            FROM public.staff_stock
            WHERE user_id = v_target_user_id
            AND product_id = v_product_id
            AND warehouse_id = v_warehouse_id
            FOR UPDATE;
            
            -- If no staff stock or insufficient, check warehouse as fallback
            IF v_available_stock IS NULL OR v_available_stock < v_quantity THEN
                SELECT quantity INTO v_available_stock
                FROM public.product_stock
                WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
                FOR UPDATE;
                
                IF v_available_stock IS NULL OR v_available_stock < v_quantity THEN
                    SELECT name INTO v_product_id
                    FROM public.products
                    WHERE id = (v_item->>'product_id')::UUID;
                    
                    v_insufficient_stock_products := array_append(
                        v_insufficient_stock_products,
                        COALESCE(v_product_id::TEXT, 'Product ' || (v_item->>'product_id'))
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- If any products have insufficient stock, raise exception
    IF array_length(v_insufficient_stock_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_stock_products, ', ');
    END IF;

    -- All checks passed - insert the sale
    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding,
        COALESCE(p_created_at, now())
    )
    RETURNING id INTO v_sale_id;

    -- Insert sale items
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
    SELECT
        v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'total_price')::NUMERIC
    FROM jsonb_array_elements(p_sale_items) AS item;

    -- DEDUCT STOCK: Now safely deduct stock (we know it's available)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        -- Determine where to deduct from based on role and context
        IF (v_caller_is_admin OR v_caller_is_manager) AND p_logged_by IS NULL THEN
            -- Admin/Manager recording for self: deduct from warehouse
            UPDATE public.product_stock
            SET current_stock = current_stock - v_quantity,
                updated_at = now()
            WHERE product_id = v_product_id
            AND warehouse_id = v_warehouse_id
            AND current_stock >= v_quantity;
        ELSE
            -- Recording on behalf OR agent/marketer/pos: try staff stock first
            UPDATE public.staff_stock
            SET current_stock = current_stock - v_quantity,
                updated_at = now()
            WHERE user_id = v_target_user_id
            AND product_id = v_product_id
            AND warehouse_id = v_warehouse_id
            AND current_stock >= v_quantity;
            
            -- If no staff stock updated (no rows affected), deduct from warehouse
            IF NOT FOUND THEN
                UPDATE public.product_stock
                SET current_stock = current_stock - v_quantity,
                    updated_at = now()
                WHERE product_id = v_product_id
                AND warehouse_id = v_warehouse_id
                AND current_stock >= v_quantity;
            END IF;
        END IF;

        -- Log the stock movement
        INSERT INTO public.stock_movements (
            product_id,
            warehouse_id,
            user_id,
            quantity,
            type,
            reference_id,
            notes
        ) VALUES (
            v_product_id,
            v_warehouse_id,
            p_recorded_by,
            -v_quantity,
            'sale',
            v_sale_id,
            'Stock deducted for sale ' || p_display_id || 
            CASE WHEN p_logged_by IS NOT NULL THEN ' (recorded by admin/manager)' ELSE '' END
        );
    END LOOP;

    -- Update orders to delivered
    UPDATE public.orders o
    SET status = 'delivered', delivered_at = now()
    WHERE o.store_id = p_store_id
    AND o.status = 'pending'
    AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = o.id
        AND oi.product_id IN (
            SELECT (item->>'product_id')::UUID
            FROM jsonb_array_elements(p_sale_items) AS item
        )
    );

    -- Recalculate if backdated
    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.record_sale IS 
'Records a sale with role-based stock deduction:
- Admin/Manager recording for self: deducts from warehouse
- Admin/Manager recording on behalf: deducts from target staff stock
- Others: deducts from their staff stock (with warehouse fallback)';


-- ============================================================================
-- Also update the Sales page to pass recorded_for parameter
-- Note: Frontend change needed in Sales.tsx to pass p_recorded_for
-- ============================================================================

SELECT 'Migration complete: Stock check fixed for admin/manager sale recording' AS status;
