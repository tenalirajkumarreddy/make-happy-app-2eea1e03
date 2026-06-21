-- Fix check_stock_availability warehouse resolution to match record_sale
-- The CROSS JOIN pattern fails silently when no warehouse has is_default = true
-- This causes agents/marketers to see Stock: 0 even when stock exists

CREATE OR REPLACE FUNCTION public.check_stock_availability(p_user_id uuid, p_recorded_for uuid, p_items jsonb)
 RETURNS TABLE(out_product_id uuid, out_product_name text, out_available boolean, out_available_qty numeric, out_physical_qty numeric, out_pending_outgoing numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_target_user_id UUID;
    v_user_role TEXT;
    v_is_admin_or_manager BOOLEAN;
    v_warehouse_id UUID;
    v_item RECORD;
    v_product_id UUID;
    v_requested_qty NUMERIC;
    v_physical_qty NUMERIC;
    v_pending_outgoing NUMERIC;
    v_available_qty NUMERIC;
    v_product_name TEXT;
BEGIN
    v_target_user_id := COALESCE(p_recorded_for, p_user_id);

    -- Get user's role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_target_user_id
    LIMIT 1;

    v_is_admin_or_manager := v_user_role IN ('super_admin', 'manager');

    -- Find warehouse with fallback (aligned with record_sale RPC)
    SELECT COALESCE(
        (SELECT warehouse_id FROM public.user_roles WHERE user_id = v_target_user_id AND warehouse_id IS NOT NULL LIMIT 1),
        (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
        (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC)
    LOOP
        v_product_id := v_item.product_id;
        v_requested_qty := v_item.quantity;

        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        IF v_is_admin_or_manager THEN
            -- Check warehouse stock
            SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
            FROM public.stock_transfers
            WHERE status IN ('pending', 'awaiting_acceptance')
              AND from_warehouse_id = v_warehouse_id
              AND product_id = v_product_id;

            SELECT COALESCE(quantity, 0) INTO v_physical_qty
            FROM public.product_stock
            WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
        ELSE
            -- Try staff stock first
            SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
            FROM public.stock_transfers
            WHERE status IN ('pending', 'awaiting_acceptance')
              AND from_user_id = v_target_user_id
              AND product_id = v_product_id
              AND from_warehouse_id = v_warehouse_id;

            SELECT COALESCE(quantity, 0) INTO v_physical_qty
            FROM public.staff_stock
            WHERE user_id = v_target_user_id AND product_id = v_product_id AND warehouse_id = v_warehouse_id;

            -- If staff stock is not enough, check warehouse fallback (but NOT for agent)
            IF v_user_role != 'agent' AND (v_physical_qty - v_pending_outgoing) < v_requested_qty THEN
                SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
                FROM public.stock_transfers
                WHERE status IN ('pending', 'awaiting_acceptance')
                  AND from_warehouse_id = v_warehouse_id
                  AND product_id = v_product_id;

                SELECT COALESCE(quantity, 0) INTO v_physical_qty
                FROM public.product_stock
                WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
            END IF;
        END IF;

        v_available_qty := v_physical_qty - v_pending_outgoing;

        out_product_id := v_product_id;
        out_product_name := v_product_name;
        out_available := v_available_qty >= v_requested_qty;
        out_available_qty := v_available_qty;
        out_physical_qty := v_physical_qty;
        out_pending_outgoing := v_pending_outgoing;
        RETURN NEXT;
    END LOOP;
END;
$function$;
