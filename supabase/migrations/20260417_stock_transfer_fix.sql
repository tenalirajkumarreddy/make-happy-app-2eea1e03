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
ALTER TABLE staff_stock DROP CONSTRAINT IF EXISTS staff_stock_user_product_warehouse_key;
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
    -- Role-based permission enforcement
    -- ============================================================
    -- POS can do: warehouse_to_staff, staff_to_staff (no approval needed)
    IF v_caller_role = 'pos' THEN
        IF p_transfer_type NOT IN ('warehouse_to_staff', 'staff_to_staff') THEN
            RAISE EXCEPTION 'POS role cannot perform % transfers', p_transfer_type;
        END IF;
    END IF;

    -- AGENT can do: staff_to_warehouse (needs approval), staff_to_staff
    IF v_caller_role = 'agent' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Agent role cannot perform % transfers', p_transfer_type;
        END IF;
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Agents can only transfer their own stock to warehouse';
        END IF;
    END IF;

    -- MARKETER can do: staff_to_warehouse (needs approval), staff_to_staff
    IF v_caller_role = 'marketer' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Marketer role cannot perform % transfers', p_transfer_type;
        END IF;
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Marketers can only transfer their own stock to warehouse';
        END IF;
    END IF;

    -- MANAGER can do: warehouse_to_staff, staff_to_warehouse (approve), staff_to_staff
    -- SUPER_ADMIN can do all types (no restriction)

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

    -- ============================================================
    -- STAFF_TO_WAREHOUSE: Deduct from staff, credit to warehouse
    -- For agent/marketer: pending status (needs approval from admin/manager/pos)
    -- For manager/super_admin: direct completion
    -- ============================================================
    ELSIF p_transfer_type = 'staff_to_warehouse' THEN
        v_source_warehouse_id := p_from_warehouse_id;
        v_dest_warehouse_id := p_to_warehouse_id;

        -- Get source staff's warehouse from staff_stock record
        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock
        WHERE user_id = p_from_user_id AND product_id = p_product_id;

        -- Deduct from staff_stock with row lock
        UPDATE staff_stock
        SET quantity = quantity - p_quantity, 
            amount_value = amount_value - (p_quantity * v_product_price),
            transfer_count = transfer_count + 1,
            last_sale_at = NOW()
        WHERE user_id = p_from_user_id AND product_id = p_product_id AND warehouse_id = v_source_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN
            RAISE EXCEPTION 'Insufficient stock with staff member';
        END IF;

        -- Credit to warehouse (only if completing immediately - for manager/super_admin)
        -- For agent/marketer, warehouse credit happens on approval
        IF v_caller_role IN ('manager', 'super_admin') THEN
            INSERT INTO product_stock (product_id, warehouse_id, quantity)
            VALUES (p_product_id, v_dest_warehouse_id, p_quantity)
            ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
                quantity = product_stock.quantity + p_quantity;
            v_status := 'completed';
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
    -- Log stock movements with from -> to details in reason
    -- ============================================================
    DECLARE
        v_reason_text text;
    BEGIN
        -- Build reason with from -> to details
        v_reason_text := p_transfer_type || ' | ';
        
        CASE p_transfer_type
            WHEN 'warehouse_to_staff' THEN
                v_reason_text := v_reason_text || 'Warehouse: ' || COALESCE(p_from_warehouse_id::text, 'N/A') || ' -> Staff: ' || COALESCE(p_to_user_id::text, 'N/A');
            WHEN 'staff_to_warehouse' THEN
                v_reason_text := v_reason_text || 'Staff: ' || COALESCE(p_from_user_id::text, 'N/A') || ' -> Warehouse: ' || COALESCE(p_to_warehouse_id::text, 'N/A');
            WHEN 'staff_to_staff' THEN
                v_reason_text := v_reason_text || 'Staff: ' || COALESCE(p_from_user_id::text, 'N/A') || ' -> Staff: ' || COALESCE(p_to_user_id::text, 'N/A');
            WHEN 'warehouse_to_warehouse' THEN
                v_reason_text := v_reason_text || 'Warehouse: ' || COALESCE(p_from_warehouse_id::text, 'N/A') || ' -> Warehouse: ' || COALESCE(p_to_warehouse_id::text, 'N/A');
            ELSE
                v_reason_text := v_reason_text || p_transfer_type;
        END CASE;

        -- Source movement (negative = out)
        INSERT INTO stock_movements (
            product_id, warehouse_id, quantity, type, reason, 
            from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
            from_location, to_location
        )
        VALUES (
            p_product_id,
            CASE WHEN p_transfer_type IN ('warehouse_to_staff', 'warehouse_to_warehouse') THEN p_from_warehouse_id
                 WHEN p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN v_source_warehouse_id
                 ELSE NULL END,
            -p_quantity,
            'transfer',
            v_reason_text,
            CASE WHEN p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN p_from_user_id ELSE NULL END,
            CASE WHEN p_transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN p_to_user_id ELSE NULL END,
            v_transfer_id,
            v_caller_id,
            v_product_price,
            v_product_price * p_quantity,
            CASE p_transfer_type
                WHEN 'warehouse_to_staff' THEN 'warehouse'
                WHEN 'staff_to_warehouse' THEN 'staff'
                WHEN 'staff_to_staff' THEN 'staff'
                WHEN 'warehouse_to_warehouse' THEN 'warehouse'
                ELSE 'warehouse'
            END,
            CASE p_transfer_type
                WHEN 'warehouse_to_staff' THEN 'staff'
                WHEN 'staff_to_warehouse' THEN 'warehouse'
                WHEN 'staff_to_staff' THEN 'staff'
                WHEN 'warehouse_to_warehouse' THEN 'warehouse'
                ELSE 'warehouse'
            END
        );

        -- Destination movement (positive = in) - only if transfer is completed
        -- For pending staff_to_warehouse, warehouse credit happens on approval
        IF v_status = 'completed' OR p_transfer_type NOT IN ('staff_to_warehouse') THEN
            INSERT INTO stock_movements (
                product_id, warehouse_id, quantity, type, reason,
                from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
                from_location, to_location
            )
            VALUES (
                p_product_id,
                CASE WHEN p_transfer_type IN ('staff_to_warehouse', 'warehouse_to_warehouse') THEN p_to_warehouse_id
                     WHEN p_transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN v_dest_warehouse_id
                     ELSE NULL END,
                p_quantity,
                'transfer',
                v_reason_text,
                CASE WHEN p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN p_from_user_id ELSE NULL END,
                CASE WHEN p_transfer_type IN ('warehouse_to_staff', 'staff_to_staff') THEN p_to_user_id ELSE NULL END,
                v_transfer_id,
                v_caller_id,
                v_product_price,
                v_product_price * p_quantity,
                CASE p_transfer_type
                    WHEN 'warehouse_to_staff' THEN 'warehouse'
                    WHEN 'staff_to_warehouse' THEN 'staff'
                    WHEN 'staff_to_staff' THEN 'staff'
                    WHEN 'warehouse_to_warehouse' THEN 'warehouse'
                    ELSE 'warehouse'
                END,
                CASE p_transfer_type
                    WHEN 'warehouse_to_staff' THEN 'staff'
                    WHEN 'staff_to_warehouse' THEN 'warehouse'
                    WHEN 'staff_to_staff' THEN 'staff'
                    WHEN 'warehouse_to_warehouse' THEN 'warehouse'
                    ELSE 'warehouse'
                END
            );
        END IF;
    END;

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
-- Allows: super_admin, manager, POS to approve agent/marketer stock returns
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
    v_source_warehouse_id uuid;
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

    -- Allow: super_admin, manager, or POS to approve
    IF v_caller_role NOT IN ('super_admin', 'manager', 'pos') THEN
        RAISE EXCEPTION 'Only admins, managers, or POS users can approve stock returns';
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

    -- Get source warehouse from staff_stock (where stock was already deducted)
    SELECT warehouse_id INTO v_source_warehouse_id
    FROM staff_stock
    WHERE user_id = v_transfer.from_user_id AND product_id = v_transfer.product_id;

    -- Stock was already deducted from staff when transfer was created
    -- Now credit actual_quantity to warehouse product_stock
    INSERT INTO product_stock (product_id, warehouse_id, quantity)
    VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, p_actual_quantity)
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
        quantity = product_stock.quantity + p_actual_quantity;

    -- If difference > 0, it means staff returned less than requested (shortage)
    -- The difference was already accounted for in staff_stock deduction at transfer time
    -- We can log this for performance tracking
    IF v_difference > 0 THEN
        RAISE NOTICE 'Shortage of % units - staff accountable for difference', v_difference;
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

    -- Log stock movements for approval
    -- Staff side: full quantity out (staff stock already deducted at transfer time)
    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.from_warehouse_id,
        -v_transfer.quantity, 'transfer', 
        'return_approved | Staff: ' || v_transfer.from_user_id::text || ' -> Warehouse: ' || v_transfer.to_warehouse_id::text,
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * v_transfer.quantity,
        'staff', 'warehouse'
    );

    -- Warehouse side: actual quantity in
    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.to_warehouse_id,
        p_actual_quantity, 'transfer', 
        'return_approved | Staff: ' || v_transfer.from_user_id::text || ' -> Warehouse: ' || v_transfer.to_warehouse_id::text,
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * p_actual_quantity,
        'staff', 'warehouse'
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
-- Allows: super_admin, manager, POS to reject agent/marketer stock returns
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

    -- Allow: super_admin, manager, or POS to reject
    IF v_caller_role NOT IN ('super_admin', 'manager', 'pos') THEN
        RAISE EXCEPTION 'Only admins, managers, or POS users can reject stock returns';
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

    -- On reject: restore staff stock (reverse the deduction)
    UPDATE staff_stock
    SET quantity = quantity + v_transfer.quantity,
        amount_value = amount_value + (v_transfer.quantity * v_product_price),
        transfer_count = transfer_count + 1
    WHERE user_id = v_transfer.from_user_id 
      AND product_id = v_transfer.product_id 
      AND warehouse_id = v_transfer.from_warehouse_id;

    -- Update status to rejected
    UPDATE stock_transfers
    SET status = 'rejected',
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        description = COALESCE(description, '') || ' | Rejected: ' || COALESCE(p_notes, '')
    WHERE id = p_transfer_id;

    -- Log the rejection - staff stock restored
    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.from_warehouse_id,
        v_transfer.quantity, 'transfer', 
        'return_rejected | Staff: ' || v_transfer.from_user_id::text || ' -> Warehouse: ' || v_transfer.to_warehouse_id::text || ' | Stock restored to staff',
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * v_transfer.quantity,
        'warehouse', 'staff'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Stock return rejected, stock restored to staff'
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