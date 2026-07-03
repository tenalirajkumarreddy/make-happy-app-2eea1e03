-- Migration: Fix sale return stock restoration and per-item damage logic
-- Date: 2026-07-02
-- Issues fixed:
-- 1. process_completed_sale_return referenced wrong column names (quantity -> return_qty, total -> total_price)
-- 2. Per-item damage logic was broken - used sale-level is_damaged instead of item-level damaged_qty
-- 3. record_sale_return did not persist the is_damaged flag on sale_returns

-- Fix 1: Update record_sale_return to persist is_damaged flag
DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id           UUID,
    p_returned_by       UUID,
    p_reason            TEXT,
    p_items             JSONB,
    p_created_at        TIMESTAMPTZ DEFAULT NULL,
    p_notes             TEXT DEFAULT NULL
)
RETURNS TABLE(return_id UUID, display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_display_id TEXT;
    v_sale RECORD;
    v_item JSONB;
    v_sale_item_id UUID;
    v_product_id UUID;
    v_return_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_total_return_amount NUMERIC := 0;
    v_original_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_store_old_outstanding NUMERIC;
    v_any_damaged BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock & fetch the sale
    SELECT * INTO v_sale
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale % not found', p_sale_id;
    END IF;

    -- Lock the store row for consistency
    SELECT outstanding INTO v_store_old_outstanding
    FROM public.stores WHERE id = v_sale.store_id FOR UPDATE;

    -- Generate display ID
    v_display_id := 'SR-' || to_char(COALESCE(p_created_at, now()), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT || '-RETURN';

    -- Check for any damaged items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_damaged_qty := COALESCE((v_item->>'damaged_qty')::NUMERIC, 0);
        IF v_damaged_qty > 0 THEN
            v_any_damaged := TRUE;
        END IF;
    END LOOP;

    -- Insert return header with notes and is_damaged flag
    INSERT INTO public.sale_returns (
        sale_id, store_id, customer_id, created_by, reason, display_id,
        return_date, total_amount, status, created_at, notes, is_damaged
    ) VALUES (
        p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id,
        COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()), p_notes, v_any_damaged
    )
    RETURNING id INTO v_return_id;

    -- Process each returned item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item->>'sale_item_id')::UUID;
        v_product_id := (v_item->>'product_id')::UUID;
        v_return_qty := COALESCE((v_item->>'return_qty')::NUMERIC, 0);
        v_damaged_qty := COALESCE((v_item->>'damaged_qty')::NUMERIC, 0);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);

        IF v_damaged_qty > v_return_qty THEN
            RAISE EXCEPTION 'Damaged quantity (%) exceeds return quantity (%)', v_damaged_qty, v_return_qty;
        END IF;

        SELECT quantity, unit_price INTO v_original_qty, v_unit_price
        FROM public.sale_items WHERE id = v_sale_item_id AND sale_id = p_sale_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found', v_sale_item_id;
        END IF;

        -- Calculate subtotal
        v_subtotal := v_unit_price * v_return_qty;
        v_total_return_amount := v_total_return_amount + v_subtotal;

        -- Insert return item
        INSERT INTO public.sale_return_items (return_id, product_id, return_qty, damaged_qty, unit_price, total_price, created_at)
        VALUES (v_return_id, v_product_id, v_return_qty, v_damaged_qty, v_unit_price, v_subtotal, COALESCE(p_created_at, now()));

    END LOOP;

    -- Update the sale_return total
    UPDATE public.sale_returns SET total_amount = v_total_return_amount WHERE id = v_return_id;

    -- Calculate new outstanding for the sale
    v_new_outstanding := GREATEST(v_sale.outstanding_amount - v_total_return_amount, 0);

    -- Update sale
    UPDATE public.sales SET
        outstanding_amount = v_new_outstanding,
        is_fully_returned = TRUE
    WHERE id = p_sale_id;

    -- Store outstanding update
    UPDATE public.stores SET outstanding = outstanding - v_total_return_amount
    WHERE id = v_sale.store_id;

    -- Also update the new outstanding for the sale tracker
    v_new_outstanding := v_store_old_outstanding - v_total_return_amount;

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;

