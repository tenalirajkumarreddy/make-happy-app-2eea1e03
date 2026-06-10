-- Add is_fully_returned column to sales
ALTER TABLE public.sales ADD COLUMN is_fully_returned BOOLEAN DEFAULT false;

-- Update record_sale_return RPC to auto-mark fully returned sales
CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id UUID,
    p_returned_by UUID,
    p_reason TEXT,
    p_items JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    return_id UUID,
    display_id TEXT,
    new_outstanding NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_remaining_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_target_user_id UUID;
    v_old_outstanding NUMERIC;
    v_good_qty NUMERIC;
    v_is_fully_returned BOOLEAN;
    v_total_original NUMERIC;
    v_total_returned NUMERIC;
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

    v_old_outstanding := v_sale.outstanding_amount;
    v_warehouse_id := COALESCE(v_sale.warehouse_id, (
        SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1
    ));
    v_target_user_id := v_sale.recorded_by;

    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id)
    INTO v_has_staff_stock;

    -- Generate display ID
    v_display_id := 'SR-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT || '-RETURN';

    -- Insert return header
    INSERT INTO public.sale_returns (sale_id, store_id, customer_id, created_by, reason, display_id, return_date, total_amount, status, created_at)
    VALUES (p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id, COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()))
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

        -- Check previously returned qty to prevent re-return
        SELECT COALESCE(SUM(returned_qty), 0) INTO v_previously_returned
        FROM public.sale_return_tracked_items
        WHERE sale_item_id = v_sale_item_id;

        v_remaining_qty := v_original_qty - v_previously_returned;

        IF v_return_qty > v_remaining_qty THEN
            RAISE EXCEPTION 'Cannot return % of item (only % remaining after previous returns)',
                v_return_qty, v_remaining_qty;
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

        -- Restock non-damaged items
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

        -- Track damaged/wastage
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

    -- Check if sale is fully returned (every sale_item has zero remaining qty)
    SELECT
        SUM(si.quantity),
        COALESCE(SUM(srt.returned_qty), 0)
    INTO v_total_original, v_total_returned
    FROM public.sale_items si
    LEFT JOIN public.sale_return_tracked_items srt ON srt.sale_item_id = si.id
    WHERE si.sale_id = p_sale_id
    GROUP BY si.sale_id;

    v_is_fully_returned := COALESCE(v_total_original, 0) > 0 AND COALESCE(v_total_returned, 0) >= COALESCE(v_total_original, 0);

    -- Calculate new outstanding
    v_new_outstanding := GREATEST(v_old_outstanding - v_total_return_amount, 0);

    -- Update sale outstanding and fully_returned flag
    UPDATE public.sales
    SET outstanding_amount = v_new_outstanding,
        is_fully_returned = v_is_fully_returned,
        updated_at = now()
    WHERE id = p_sale_id;

    -- Update store outstanding (reduce by return amount)
    UPDATE public.stores
    SET outstanding = GREATEST(outstanding - v_total_return_amount, 0),
        updated_at = now()
    WHERE id = v_sale.store_id;

    -- Update sale_returns with outstanding_adjustment, total_amount, and mark processed
    UPDATE public.sale_returns
    SET outstanding_adjustment = v_total_return_amount,
        total_amount = v_total_return_amount,
        status = 'processed',
        processed_at = COALESCE(p_created_at, now()),
        processed_by = auth.uid()
    WHERE id = v_return_id;

    -- Recalculate running balances
    PERFORM public.recalc_running_balances(v_sale.store_id);

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;

