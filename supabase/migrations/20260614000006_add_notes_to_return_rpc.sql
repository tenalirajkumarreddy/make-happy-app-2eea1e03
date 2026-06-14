-- Migration: Add Notes Parameter to record_sale_return RPC
-- Date: 2026-06-14
-- Priority: P1 - HIGH (Data Integrity)
--
-- Issue Fixed:
-- SaleReturnDialog was doing a separate UPDATE on sale_returns after the RPC,
-- which could fail silently under RLS, losing the notes.
--
-- Fix:
-- Add p_notes parameter to the RPC so notes are inserted atomically

DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id           UUID,
    p_returned_by       UUID,
    p_reason            TEXT,
    p_items             JSONB,
    p_created_at        TIMESTAMPTZ DEFAULT NULL,
    p_notes             TEXT DEFAULT NULL  -- ✅ ADDED: Notes parameter
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
    v_warehouse_id UUID;
    v_item JSONB;
    v_sale_item_id UUID;
    v_product_id UUID;
    v_return_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_total_return_amount NUMERIC := 0;
    v_previously_returned NUMERIC;
    v_original_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_target_user_id UUID;
    v_old_outstanding NUMERIC;
    v_good_qty NUMERIC;
    
    -- Enforce full return vars
    v_sale_items_count INT;
    v_return_items_count INT;
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

    -- Enforce Next-Day Return Lockout
    IF v_sale.created_at::date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Sale returns are only allowed on the same day the sale was recorded';
    END IF;

    -- Enforce full returns only: Check total number of items
    SELECT COUNT(*) INTO v_sale_items_count FROM public.sale_items WHERE sale_id = p_sale_id;
    SELECT jsonb_array_length(p_items) INTO v_return_items_count;

    IF v_sale_items_count != v_return_items_count THEN
        RAISE EXCEPTION 'Partial returns are not allowed. You must return all items in the sale.';
    END IF;

    -- Check if any item has been returned before to ensure zero duplicate returns
    IF EXISTS (
        SELECT 1 FROM public.sale_return_tracked_items srti
        JOIN public.sale_items si ON srti.sale_item_id = si.id
        WHERE si.sale_id = p_sale_id
    ) THEN
        RAISE EXCEPTION 'This sale has already been returned or partially returned.';
    END IF;

    v_old_outstanding := v_sale.outstanding_amount;
    v_warehouse_id := COALESCE(v_sale.warehouse_id, (
        SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1
    ));
    v_target_user_id := v_sale.recorded_by;

    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id)
    INTO v_has_staff_stock;

    -- Generate display ID
    SELECT COALESCE(p_sale_id::TEXT, 'SR-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT) || '-RETURN'
    INTO v_display_id;

    -- ✅ FIXED: Insert notes directly in the RPC
    INSERT INTO public.sale_returns (
        sale_id, store_id, customer_id, created_by, reason, display_id, 
        return_date, total_amount, status, created_at, notes
    )
    VALUES (
        p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id, 
        COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()),
        p_notes  -- ✅ Added notes
    )
    RETURNING id INTO v_return_id;

    -- Process each returned item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item->>'sale_item_id')::UUID;
        v_product_id := (v_item->>'product_id')::UUID;
        v_return_qty := (v_item->>'return_qty')::NUMERIC;
        v_damaged_qty := COALESCE((v_item->>'damaged_qty')::NUMERIC, 0);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        IF v_damaged_qty > v_return_qty THEN
            RAISE EXCEPTION 'Damaged quantity (%) exceeds return quantity (%)', v_damaged_qty, v_return_qty;
        END IF;

        -- Get original sale item quantity and unit_price
        SELECT quantity, unit_price INTO v_original_qty, v_unit_price
        FROM public.sale_items WHERE id = v_sale_item_id AND sale_id = p_sale_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found on this sale', v_sale_item_id;
        END IF;

        -- Enforce item returned quantity equals original quantity (no partial return of items)
        IF v_return_qty != v_original_qty THEN
            RAISE EXCEPTION 'Partial item returns are not allowed. You must return all quantities for each product.';
        END IF;

        -- Track the return
        INSERT INTO public.sale_return_tracked_items (
            return_id, sale_item_id, product_id,
            returned_qty, damaged_qty, unit_price, subtotal
        ) VALUES (
            v_return_id, v_sale_item_id, v_product_id,
            v_return_qty, v_damaged_qty, v_unit_price,
            v_return_qty * v_unit_price
        );

        -- Calculate return subtotal for outstanding reduction
        v_subtotal := v_return_qty * v_unit_price;
        v_total_return_amount := v_total_return_amount + v_subtotal;

        -- Restock ONLY non-damaged items (v_good_qty = 0 if entire return is marked damaged)
        v_good_qty := v_return_qty - v_damaged_qty;
        IF v_good_qty > 0 THEN
            IF v_has_staff_stock THEN
                UPDATE public.staff_stock
                SET quantity = quantity + v_good_qty, updated_at = now()
                WHERE user_id = v_target_user_id
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;

                IF NOT FOUND THEN
                    INSERT INTO public.staff_stock (user_id, product_id, quantity, warehouse_id)
                    VALUES (v_target_user_id, v_product_id, v_good_qty, v_warehouse_id);
                END IF;
            ELSE
                UPDATE public.product_stock
                SET quantity = quantity + v_good_qty, updated_at = now()
                WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

                IF NOT FOUND THEN
                    INSERT INTO public.product_stock (product_id, quantity, warehouse_id)
                    VALUES (v_product_id, v_good_qty, v_warehouse_id);
                END IF;
            END IF;
        END IF;

        -- Track damaged/wastage strictly in wastage_entries (no stock leak)
        IF v_damaged_qty > 0 THEN
            INSERT INTO public.wastage_entries (
                product_id, quantity, reason, source, source_id,
                warehouse_id, recorded_by, created_at
            ) VALUES (
                v_product_id, v_damaged_qty,
                'Sale return damaged: ' || COALESCE(p_reason, 'No reason'),
                'sale_return', p_sale_id,
                v_warehouse_id, p_returned_by, now()
            );
        END IF;
    END LOOP;

    -- Calculate new outstanding
    v_new_outstanding := GREATEST(v_old_outstanding - v_total_return_amount, 0);

    -- Update sale outstanding AND SET is_fully_returned
    UPDATE public.sales
    SET outstanding_amount = v_new_outstanding,
        is_fully_returned = CASE WHEN v_new_outstanding = 0 THEN true ELSE false END,
        updated_at = now()
    WHERE id = p_sale_id;

    -- Update sale_returns with outstanding_adjustment, total_amount, and mark completed
    UPDATE public.sale_returns
    SET outstanding_adjustment = v_total_return_amount,
        total_amount = v_total_return_amount,
        status = 'completed',
        processed_at = COALESCE(p_created_at, now()),
        processed_by = auth.uid()
    WHERE id = v_return_id;

    -- Recalculate running balances
    PERFORM public.recalc_running_balances(v_sale.store_id);

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;