-- Fix 2: Fix process_completed_sale_return to use correct columns and per-item damage logic
DROP FUNCTION IF EXISTS public.process_completed_sale_return(UUID);

CREATE OR REPLACE FUNCTION public.process_completed_sale_return(p_return_id UUID)
RETURNS TABLE(out_return_id UUID, out_success BOOLEAN, out_result_message TEXT)
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
    v_good_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_reason TEXT;
BEGIN
    -- Lock the return row to prevent concurrent processing
    SELECT * INTO v_return 
    FROM sale_returns
    WHERE id = p_return_id AND status = 'approved' FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT p_return_id, FALSE, 'Approved return not found - may have already been processed'::TEXT;
        RETURN;
    END IF;
    
    -- Lock the sale row too
    SELECT * INTO v_sale 
    FROM sales 
    WHERE id = v_return.sale_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT p_return_id, FALSE, 'Sale not found'::TEXT;
        RETURN;
    END IF;
    
    -- Get store details
    SELECT * INTO v_store 
    FROM stores 
    WHERE id = v_sale.store_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT p_return_id, FALSE, 'Store not found'::TEXT;
        RETURN;
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
        RETURN QUERY SELECT p_return_id, FALSE, 'Warehouse not resolved for sale/return'::TEXT;
        RETURN;
    END IF;
    
    -- Calculate return amount and process stock restoration for each item
    FOR v_item IN 
        SELECT sri.id, sri.product_id, sri.return_qty, sri.damaged_qty, sri.unit_price, sri.total_price,
               p.name as product_name
        FROM sale_return_items sri
        LEFT JOIN products p ON p.id = sri.product_id
        WHERE sri.return_id = p_return_id
    LOOP
        v_return_amount := v_return_amount + v_item.total_price;

        -- Calculate good vs damaged quantities per item
        v_damaged_qty := COALESCE(v_item.damaged_qty, 0);
        v_good_qty := GREATEST(v_item.return_qty - v_damaged_qty, 0);

        -- Process good stock: return to inventory
        IF v_good_qty > 0 THEN
            -- Check if the return creator is an agent
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = v_return.created_by AND role = 'agent'
            ) INTO v_is_agent;
            
            IF v_is_agent THEN
                -- Restore to agent staff stock
                INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
                VALUES (v_return.created_by, v_item.product_id, v_warehouse_id, v_good_qty, NOW(), NOW())
                ON CONFLICT (user_id, product_id, warehouse_id)
                DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW(),
                              last_sale_at = NOW();

                -- Log stock movement (return to agent)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_good_qty, 'return', 'Stock returned to agent from return ' || v_return.display_id || ' (good items)', v_return.id::text, v_return.created_by, NOW());
            ELSE
                -- Restore to warehouse stock
                INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
                VALUES (v_item.product_id, v_warehouse_id, v_good_qty, NOW())
                ON CONFLICT (product_id, warehouse_id)
                DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW();

                -- Log stock movement (return to warehouse)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_good_qty, 'return', 'Stock returned to warehouse from return ' || v_return.display_id || ' (good items)', v_return.id::text, v_return.created_by, NOW());
            END IF;
        END IF;
        
        -- Process damaged stock: log as wastage, do NOT add to inventory
        IF v_damaged_qty > 0 THEN
            -- Get the reason text for the log
            v_reason := COALESCE(v_return.reason, 'damaged');
            
            -- Log as wastage in stock_movements
            INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
            VALUES (v_item.product_id, v_warehouse_id, -v_damaged_qty, 'wastage', 
                    'Damaged items from return ' || v_return.display_id || ' - Reason: ' || v_reason, 
            v_return.id::text, v_return.created_by, NOW());
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
        'return_id', v_return.id,
        'display_id', v_return.display_id,
        'new_outstanding', public.recalc_store_outstanding_logic(v_sale.store_id)
    ));
    
    RETURN QUERY SELECT p_return_id, TRUE, 
        'Return processed. Good stock restored, ' || v_return_amount || ' worth of items.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_completed_sale_return(UUID) TO authenticated;
