-- ============================================================
-- Stock Transfer System Fix Migration
-- Fixes Issues #1-#7 for the NEWZ app
-- ============================================================

-- ============================================================
-- STEP 1: Drop old overloaded functions (Issues #5)
-- ============================================================
DROP FUNCTION IF EXISTS record_stock_transfer(transfer_type, character varying, character varying, character varying, character varying, numeric, text);
DROP FUNCTION IF EXISTS execute_stock_transfer(character varying, character varying, character varying, character varying, character varying, numeric, text);
DROP FUNCTION IF EXISTS process_stock_return(character varying, character varying, numeric);

-- ============================================================
-- STEP 2: Fix Issue #2 - Update unique constraint on staff_stock
-- ============================================================
-- First drop the old unique constraint
ALTER TABLE staff_stock DROP CONSTRAINT IF EXISTS staff_stock_user_id_product_id_key;

-- Add new unique constraint with warehouse_id
ALTER TABLE staff_stock ADD CONSTRAINT staff_stock_user_product_warehouse_key UNIQUE (user_id, product_id, warehouse_id);

-- Create sequence for stock transfers display ID if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS stock_transfers_seq;

-- ============================================================
-- STEP 3: Create new record_stock_transfer function (Issues #1, #3, #4, #6, #7)
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
    v_remaining_qty numeric;
BEGIN
    -- Get caller identity
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller role and warehouse from user_roles
    SELECT ur.role, ur.warehouse_id INTO v_caller_role, v_caller_warehouse_id
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'User has no assigned role';
    END IF;

    -- ============================================================
    -- Issue #3: Role-based permission enforcement
    -- ============================================================
    -- POS can only do warehouse_to_staff and staff_to_staff
    IF v_caller_role = 'pos' THEN
        IF p_transfer_type NOT IN ('warehouse_to_staff', 'staff_to_staff') THEN
            RAISE EXCEPTION 'POS role cannot perform % transfers', p_transfer_type;
        END IF;
    END IF;

    -- AGENT can only do staff_to_warehouse and staff_to_staff
    IF v_caller_role = 'agent' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Agent role cannot perform % transfers', p_transfer_type;
        END IF;
        -- Issue #6: Agent can only return their own stock
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Agents can only return their own stock';
        END IF;
    END IF;

    -- MANAGER and SUPER_ADMIN can do all types (no restriction)

    -- Get product price for amount_value calculation
    SELECT base_price INTO v_product_price FROM products WHERE id = p_product_id;
    IF v_product_price IS NULL THEN
        v_product_price := 0;
    END IF;

    -- Determine status based on transfer type
    IF p_transfer_type = 'staff_to_warehouse' THEN
        v_status := 'pending';
    ELSE
        v_status := 'completed';
    END IF;

    -- Generate display_id using the robust generator (ensure seq exists)
    v_display_id := public.generate_display_id('TRF'::text, 'stock_transfers_seq'::text);

    -- ============================================================
    -- Execute transfer based on type
    -- ============================================================

    -- ============================================================
    -- WAREHOUSE_TO_STAFF: Deduct from warehouse, credit to staff
    -- ============================================================
    IF p_transfer_type = 'warehouse_to_staff' THEN
        -- Issue #1: Get recipient's warehouse_id from user_roles
        SELECT ur.warehouse_id INTO v_dest_warehouse_id
        FROM user_roles ur
        WHERE ur.user_id = p_to_user_id;

        IF v_dest_warehouse_id IS NULL THEN
            RAISE EXCEPTION 'Recipient has no warehouse assignment';
        END IF;

        -- Deduct from warehouse product_stock with row lock
        UPDATE product_stock
        SET quantity = quantity - p_quantity, updated_at = NOW()
        WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN
            RAISE EXCEPTION 'Insufficient stock in warehouse or product not found';
        END IF;

        -- Credit to staff_stock (upsert with new unique constraint)
        INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity, amount_value, transfer_count, last_received_at)
        VALUES (p_to_user_id, v_dest_warehouse_id, p_product_id, p_quantity, p_quantity * v_product_price, 1, NOW())
        ON CONFLICT (user_id, product_id, warehouse_id) DO UPDATE SET
            quantity = staff_stock.quantity + EXCLUDED.quantity,
            amount_value = staff_stock.amount_value + EXCLUDED.amount_value,
            transfer_count = staff_stock.transfer_count + 1,
            last_received_at = NOW();
        END IF;

    -- ============================================================
    -- STAFF_TO_WAREHOUSE: Deduct from staff, credit to warehouse (pending)
    -- ============================================================
    ELSIF p_transfer_type = 'staff_to_warehouse' THEN
        v_source_warehouse_id := p_from_warehouse_id;
        v_dest_warehouse_id := p_to_warehouse_id;

        -- Deduct from staff_stock with row lock
        UPDATE staff_stock
        SET quantity = quantity - p_quantity, transfer_count = transfer_count + 1
        WHERE user_id = p_from_user_id AND product_id = p_product_id AND warehouse_id = p_from_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN
            RAISE EXCEPTION 'Insufficient stock with staff member';
        END IF;
    END IF;

    -- ============================================================
    -- STAFF_TO_STAFF: Deduct from one staff, credit to another
    -- ============================================================
    IF p_transfer_type = 'staff_to_staff' THEN
        -- Get source staff's warehouse
        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock
        WHERE user_id = p_from_user_id AND product_id = p_product_id;

        -- Get recipient's warehouse from user_roles
        SELECT ur.warehouse_id INTO v_dest_warehouse_id
        FROM user_roles ur
        WHERE ur.user_id = p_to_user_id;

        -- Deduct from source staff
        UPDATE staff_stock
        SET quantity = quantity - p_quantity, transfer_count = transfer_count + 1
        WHERE user_id = p_from_user_id AND product_id = p_product_id AND warehouse_id = v_source_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN
            RAISE EXCEPTION 'Insufficient stock with source staff member';
        END IF;

        -- Credit to destination staff
        INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity, amount_value, transfer_count, last_received_at)
        VALUES (p_to_user_id, v_dest_warehouse_id, p_product_id, p_quantity, p_quantity * v_product_price, 1, NOW())
        ON CONFLICT (user_id, product_id, warehouse_id) DO UPDATE SET
            quantity = staff_stock.quantity + EXCLUDED.quantity,
            amount_value = staff_stock.amount_value + EXCLUDED.amount_value,
            transfer_count = staff_stock.transfer_count + 1,
            last_received_at = NOW();
        END IF;
    END IF;

    -- ============================================================
    -- WAREHOUSE_TO_WAREHOUSE: Deduct from source, credit to dest
    -- ============================================================
    IF p_transfer_type = 'warehouse_to_warehouse' THEN
        -- Deduct from source warehouse with row lock
        UPDATE product_stock
        SET quantity = quantity - p_quantity, updated_at = NOW()
        WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN
            RAISE EXCEPTION 'Insufficient stock in source warehouse';
        END IF;

        -- Credit to destination warehouse
        INSERT INTO product_stock (product_id, warehouse_id, quantity)
        VALUES (p_product_id, p_to_warehouse_id, p_quantity)
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            quantity = product_stock.quantity + EXCLUDED.quantity;
    END IF;

    -- ============================================================
    -- Insert stock_transfers audit record
    -- ============================================================
    INSERT INTO stock_transfers (
        display_id, transfer_type,
        from_warehouse_id, from_user_id,
        to_warehouse_id, to_user_id,
        product_id, quantity,
        description, status,
        created_by
    ) VALUES (
        v_display_id, p_transfer_type,
        p_from_warehouse_id, p_from_user_id,
        p_to_warehouse_id, p_to_user_id,
        p_product_id, p_quantity,
        p_description, v_status,
        v_caller_id
    ) RETURNING id INTO v_transfer_id;

    -- ============================================================
    -- Issue #4: Log TWO stock_movements (source out + dest in)
    -- ============================================================
    -- Source movement (negative = out)
    INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, agent_id, created_by)
    VALUES (
        p_product_id,
        CASE WHEN p_transfer_type IN ('warehouse_to_staff', 'warehouse_to_warehouse') THEN p_from_warehouse_id
             WHEN p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN v_source_warehouse_id
             ELSE NULL END,
        -p_quantity,
        'transfer_out',
        p_transfer_type,
        v_transfer_id,
        CASE WHEN p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN p_from_user_id ELSE NULL END,
        v_caller_id
    );

    -- Destination movement (positive = in)
    INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, agent_id, created_by)
    VALUES (
        p_product_id,
        CASE WHEN p_transfer_type IN ('staff_to_warehouse', 'warehouse_to_warehouse') THEN p_to_warehouse_id
             WHEN p_transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN v_dest_warehouse_id
             ELSE NULL END,
        p_quantity,
        'transfer_in',
        p_transfer_type,
        v_transfer_id,
        CASE WHEN p_transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN p_to_user_id ELSE NULL END,
        v_caller_id
    );

    -- Return success
    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'display_id', v_display_id,
        'status', v_status
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================
-- STEP 4: Create approve_stock_return function
-- ============================================================
CREATE OR REPLACE FUNCTION approve_stock_return(
    p_transfer_id uuid,
    p_actual_quantity numeric,
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
    v_difference numeric;
    v_product_price numeric;
BEGIN
    -- Get caller identity
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller role
    SELECT ur.role INTO v_caller_role
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    -- Only manager or super_admin can approve
    IF v_caller_role NOT IN ('manager', 'super_admin') THEN
        RAISE EXCEPTION 'Only managers and super admins can approve returns';
    END IF;

    -- Get transfer record
    SELECT * INTO v_transfer
    FROM stock_transfers
    WHERE id = p_transfer_id AND transfer_type = 'staff_to_warehouse' AND status = 'pending';

    IF v_transfer.id IS NULL THEN
        RAISE EXCEPTION 'Transfer not found or not in pending status';
    END IF;

    -- Get product price
    SELECT base_price INTO v_product_price FROM products WHERE id = v_transfer.product_id;
    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    -- Calculate difference
    v_difference := v_transfer.quantity - p_actual_quantity;

    -- Deduct the FULL requested quantity from staff (staff is accountable for full amount)
    UPDATE staff_stock
    SET quantity = quantity - v_transfer.quantity,
        amount_value = amount_value - (v_transfer.quantity * v_product_price)
    WHERE user_id = v_transfer.from_user_id
      AND product_id = v_transfer.product_id
      AND warehouse_id = v_transfer.from_warehouse_id;

    -- Credit actual_quantity to warehouse product_stock
    INSERT INTO product_stock (product_id, warehouse_id, quantity)
    VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, p_actual_quantity)
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
        quantity = product_stock.quantity + p_actual_quantity;

    -- If difference > 0, flag in staff performance (optional tracking)
    IF v_difference > 0 THEN
        -- Could insert into staff_performance_logs here if that table exists
        RAISE NOTICE 'Shortage of % units flagged', v_difference;
    END IF;

    -- Update transfer status
    UPDATE stock_transfers
    SET status = 'approved',
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        actual_quantity = p_actual_quantity,
        difference = v_difference,
        description = COALESCE(description, '') || ' | Approved: ' || COALESCE(p_notes, '')
    WHERE id = p_transfer_id;

    -- Log stock movements
    -- Staff side: full quantity out
    INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, agent_id, created_by)
    VALUES (
        v_transfer.product_id, v_transfer.from_warehouse_id,
        -v_transfer.quantity, 'transfer_out', 'return_approved',
        p_transfer_id, v_transfer.from_user_id, v_caller_id
    );

    -- Warehouse side: actual quantity in
    INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, agent_id, created_by)
    VALUES (
        v_transfer.product_id, v_transfer.to_warehouse_id,
        p_actual_quantity, 'transfer_in', 'return_approved',
        p_transfer_id, v_transfer.from_user_id, v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'approved_quantity', p_actual_quantity,
        'difference', v_difference
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================
-- STEP 5: Create reject_stock_return function
-- ============================================================
CREATE OR REPLACE FUNCTION reject_stock_return(
    p_transfer_id uuid,
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
    -- Get caller identity
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller role
    SELECT ur.role INTO v_caller_role
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    -- Only manager or super_admin can reject
    IF v_caller_role NOT IN ('manager', 'super_admin') THEN
        RAISE EXCEPTION 'Only managers and super admins can reject returns';
    END IF;

    -- Get transfer record
    SELECT * INTO v_transfer
    FROM stock_transfers
    WHERE id = p_transfer_id AND transfer_type = 'staff_to_warehouse' AND status = 'pending';

    IF v_transfer.id IS NULL THEN
        RAISE EXCEPTION 'Transfer not found or not in pending status';
    END IF;

    -- Update status to rejected (no stock changes)
    UPDATE stock_transfers
    SET status = 'rejected',
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        description = COALESCE(description, '') || ' | Rejected: ' || COALESCE(p_notes, '')
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Stock return rejected'
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================
-- Grant execute permissions to authenticated users
-- ============================================================
GRANT EXECUTE ON FUNCTION record_stock_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_return TO authenticated;
GRANT EXECUTE ON FUNCTION reject_stock_return TO authenticated;