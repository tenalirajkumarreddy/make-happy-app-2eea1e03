-- ============================================================
-- Migration: Update Stock Movement Reasons with Names instead of UUIDs
-- ============================================================

-- Function to safely get profile name
CREATE OR REPLACE FUNCTION get_profile_name_safe(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_name text;
BEGIN
    IF p_user_id IS NULL THEN RETURN 'N/A'; END IF;
    SELECT full_name INTO v_name FROM profiles WHERE user_id = p_user_id;
    RETURN COALESCE(v_name, 'Unknown Staff');
END;
$$;

-- Function to safely get warehouse name
CREATE OR REPLACE FUNCTION get_warehouse_name_safe(p_warehouse_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_name text;
BEGIN
    IF p_warehouse_id IS NULL THEN RETURN 'N/A'; END IF;
    SELECT name INTO v_name FROM warehouses WHERE id = p_warehouse_id;
    RETURN COALESCE(v_name, 'Unknown Warehouse');
END;
$$;

-- Update existing stock_movements to replace UUIDs with names
DO $$
DECLARE
    v_rec RECORD;
    v_new_reason text;
    v_uuid text;
    v_name text;
BEGIN
    FOR v_rec IN 
        SELECT DISTINCT substring(reason FROM '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') as found_uuid
        FROM stock_movements
        WHERE reason ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    LOOP
        v_uuid := v_rec.found_uuid;
        IF v_uuid IS NOT NULL THEN
            -- Try to find in profiles
            v_name := get_profile_name_safe(v_uuid::uuid);
            IF v_name = 'Unknown Staff' THEN
                -- Try to find in warehouses
                v_name := get_warehouse_name_safe(v_uuid::uuid);
                IF v_name = 'Unknown Warehouse' THEN
                    v_name := 'Deleted Entity';
                END IF;
            END IF;
            
            -- Replace all occurrences
            UPDATE stock_movements 
            SET reason = replace(reason, v_uuid, v_name)
            WHERE reason LIKE '%' || v_uuid || '%';
        END IF;
    END LOOP;
END;
$$;

-- Drop the helper functions since they are no longer needed
DROP FUNCTION IF EXISTS get_profile_name_safe(uuid);
DROP FUNCTION IF EXISTS get_warehouse_name_safe(uuid);

-- Now, update the record_stock_transfer function to use names instead of UUIDs
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
    
    -- Names for logging
    v_from_warehouse_name text := 'N/A';
    v_to_warehouse_name text := 'N/A';
    v_from_user_name text := 'N/A';
    v_to_user_name text := 'N/A';
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT ur.role, ur.warehouse_id INTO v_caller_role, v_caller_warehouse_id
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    IF v_caller_role IS NULL THEN RAISE EXCEPTION 'User has no assigned role'; END IF;

    IF v_caller_role = 'pos' THEN
        IF p_transfer_type NOT IN ('warehouse_to_staff', 'staff_to_staff') THEN
            RAISE EXCEPTION 'POS role cannot perform % transfers', p_transfer_type;
        END IF;
    END IF;

    IF v_caller_role = 'agent' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Agent role cannot perform % transfers', p_transfer_type;
        END IF;
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Agents can only transfer their own stock to warehouse';
        END IF;
    END IF;

    IF v_caller_role = 'marketer' THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Marketer role cannot perform % transfers', p_transfer_type;
        END IF;
        IF p_transfer_type = 'staff_to_warehouse' AND p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Marketers can only transfer their own stock to warehouse';
        END IF;
    END IF;

    SELECT base_price INTO v_product_price FROM products WHERE id = p_product_id;
    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    IF p_transfer_type = 'staff_to_warehouse' THEN
        v_status := 'pending';
    ELSE
        v_status := 'completed';
    END IF;

    v_display_id := public.generate_display_id('TRF'::text, 'stock_transfers_seq'::text);

    IF p_transfer_type = 'warehouse_to_staff' THEN
        SELECT ur.warehouse_id INTO v_dest_warehouse_id
        FROM user_roles ur
        WHERE ur.user_id = p_to_user_id;

        IF v_dest_warehouse_id IS NULL THEN RAISE EXCEPTION 'Recipient has no warehouse assignment'; END IF;

        UPDATE product_stock
        SET quantity = quantity - p_quantity, updated_at = NOW()
        WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN RAISE EXCEPTION 'Insufficient stock in warehouse or product not found'; END IF;

        INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity, amount_value, transfer_count, last_received_at)
        VALUES (p_to_user_id, v_dest_warehouse_id, p_product_id, p_quantity, p_quantity * v_product_price, 1, NOW())
        ON CONFLICT (user_id, product_id, warehouse_id) DO UPDATE SET
            quantity = staff_stock.quantity + EXCLUDED.quantity,
            amount_value = staff_stock.amount_value + EXCLUDED.amount_value,
            transfer_count = staff_stock.transfer_count + 1,
            last_received_at = NOW();

    ELSIF p_transfer_type = 'staff_to_warehouse' THEN
        v_source_warehouse_id := p_from_warehouse_id;
        v_dest_warehouse_id := p_to_warehouse_id;

        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock
        WHERE user_id = p_from_user_id AND product_id = p_product_id;

        UPDATE staff_stock
        SET quantity = quantity - p_quantity, 
            amount_value = amount_value - (p_quantity * v_product_price),
            transfer_count = transfer_count + 1,
            last_sale_at = NOW()
        WHERE user_id = p_from_user_id AND product_id = p_product_id AND warehouse_id = v_source_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN RAISE EXCEPTION 'Insufficient stock with staff member'; END IF;

        IF v_caller_role IN ('manager', 'super_admin') THEN
            INSERT INTO product_stock (product_id, warehouse_id, quantity)
            VALUES (p_product_id, v_dest_warehouse_id, p_quantity)
            ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
                quantity = product_stock.quantity + p_quantity;
            v_status := 'completed';
        END IF;
    END IF;

    IF p_transfer_type = 'staff_to_staff' THEN
        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock
        WHERE user_id = p_from_user_id AND product_id = p_product_id;

        SELECT ur.warehouse_id INTO v_dest_warehouse_id
        FROM user_roles ur
        WHERE ur.user_id = p_to_user_id;

        UPDATE staff_stock
        SET quantity = quantity - p_quantity, transfer_count = transfer_count + 1
        WHERE user_id = p_from_user_id AND product_id = p_product_id AND warehouse_id = v_source_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN RAISE EXCEPTION 'Insufficient stock with source staff member'; END IF;

        INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity, amount_value, transfer_count, last_received_at)
        VALUES (p_to_user_id, v_dest_warehouse_id, p_product_id, p_quantity, p_quantity * v_product_price, 1, NOW())
        ON CONFLICT (user_id, product_id, warehouse_id) DO UPDATE SET
            quantity = staff_stock.quantity + EXCLUDED.quantity,
            amount_value = staff_stock.amount_value + EXCLUDED.amount_value,
            transfer_count = staff_stock.transfer_count + 1,
            last_received_at = NOW();
    END IF;

    IF p_transfer_type = 'warehouse_to_warehouse' THEN
        UPDATE product_stock
        SET quantity = quantity - p_quantity, updated_at = NOW()
        WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id
        RETURNING quantity INTO v_remaining_qty;

        IF v_remaining_qty IS NULL THEN RAISE EXCEPTION 'Insufficient stock in source warehouse'; END IF;

        INSERT INTO product_stock (product_id, warehouse_id, quantity)
        VALUES (p_product_id, p_to_warehouse_id, p_quantity)
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            quantity = product_stock.quantity + EXCLUDED.quantity;
    END IF;

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

    -- Fetch names for logging
    IF p_from_warehouse_id IS NOT NULL THEN
        SELECT name INTO v_from_warehouse_name FROM warehouses WHERE id = p_from_warehouse_id;
    END IF;
    IF p_to_warehouse_id IS NOT NULL THEN
        SELECT name INTO v_to_warehouse_name FROM warehouses WHERE id = p_to_warehouse_id;
    END IF;
    IF p_from_user_id IS NOT NULL THEN
        SELECT full_name INTO v_from_user_name FROM profiles WHERE user_id = p_from_user_id;
    END IF;
    IF p_to_user_id IS NOT NULL THEN
        SELECT full_name INTO v_to_user_name FROM profiles WHERE user_id = p_to_user_id;
    END IF;

    DECLARE
        v_reason_text text;
    BEGIN
        v_reason_text := p_transfer_type || ' | ';
        
        CASE p_transfer_type
            WHEN 'warehouse_to_staff' THEN
                v_reason_text := v_reason_text || 'Warehouse: ' || COALESCE(v_from_warehouse_name, 'N/A') || ' -> Staff: ' || COALESCE(v_to_user_name, 'N/A');
            WHEN 'staff_to_warehouse' THEN
                v_reason_text := v_reason_text || 'Staff: ' || COALESCE(v_from_user_name, 'N/A') || ' -> Warehouse: ' || COALESCE(v_to_warehouse_name, 'N/A');
            WHEN 'staff_to_staff' THEN
                v_reason_text := v_reason_text || 'Staff: ' || COALESCE(v_from_user_name, 'N/A') || ' -> Staff: ' || COALESCE(v_to_user_name, 'N/A');
            WHEN 'warehouse_to_warehouse' THEN
                v_reason_text := v_reason_text || 'Warehouse: ' || COALESCE(v_from_warehouse_name, 'N/A') || ' -> Warehouse: ' || COALESCE(v_to_warehouse_name, 'N/A');
            ELSE
                v_reason_text := v_reason_text || p_transfer_type;
        END CASE;

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

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'display_id', v_display_id,
        'status', v_status
    );
