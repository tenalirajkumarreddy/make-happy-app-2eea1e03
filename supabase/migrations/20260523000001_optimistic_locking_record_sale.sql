-- Optimistic concurrency for record_sale: p_expected_outstanding guards stale-writes
DROP FUNCTION IF EXISTS public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id            TEXT,
  p_store_id              UUID,
  p_customer_id           UUID,
  p_recorded_by           UUID,
  p_logged_by             UUID,
  p_total_amount          NUMERIC,
  p_cash_amount           NUMERIC,
  p_upi_amount            NUMERIC,
  p_outstanding_amount    NUMERIC,
  p_sale_items            JSONB,
  p_created_at            TIMESTAMPTZ DEFAULT NULL,
  p_expected_outstanding  NUMERIC DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_credit_limit NUMERIC := 0;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_warehouse_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_available_stock NUMERIC;
    v_insufficient_stock_products TEXT[] := ARRAY[]::TEXT[];
    v_target_user_id UUID;
    v_product_name TEXT;
    v_computed_total NUMERIC;
    v_final_total NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Calculate total from items
    SELECT COALESCE(SUM((item->>'total_price')::NUMERIC), 0)
    INTO v_computed_total
    FROM jsonb_array_elements(p_sale_items) AS item;

    v_final_total := CASE WHEN p_total_amount > 0 THEN p_total_amount ELSE v_computed_total END;

    -- Deterministic warehouse resolution (no CROSS JOIN)
    SELECT COALESCE(
      (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
      (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    SELECT role INTO v_caller_role FROM public.user_roles WHERE user_id = p_recorded_by LIMIT 1;
    v_caller_is_admin := v_caller_role = 'super_admin';
    v_target_user_id := p_recorded_by;

    IF NOT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id) THEN
        v_caller_is_admin := TRUE;
    END IF;

    -- Lock store row and optimistic concurrency check
    SELECT s.outstanding, s.store_type_id
    INTO v_old_outstanding, v_store_type_id
    FROM public.stores s WHERE s.id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    -- Reject if caller's expected_outstanding is stale
    IF p_expected_outstanding IS NOT NULL AND p_expected_outstanding != v_old_outstanding THEN
        RAISE EXCEPTION 'concurrent_modification: expected=%, actual=%', p_expected_outstanding, v_old_outstanding
            USING HINT = 'The store outstanding was modified by another transaction. Refresh and retry.';
    END IF;

    -- Validate outstanding_amount matches total minus payments
    v_computed_outstanding := v_final_total - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0);
    IF p_outstanding_amount != v_computed_outstanding THEN
        RAISE EXCEPTION 'outstanding_amount_mismatch: computed=%, provided=%', v_computed_outstanding, p_outstanding_amount;
    END IF;

    v_new_outstanding := v_old_outstanding + v_computed_outstanding;

    -- Credit limit: use the sale's customer (p_customer_id), not store's default customer
    SELECT c.kyc_status, c.credit_limit_override
    INTO v_kyc_status, v_credit_limit_override
    FROM public.customers c WHERE c.id = p_customer_id;

    IF v_credit_limit_override IS NOT NULL THEN
        IF v_credit_limit_override < 0 THEN
            RAISE EXCEPTION 'invalid_credit_limit_override: Cannot be negative';
        END IF;
        v_credit_limit := v_credit_limit_override;
    ELSE
        SELECT CASE WHEN v_kyc_status IN ('verified', 'approved') THEN COALESCE(credit_limit_kyc, 0)
        ELSE COALESCE(credit_limit_no_kyc, 0) END INTO v_credit_limit
        FROM public.store_types WHERE id = v_store_type_id;
    END IF;

    IF v_credit_limit > 0 AND v_new_outstanding > v_credit_limit AND NOT v_caller_is_admin THEN
        RAISE EXCEPTION 'credit_limit_exceeded';
    END IF;

    -- Pre-check stock availability
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;
        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        SELECT COALESCE(ss.quantity, 0) INTO v_available_stock
        FROM public.staff_stock ss
        WHERE ss.user_id = v_target_user_id AND ss.product_id = v_product_id AND ss.warehouse_id = v_warehouse_id;

        IF v_available_stock < v_quantity THEN
            SELECT COALESCE(ps.quantity, 0) INTO v_available_stock
            FROM public.product_stock ps
            WHERE ps.product_id = v_product_id AND ps.warehouse_id = v_warehouse_id;

            IF v_available_stock < v_quantity THEN
                v_insufficient_stock_products := array_append(v_insufficient_stock_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        END IF;
    END LOOP;

    IF array_length(v_insufficient_stock_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_stock_products, ', ');
    END IF;

    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        v_final_total, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by
    ) RETURNING id INTO v_sale_id;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
    SELECT v_sale_id, (item->>'product_id')::UUID, (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC, (item->>'total_price')::NUMERIC
    FROM jsonb_array_elements(p_sale_items) AS item;

    UPDATE public.orders o SET status = 'delivered', delivered_at = now(), fulfilled_by = p_recorded_by
    WHERE o.store_id = p_store_id AND o.status = 'pending'
    AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id
    AND oi.product_id IN (SELECT (item->>'product_id')::UUID FROM jsonb_array_elements(p_sale_items) AS item));

    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;