-- Update edit_sale RPC to reset is_fully_returned
CREATE OR REPLACE FUNCTION public.edit_sale(
    p_original_sale_id UUID,
    p_store_id UUID,
    p_customer_id UUID,
    p_display_id TEXT,
    p_total_amount NUMERIC,
    p_cash_amount NUMERIC DEFAULT 0,
    p_upi_amount NUMERIC DEFAULT 0,
    p_outstanding_amount NUMERIC DEFAULT 0,
    p_sale_items JSONB DEFAULT '[]'::JSONB,
    p_recorded_by UUID DEFAULT NULL,
    p_logged_by UUID DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT NULL,
    p_expected_outstanding NUMERIC DEFAULT NULL
)
RETURNS TABLE(
    sale_id UUID,
    display_id TEXT,
    new_outstanding NUMERIC,
    success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_orig RECORD;
    v_orig_item RECORD;
    v_has_staff_stock BOOLEAN;
    v_warehouse_id UUID;
    v_new_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_all_product_ids uuid[];
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_staff_available_stock NUMERIC;
    v_product_available_stock NUMERIC;
    v_store_customer_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock & fetch the original sale
    SELECT * INTO v_orig
    FROM public.sales WHERE id = p_original_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original sale % not found', p_original_sale_id;
    END IF;

    -- Resolve warehouse
    SELECT COALESCE(
      (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
      (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    -- Resolve caller role
    SELECT role INTO v_caller_role FROM public.user_roles WHERE user_id = p_recorded_by LIMIT 1;
    v_caller_is_admin := v_caller_role IN ('super_admin', 'manager');

    -- Check staff stock
    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = p_recorded_by) INTO v_has_staff_stock;

    -- ── REVERSE ORIGINAL SALE ──────────────────────────────────────────────
    -- Reverse stock: add quantities back
    FOR v_orig_item IN SELECT * FROM public.sale_items WHERE sale_id = p_original_sale_id
    LOOP
        IF v_has_staff_stock THEN
            UPDATE public.staff_stock
            SET quantity = quantity + v_orig_item.quantity, updated_at = now()
            WHERE user_id = v_orig.recorded_by
              AND product_id = v_orig_item.product_id
              AND warehouse_id = v_warehouse_id;
            IF NOT FOUND THEN
                INSERT INTO public.staff_stock (user_id, product_id, quantity, warehouse_id)
                VALUES (v_orig.recorded_by, v_orig_item.product_id, v_orig_item.quantity, v_warehouse_id);
            END IF;
        ELSE
            UPDATE public.product_stock
            SET quantity = quantity + v_orig_item.quantity, updated_at = now()
            WHERE product_id = v_orig_item.product_id AND warehouse_id = v_warehouse_id;
            IF NOT FOUND THEN
                INSERT INTO public.product_stock (product_id, quantity, warehouse_id)
                VALUES (v_orig_item.product_id, v_orig_item.quantity, v_warehouse_id);
            END IF;
        END IF;
    END LOOP;

    -- Reverse outstanding on store
    UPDATE public.stores
    SET outstanding = outstanding - v_orig.outstanding_amount,
        updated_at = now()
    WHERE id = v_orig.store_id;

    -- Mark original sale as voided (zero out outstanding, reset returned flag)
    UPDATE public.sales
    SET outstanding_amount = 0,
        is_fully_returned = false,
        updated_at = now()
    WHERE id = p_original_sale_id;

    -- ── RECORD NEW SALE ────────────────────────────────────────────────────
    -- Lock store row for new outstanding
    SELECT s.outstanding, s.store_type_id, s.customer_id
    INTO v_old_outstanding, v_store_type_id, v_store_customer_id
    FROM public.stores s WHERE s.id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    IF v_store_customer_id IS DISTINCT FROM p_customer_id THEN
        RAISE EXCEPTION 'Customer does not belong to this store';
    END IF;

    -- Optimistic concurrency check
    IF p_expected_outstanding IS NOT NULL AND p_expected_outstanding != v_old_outstanding THEN
        RAISE EXCEPTION 'concurrent_modification: expected=%, actual=%', p_expected_outstanding, v_old_outstanding
            USING HINT = 'The store outstanding was modified by another transaction. Refresh and retry.';
    END IF;

    -- Validate outstanding math
    v_computed_outstanding := GREATEST(p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0), 0);
    IF p_outstanding_amount != v_computed_outstanding THEN
        RAISE EXCEPTION 'outstanding_mismatch: computed=%, provided=%', v_computed_outstanding, p_outstanding_amount;
    END IF;

    v_new_outstanding := v_old_outstanding + v_computed_outstanding;

    -- Credit limit check
    SELECT value INTO v_credit_limit_check FROM public.company_settings WHERE key = 'credit_limit_check';
    IF v_credit_limit_check = 'true' AND NOT v_caller_is_admin THEN
        SELECT c.kyc_status, c.credit_limit_override
        INTO v_kyc_status, v_credit_limit_override
        FROM public.customers c WHERE c.id = p_customer_id;

        IF v_credit_limit_override IS NOT NULL THEN
            v_credit_limit := v_credit_limit_override;
        ELSE
            SELECT CASE WHEN v_kyc_status IN ('verified', 'approved')
                THEN COALESCE(credit_limit_kyc, 0)
                ELSE COALESCE(credit_limit_no_kyc, 0)
            END INTO v_credit_limit
            FROM public.store_types WHERE id = v_store_type_id;
        END IF;

        IF v_credit_limit > 0 AND v_new_outstanding > v_credit_limit THEN
            RAISE EXCEPTION 'credit_limit_exceeded';
        END IF;
    END IF;

    -- Lock new stock rows
    SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
    INTO v_all_product_ids
    FROM jsonb_array_elements(p_sale_items) AS item;

    PERFORM ss.product_id
    FROM staff_stock ss
    WHERE ss.user_id = p_recorded_by AND ss.product_id = ANY(v_all_product_ids)
    ORDER BY ss.product_id
    FOR UPDATE;

    PERFORM ps.product_id
    FROM product_stock ps
    WHERE ps.warehouse_id = v_warehouse_id AND ps.product_id = ANY(v_all_product_ids)
    ORDER BY ps.product_id
    FOR UPDATE;

    -- Deduct stock for new sale items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        IF v_has_staff_stock THEN
            SELECT ss.quantity INTO v_staff_available_stock
            FROM public.staff_stock ss
            WHERE ss.user_id = p_recorded_by
              AND ss.product_id = v_product_id
              AND ss.warehouse_id = v_warehouse_id;
            v_staff_available_stock := COALESCE(v_staff_available_stock, 0);

            IF v_staff_available_stock >= v_quantity THEN
                UPDATE public.staff_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE user_id = p_recorded_by
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;
            ELSE
                v_staff_available_stock := 0;
            END IF;
        END IF;

        IF NOT v_has_staff_stock OR v_staff_available_stock < v_quantity THEN
            SELECT ps.quantity INTO v_product_available_stock
            FROM public.product_stock ps
            WHERE ps.product_id = v_product_id AND ps.warehouse_id = v_warehouse_id;
            v_product_available_stock := COALESCE(v_product_available_stock, 0);

            IF v_product_available_stock >= v_quantity THEN
                UPDATE public.product_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
            ELSE
                v_insufficient_products := array_append(v_insufficient_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        END IF;
    END LOOP;

    IF array_length(v_insufficient_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_products, ', ');
    END IF;

    IF COALESCE(p_total_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Sale amount must be positive';
    END IF;

    -- Insert new sale
    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by
    ) RETURNING id INTO v_new_sale_id;

    -- Insert new sale items
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
    SELECT v_new_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        COALESCE((item->>'total_price')::NUMERIC, (item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC),
        v_warehouse_id
    FROM jsonb_array_elements(p_sale_items) AS item;

    -- Recalculate running balances
    PERFORM public.recalc_running_balances(p_store_id);

    RETURN QUERY SELECT v_new_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;
