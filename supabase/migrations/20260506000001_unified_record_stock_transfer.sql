-- Migration: Unified record_stock_transfer function
-- Date: 2026-05-06
-- Purpose: Single entry point for all stock transfers with role-based permissions

-- ============================================================
-- STEP 1: Drop ALL existing record_stock_transfer functions
-- ============================================================
DROP FUNCTION IF EXISTS record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS record_stock_transfer(text, text, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS record_stock_transfer(text, varchar, varchar, varchar, varchar, numeric, text);
DROP FUNCTION IF EXISTS record_stock_transfer(text, uuid, uuid, uuid, uuid, numeric, text);

-- ============================================================
-- STEP 2: Create unified record_stock_transfer function
-- ============================================================
CREATE OR REPLACE FUNCTION record_stock_transfer(
    p_transfer_type text,
    p_from_warehouse_id uuid,
    p_from_user_id uuid,
    p_to_warehouse_id uuid,
    p_to_user_id uuid,
    p_product_id uuid,
    p_quantity numeric,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_caller_warehouse_id uuid;
    v_transfer_id uuid;
    v_display_id text;
    v_status text;
    v_source_warehouse_id uuid;
    v_dest_warehouse_id uuid;
    v_product_price numeric;
BEGIN
    -- Get authenticated user
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller's role and warehouse
    SELECT ur.role, ur.warehouse_id INTO v_caller_role, v_caller_warehouse_id
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'User has no assigned role';
    END IF;

    -- Role-based permissions
    IF v_caller_role = 'pos' THEN
        IF p_transfer_type NOT IN ('warehouse_to_staff', 'staff_to_staff') THEN
            RAISE EXCEPTION 'POS role cannot perform % transfers', p_transfer_type;
        END IF;
    END IF;

    IF v_caller_role = 'agent' OR v_caller_role = 'marketer' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Agent/Marketer role cannot perform % transfers', p_transfer_type;
        END IF;
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Agents can only return their own stock';
        END IF;
    END IF;

    -- Get product price
    SELECT base_price INTO v_product_price FROM products WHERE id = p_product_id;
    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    -- Determine source and destination warehouses
    IF p_transfer_type = 'staff_to_warehouse' OR p_transfer_type = 'staff_to_staff' THEN
        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock
        WHERE user_id = p_from_user_id AND product_id = p_product_id
        LIMIT 1;
        
        IF v_source_warehouse_id IS NULL AND p_transfer_type = 'staff_to_warehouse' THEN
            v_source_warehouse_id := p_from_warehouse_id;
        END IF;
    ELSE
        v_source_warehouse_id := p_from_warehouse_id;
    END IF;

    v_dest_warehouse_id := COALESCE(p_to_warehouse_id, 
        (SELECT warehouse_id FROM staff_stock WHERE user_id = p_to_user_id AND product_id = p_product_id LIMIT 1),
        v_caller_warehouse_id
    );

    -- Determine initial status based on transfer type and role
    IF p_transfer_type = 'warehouse_to_warehouse' THEN
        v_status := 'approved';
    ELSIF p_transfer_type = 'warehouse_to_staff' THEN
        IF v_caller_role IN ('super_admin', 'manager') THEN
            v_status := 'approved';
        ELSE
            v_status := 'pending';
        END IF;
    ELSIF p_transfer_type = 'staff_to_warehouse' THEN
        v_status := 'pending';
    ELSE
        v_status := 'pending';
    END IF;

    -- Generate display ID
    SELECT COALESCE(MAX(display_id), 'TRF-0000') INTO v_display_id
    FROM stock_transfers
    WHERE created_at > NOW() - INTERVAL '1 day';
    
    IF v_display_id IS NULL THEN
        v_display_id := 'TRF-' || TO_CHAR(NOW(), 'YYMMDD') || '-0001';
    ELSE
        v_display_id := 'TRF-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((RIGHT(v_display_id, 4)::int + 1)::text, 4, '0');
    END IF;

    -- Insert transfer record
    INSERT INTO stock_transfers (
        display_id,
        transfer_type,
        from_warehouse_id,
        from_user_id,
        to_warehouse_id,
        to_user_id,
        product_id,
        quantity,
        description,
        status,
        created_by,
        requested_by
    ) VALUES (
        v_display_id,
        p_transfer_type,
        v_source_warehouse_id,
        p_from_user_id,
        v_dest_warehouse_id,
        p_to_user_id,
        p_product_id,
        p_quantity,
        p_description,
        v_status,
        v_caller_id,
        v_caller_id
    )
    RETURNING id INTO v_transfer_id;

    -- If auto-approved, execute immediately
    IF v_status = 'approved' THEN
        PERFORM execute_stock_transfer(v_transfer_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'display_id', v_display_id,
        'status', v_status
    );
END;
$$;

-- ============================================================
-- STEP 3: Create approve_stock_transfer function (for managers)
-- ============================================================
CREATE OR REPLACE FUNCTION approve_stock_transfer(
    p_transfer_id uuid,
    p_approve boolean DEFAULT true,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_transfer RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT ur.role INTO v_caller_role
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    IF v_caller_role NOT IN ('manager', 'super_admin', 'operator') THEN
        RAISE EXCEPTION 'Only managers, super admins, and operators can approve transfers';
    END IF;

    SELECT * INTO v_transfer
    FROM stock_transfers
    WHERE id = p_transfer_id;

    IF v_transfer.id IS NULL THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    IF v_transfer.status != 'pending' AND v_transfer.status != 'awaiting_acceptance' THEN
        RAISE EXCEPTION 'Transfer is not in pending status';
    END IF;

    IF p_approve THEN
        UPDATE stock_transfers
        SET status = 'approved',
            is_approved = true,
            approved_by = v_caller_id,
            approved_at = NOW(),
            notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, '')
        WHERE id = p_transfer_id;

        PERFORM execute_stock_transfer(p_transfer_id);
    ELSE
        UPDATE stock_transfers
        SET status = 'rejected',
            notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, 'Rejected without notes')
        WHERE id = p_transfer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', p_transfer_id,
        'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
    );
END;
$$;

-- ============================================================
-- STEP 4: Ensure stock_transfers has requested_by column
-- ============================================================
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);