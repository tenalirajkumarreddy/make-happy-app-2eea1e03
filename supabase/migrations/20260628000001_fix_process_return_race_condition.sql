-- Fix race condition in process_completed_sale_return where concurrent
-- calls could double-increment stock by processing the same return twice.
-- Adds FOR UPDATE to the first SELECT to block concurrent access.

CREATE OR REPLACE FUNCTION public.process_completed_sale_return(p_return_id UUID)
RETURNS TABLE(out_return_id UUID, out_success BOOLEAN, out_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return RECORD;
    v_sale RECORD;
    v_store RECORD;
    v_item RECORD;
    v_warehouse_id UUID;
    v_return_amount NUMERIC := 0;
    v_is_agent BOOLEAN;
BEGIN
    -- Lock the return row to prevent concurrent processing
    SELECT * INTO v_return FROM sale_returns
    WHERE id = p_return_id AND status = 'approved' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Approved return not found - may have already been processed';
    END IF;

    -- Lock the sale row too
    SELECT * INTO v_sale FROM sales WHERE id = v_return.sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    -- Get store details
    SELECT * INTO v_store FROM stores WHERE id = v_sale.store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    -- Determine the warehouse to restore stock to
    v_warehouse_id := v_sale.warehouse_id;
    IF v_warehouse_id IS NULL THEN
        SELECT COALESCE(
          (SELECT warehouse_id FROM public.user_roles WHERE user_id = v_sale.recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
          (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
          (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
        ) INTO v_warehouse_id;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Warehouse not resolved for sale/return';
    END IF;

    -- Calculate return amount and process stock restoration for each item
    FOR v_item IN 
        SELECT sri.product_id, sri.quantity, sri.unit_price, sri.total
        FROM sale_return_items sri
        WHERE sri.return_id = p_return_id
    LOOP
        v_return_amount := v_return_amount + v_item.total;

        -- Check if it is NOT damaged (then restore stock)
        IF v_return.is_damaged IS NOT TRUE THEN
            -- Check if the return creator is an agent
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = v_return.created_by AND role = 'agent'
            ) INTO v_is_agent;

            IF v_is_agent THEN
                -- Restore to agent staff stock
                INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
                VALUES (v_return.created_by, v_item.product_id, v_warehouse_id, v_item.quantity, NOW(), NOW())
                ON CONFLICT (user_id, product_id, warehouse_id)
                DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW(),
                              last_sale_at = NOW();

                -- Log stock movement (return to agent)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock returned to agent holding for return ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
            ELSE
                -- Restore to warehouse stock
                INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, NOW())
                ON CONFLICT (product_id, warehouse_id)
                DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW();

                -- Log stock movement (return to warehouse)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock returned to warehouse for return ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
            END IF;
        ELSE
            -- Log as wastage (no stock restored anywhere)
            INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
            VALUES (v_item.product_id, v_warehouse_id, -v_item.quantity, 'wastage', 'Damaged items from return - wastage ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
        END IF;
    END LOOP;

    -- Update outstanding adjustment in sale_returns
    UPDATE public.sale_returns
    SET outstanding_adjustment = v_return_amount,
        status = 'completed',
        completed_at = NOW(),
        processed_by = auth.uid()
    WHERE id = p_return_id;

    -- Recalculate store outstanding atomically
    UPDATE public.stores 
    SET outstanding = public.recalc_store_outstanding_logic(v_sale.store_id),
        updated_at = NOW()
    WHERE id = v_sale.store_id;

    -- Recalculate running balances timeline for consistency
    PERFORM public.recalc_running_balances(v_sale.store_id);

    -- Log activity
    INSERT INTO public.activity_log (action, entity_type, entity_id, user_id, details)
    VALUES ('sale_return_completed', 'sale_return', p_return_id, auth.uid(), jsonb_build_object(
        'sale_id', v_sale.id,
        'store_id', v_sale.store_id,
        'return_amount', v_return_amount,
        'is_damaged', v_return.is_damaged,
        'new_outstanding', public.recalc_store_outstanding_logic(v_sale.store_id)
    ));

    IF v_return.is_damaged IS TRUE THEN
        RETURN QUERY SELECT p_return_id, TRUE, 
            'Return processed: Damaged items logged as wastage, outstanding reduced by Rs ' || v_return_amount;
    ELSE
        RETURN QUERY SELECT p_return_id, TRUE, 
            'Return processed: Stock restored, outstanding reduced by Rs ' || v_return_amount;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_completed_sale_return(UUID) TO authenticated;