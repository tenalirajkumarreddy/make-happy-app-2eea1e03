-- Migration: Create batch_stock_transfer RPC for atomic multi-product transfers
-- Date: 2026-04-22
-- Description: Process multiple stock transfers in a single atomic transaction

-- ============================================================================
-- FUNCTION: batch_stock_transfer
-- Process multiple stock transfers atomically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.batch_stock_transfer(
    p_transfers JSONB,  -- Array of transfer objects
    p_created_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer RECORD;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_transfer_type TEXT;
    v_from_warehouse_id UUID;
    v_to_warehouse_id UUID;
    v_from_user_id UUID;
    v_to_user_id UUID;
    v_description TEXT;
    v_display_id TEXT;
    v_result RECORD;
    v_success_count INTEGER := 0;
    v_failed_items TEXT[] := '{}';
    v_user_role TEXT;
    v_is_authorized BOOLEAN := false;
BEGIN
    -- ============================================================================
    -- 1. PERMISSION VALIDATION
    -- ============================================================================
    
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = p_created_by
    LIMIT 1;
    
    -- Only super_admin, manager, agent, pos can create transfers
    IF v_user_role IN ('super_admin', 'manager', 'agent', 'pos', 'marketer') THEN
        v_is_authorized := true;
    END IF;
    
    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Only staff members can create transfers'
        );
    END IF;

    -- ============================================================================
    -- 2. VALIDATE INPUT
    -- ============================================================================
    
    IF p_transfers IS NULL OR jsonb_array_length(p_transfers) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No transfers provided'
        );
    END IF;

    -- ============================================================================
    -- 3. PROCESS EACH TRANSFER ATOMICALLY
    -- ============================================================================
    
    FOR v_transfer IN 
        SELECT * FROM jsonb_to_recordset(p_transfers) AS t(
            product_id UUID,
            quantity NUMERIC,
            transfer_type TEXT,
            from_warehouse_id UUID,
            to_warehouse_id UUID,
            from_user_id UUID,
            to_user_id UUID,
            description TEXT
        )
    LOOP
        BEGIN
            -- Generate display ID
            v_display_id := public.generate_display_id('TRF'::text, 'stock_transfers_seq'::text);
            
            -- Create the transfer record
            INSERT INTO public.stock_transfers (
                display_id,
                product_id,
                quantity,
                transfer_type,
                from_warehouse_id,
                to_warehouse_id,
                from_user_id,
                to_user_id,
                description,
                status,
                created_by,
                created_at
            ) VALUES (
                v_display_id,
                v_transfer.product_id,
                v_transfer.quantity,
                v_transfer.transfer_type,
                v_transfer.from_warehouse_id,
                v_transfer.to_warehouse_id,
                v_transfer.from_user_id,
                v_transfer.to_user_id,
                COALESCE(v_transfer.description, 'Batch transfer'),
                CASE 
                    WHEN v_transfer.transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN 'completed'
                    WHEN v_transfer.transfer_type = 'warehouse_to_warehouse' THEN 'completed'
                    ELSE 'pending'
                END,
                p_created_by,
                NOW()
            )
            RETURNING id INTO v_result;
            
            -- Auto-execute for non-return transfers
            IF v_transfer.transfer_type IN ('warehouse_to_staff', 'staff_to_staff', 'warehouse_to_warehouse') THEN
                -- Call execute_stock_transfer for auto-approved transfers
                PERFORM public.execute_stock_transfer(v_result.id);
            END IF;
            
            v_success_count := v_success_count + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Rollback the entire transaction on any error
                RAISE EXCEPTION 'Transfer failed for product %: %', 
                    v_transfer.product_id, SQLERRM;
        END;
    END LOOP;

    -- ============================================================================
    -- 4. RETURN RESULT
    -- ============================================================================
    
    RETURN jsonb_build_object(
        'success', true,
        'processed', v_success_count,
        'total', jsonb_array_length(p_transfers),
        'message', format('%s of %s transfers completed successfully', 
            v_success_count, jsonb_array_length(p_transfers))
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
GRANT EXECUTE ON FUNCTION public.batch_stock_transfer(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_stock_transfer(JSONB, UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.batch_stock_transfer IS 
'Atomically processes multiple stock transfers in a single transaction. 
Either all transfers succeed or all fail (rollback). Auto-executes warehouse_to_staff, 
staff_to_staff, and warehouse_to_warehouse transfers. Returns pending transfers 
(staff_to_warehouse) require manager approval.';

-- ============================================================================
-- Helper function to check if execute_stock_transfer exists
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'execute_stock_transfer' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        -- Create a placeholder that will be replaced by the actual migration
        CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_id UUID)
        RETURNS VOID
        LANGUAGE plpgsql
        AS $$
        BEGIN
            -- Placeholder - actual implementation should be in migration 20260418000006
            RAISE NOTICE 'execute_stock_transfer called with %', p_transfer_id;
        END;
        $$;
    END IF;
END $$;
