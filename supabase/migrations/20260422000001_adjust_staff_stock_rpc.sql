-- Migration: Create atomic adjust_staff_stock RPC function
-- Date: 2026-04-22
-- Description: Replace direct table updates with atomic RPC for staff stock adjustments

-- ============================================================================
-- FUNCTION: adjust_staff_stock
-- Atomic staff stock adjustment with validation and movement logging
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adjust_staff_stock(
    p_staff_stock_id UUID,
    p_quantity NUMERIC,
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
    v_current_record RECORD;
    v_user_role TEXT;
    v_is_authorized BOOLEAN := false;
BEGIN
    -- ============================================================================
    -- 1. PERMISSION VALIDATION
    -- ============================================================================
    
    -- Get user's role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = p_created_by
    LIMIT 1;
    
    -- Super admins and managers can adjust any staff stock
    -- Staff can only adjust their own stock
    IF v_user_role IN ('super_admin', 'manager') THEN
        v_is_authorized := true;
    ELSE
        -- Check if the staff_stock belongs to the current user
        SELECT user_id INTO v_current_record
        FROM public.staff_stock
        WHERE id = p_staff_stock_id;
        
        IF v_current_record.user_id = p_created_by THEN
            v_is_authorized := true;
        END IF;
    END IF;
    
    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Only super_admin, manager, or the stock owner can adjust staff stock'
        );
    END IF;

    -- ============================================================================
    -- 2. VALIDATE INPUTS
    -- ============================================================================
    
    IF p_staff_stock_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff stock ID is required');
    END IF;

    -- ============================================================================
    -- 3. LOCK AND GET CURRENT RECORD
    -- ============================================================================
    
    SELECT id, user_id, warehouse_id, product_id, quantity
    INTO v_current_record
    FROM public.staff_stock
    WHERE id = p_staff_stock_id
    FOR UPDATE;
    
    IF v_current_record.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Staff stock record not found'
        );
    END IF;
    
    v_current_quantity := v_current_record.quantity;

    -- ============================================================================
    -- 4. PERFORM ATOMIC UPDATE
    -- ============================================================================
    
    UPDATE public.staff_stock
    SET 
        quantity = p_quantity,
        is_negative = p_quantity < 0,
        updated_at = NOW()
    WHERE id = p_staff_stock_id;

    -- ============================================================================
    -- 5. LOG MOVEMENT
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
        v_current_record.product_id,
        v_current_record.warehouse_id,
        p_quantity - v_current_quantity,  -- Delta
        'adjustment',
        COALESCE(p_reason, 'Staff stock adjustment'),
        p_created_by,
        NOW()
    );

    -- ============================================================================
    -- 6. RETURN SUCCESS
    -- ============================================================================
    
    RETURN jsonb_build_object(
        'success', true,
        'staff_stock_id', p_staff_stock_id,
        'previous_quantity', v_current_quantity,
        'new_quantity', p_quantity,
        'product_id', v_current_record.product_id,
        'warehouse_id', v_current_record.warehouse_id,
        'user_id', v_current_record.user_id
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
GRANT EXECUTE ON FUNCTION public.adjust_staff_stock(UUID, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_staff_stock(UUID, NUMERIC, TEXT, UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.adjust_staff_stock IS 
'Atomically adjusts staff stock quantity. Validates permissions (Super Admin/Manager or owner),
locks row to prevent race conditions, updates stock, and logs movement - all in a single transaction.';