END;
$$;

-- And update approve_stock_return to use names
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
    
    v_from_user_name text := 'N/A';
    v_to_warehouse_name text := 'N/A';
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT ur.role INTO v_caller_role FROM user_roles ur WHERE ur.user_id = v_caller_id;
    IF v_caller_role NOT IN ('super_admin', 'manager', 'pos') THEN
        RAISE EXCEPTION 'Only admins, managers, or POS users can approve stock returns';
    END IF;

    SELECT * INTO v_transfer FROM stock_transfers
    WHERE id = p_transfer_id AND transfer_type = 'staff_to_warehouse' AND status = 'pending';

    IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Transfer not found or not in pending status'; END IF;

    SELECT base_price INTO v_product_price FROM products WHERE id = v_transfer.product_id;
    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    v_difference := v_transfer.quantity - p_actual_quantity;

    SELECT warehouse_id INTO v_source_warehouse_id
    FROM staff_stock
    WHERE user_id = v_transfer.from_user_id AND product_id = v_transfer.product_id;

    INSERT INTO product_stock (product_id, warehouse_id, quantity)
    VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, p_actual_quantity)
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
        quantity = product_stock.quantity + p_actual_quantity;

    IF v_difference > 0 THEN RAISE NOTICE 'Shortage of % units - staff accountable for difference', v_difference; END IF;

    UPDATE stock_transfers
    SET status = 'approved', reviewed_by = v_caller_id, reviewed_at = NOW(),
        actual_quantity = p_actual_quantity, difference = v_difference,
        description = COALESCE(description, '') || ' | Approved: ' || COALESCE(p_notes, '')
    WHERE id = p_transfer_id;

    -- Fetch names for logging
    SELECT full_name INTO v_from_user_name FROM profiles WHERE user_id = v_transfer.from_user_id;
    SELECT name INTO v_to_warehouse_name FROM warehouses WHERE id = v_transfer.to_warehouse_id;

    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.from_warehouse_id,
        -v_transfer.quantity, 'transfer', 
        'return_approved | Staff: ' || COALESCE(v_from_user_name, 'N/A') || ' -> Warehouse: ' || COALESCE(v_to_warehouse_name, 'N/A'),
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * v_transfer.quantity,
        'staff', 'warehouse'
    );

    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.to_warehouse_id,
        p_actual_quantity, 'transfer', 
        'return_approved | Staff: ' || COALESCE(v_from_user_name, 'N/A') || ' -> Warehouse: ' || COALESCE(v_to_warehouse_name, 'N/A'),
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * p_actual_quantity,
        'staff', 'warehouse'
    );

    RETURN jsonb_build_object('success', true, 'approved_quantity', p_actual_quantity, 'difference', v_difference);
