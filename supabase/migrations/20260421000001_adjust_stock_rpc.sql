-- Migration: Create atomic adjust_stock RPC function
-- Date: 2026-04-21
-- Description: Replace direct table updates with atomic RPC to prevent race conditions

-- ============================================================================
-- FUNCTION: adjust_stock
-- Atomic stock adjustment with validation and movement logging
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id UUID,
    p_warehouse_id UUID,
    p_quantity_change NUMERIC,  -- positive for add, negative for remove
    p_adjustment_type TEXT,     -- 'purchase', 'sale', 'correction', 'return', 'damaged_lost', 'transfer_in', 'transfer_out', 'adjustment'
    p_reason TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_quantity NUMERIC := 0;
    v_new_quantity NUMERIC;
    v_stock_id UUID;
    v_company_setting TEXT;
    v_allow_negative BOOLEAN := false;
    v_user_role TEXT;
    v_user_warehouse_id UUID;
BEGIN
    -- ============================================================================
    -- 1. PERMISSION VALIDATION
    -- ============================================================================
    
    -- Get user's role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = p_created_by
    LIMIT 1;
    
    -- Super admins can adjust any warehouse
    -- Managers can adjust their assigned warehouse
    -- Others cannot adjust stock
    IF v_user_role = 'super_admin' THEN
        -- Allow any warehouse
        NULL;
    ELSIF v_user_role = 'manager' THEN
        -- Check if manager is assigned to this warehouse
        SELECT warehouse_id INTO v_user_warehouse_id
        FROM public.user_roles
        WHERE user_id = p_created_by AND role = 'manager'
        LIMIT 1;
        
        IF v_user_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Manager can only adjust stock for their assigned warehouse'
            );
        END IF;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only super_admin or manager can adjust stock'
        );
    END IF;

    -- ============================================================================
    -- 2. VALIDATE INPUTS
    -- ============================================================================
    
    IF p_quantity_change = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity change cannot be zero');
    END IF;
    
    IF p_adjustment_type IS NULL OR p_adjustment_type = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Adjustment type is required');
    END IF;

    -- ============================================================================
    -- 3. LOCK AND GET CURRENT STOCK (prevents race conditions)
    -- ============================================================================
    
    -- Lock the stock row for this product/warehouse combination
    SELECT id, quantity INTO v_stock_id, v_current_quantity
    FROM public.product_stock
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id
    FOR UPDATE;  -- This locks the row until transaction completes
    
    -- If no stock record exists and we're adding stock, we'll create one
    IF v_stock_id IS NULL AND p_quantity_change > 0 THEN
        v_current_quantity := 0;
    ELSIF v_stock_id IS NULL AND p_quantity_change < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No stock record exists for this product in the warehouse'
        );
    END IF;

    -- ============================================================================
    -- 4. CHECK NEGATIVE STOCK POLICY
    -- ============================================================================
    
    -- Get company setting for negative stock
    SELECT value INTO v_company_setting
    FROM public.company_settings
    WHERE key = 'allow_negative_stock'
    LIMIT 1;
    
    v_allow_negative := (v_company_setting = 'true');
    
    -- Calculate new quantity
    v_new_quantity := v_current_quantity + p_quantity_change;
    
    -- Check if this would result in negative stock
    IF v_new_quantity < 0 AND NOT v_allow_negative THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Insufficient stock. Current: %s, Requested change: %s, Would result in: %s', 
                v_current_quantity, 
                CASE WHEN p_quantity_change < 0 THEN p_quantity_change ELSE '+' || p_quantity_change END,
                v_new_quantity
            ),
            'current_quantity', v_current_quantity,
            'requested_change', p_quantity_change,
            'projected_quantity', v_new_quantity
        );
    END IF;

    -- ============================================================================
    -- 5. PERFORM ATOMIC UPDATE
    -- ============================================================================
    
    IF v_stock_id IS NOT NULL THEN
        -- Update existing stock
        UPDATE public.product_stock
        SET 
            quantity = v_new_quantity,
            updated_at = NOW()
        WHERE id = v_stock_id;
    ELSE
        -- Create new stock record
        INSERT INTO public.product_stock (product_id, warehouse_id, quantity)
        VALUES (p_product_id, p_warehouse_id, p_quantity_change)
        RETURNING id INTO v_stock_id;
    END IF;

    -- ============================================================================
    -- 6. LOG MOVEMENT
    -- ============================================================================
    
    INSERT INTO public.stock_movements (
        product_id,
        warehouse_id,
        quantity,
        type,
        reason,
        created_by,
        created_at
    ) VALUES (
        p_product_id,
        p_warehouse_id,
        p_quantity_change,
        p_adjustment_type,
        COALESCE(p_reason, p_adjustment_type),
        p_created_by,
        NOW()
    );

    -- ============================================================================
    -- 7. RETURN SUCCESS
    -- ============================================================================
    
    RETURN jsonb_build_object(
        'success', true,
        'stock_id', v_stock_id,
        'previous_quantity', v_current_quantity,
        'quantity_change', p_quantity_change,
        'new_quantity', v_new_quantity,
        'product_id', p_product_id,
        'warehouse_id', p_warehouse_id,
        'adjustment_type', p_adjustment_type
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.adjust_stock IS 
'Atomically adjusts stock quantity for a product in a warehouse. Validates permissions, 
checks negative stock policy, locks row to prevent race conditions, updates stock, 
and logs movement - all in a single transaction.';

-- ============================================================================
-- Add migration metadata
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260421000001', 'adjust_stock_rpc', NOW())
ON CONFLICT (version) DO NOTHING;