END;
$$;

-- And update reject_stock_return to use names
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
    
    v_from_user_name text := 'N/A';
    v_to_warehouse_name text := 'N/A';
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT ur.role INTO v_caller_role FROM user_roles ur WHERE ur.user_id = v_caller_id;
    IF v_caller_role NOT IN ('super_admin', 'manager', 'pos') THEN RAISE EXCEPTION 'Only admins, managers, or POS users can reject stock returns'; END IF;

    SELECT * INTO v_transfer FROM stock_transfers
    WHERE id = p_transfer_id AND transfer_type = 'staff_to_warehouse' AND status = 'pending';

    IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Transfer not found or not in pending status'; END IF;

    SELECT base_price INTO v_product_price FROM products WHERE id = v_transfer.product_id;
    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    UPDATE staff_stock
    SET quantity = quantity + v_transfer.quantity,
        amount_value = amount_value + (v_transfer.quantity * v_product_price),
        transfer_count = transfer_count + 1
    WHERE user_id = v_transfer.from_user_id AND product_id = v_transfer.product_id AND warehouse_id = v_transfer.from_warehouse_id;

    UPDATE stock_transfers
    SET status = 'rejected', reviewed_by = v_caller_id, reviewed_at = NOW(),
        description = COALESCE(description, '') || ' | Rejected: ' || COALESCE(p_notes, '')
    WHERE id = p_transfer_id;

    -- Fetch names for logging
    SELECT full_name INTO v_from_user_name FROM profiles WHERE user_id = v_transfer.from_user_id;
    SELECT name INTO v_to_warehouse_name FROM warehouses WHERE id = v_transfer.to_warehouse_id;

    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type, reason,
        from_user_id, to_user_id, transfer_id, created_by, unit_price, total_value,
        from_location, to_location
    )
    VALUES (
        v_transfer.product_id, v_transfer.from_warehouse_id,
        v_transfer.quantity, 'transfer', 
        'return_rejected | Staff: ' || COALESCE(v_from_user_name, 'N/A') || ' -> Warehouse: ' || COALESCE(v_to_warehouse_name, 'N/A') || ' | Stock restored to staff',
        v_transfer.from_user_id, NULL, p_transfer_id, v_caller_id,
        v_product_price, v_product_price * v_transfer.quantity,
        'warehouse', 'staff'
    );

    RETURN jsonb_build_object('success', true, 'message', 'Stock return rejected, stock restored to staff');
END;
$$;
