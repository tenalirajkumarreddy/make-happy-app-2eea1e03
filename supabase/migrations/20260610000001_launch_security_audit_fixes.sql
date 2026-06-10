-- Launch Security Audit Fixes
-- Date: 2026-06-10
--
-- Fixes:
-- 1. Add role checks to record_sale, record_transaction, record_sale_return
-- 2. Add operator full-payment enforcement server-side
-- 3. Add price validation server-side (check price_override permission)
-- 4. Create record_purchase RPC with dynamic status
-- 5. Create approve_purchase RPC
-- 6. Create reject_handover / cancel_handover RPCs
-- 7. Add holding balance check to create_handover_with_type
-- 8. RLS policies on unprotected financial tables
-- 9. Add bill_url column to purchases if missing
-- =========================================================

-- ──────────────────────────────────────────────
-- 0. Helper: user_has_permission (mirrors frontend ROLE_DEFAULTS)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_enabled BOOLEAN;
BEGIN
  -- Check user_permissions table first (DB override)
  SELECT enabled INTO v_enabled
  FROM public.user_permissions
  WHERE user_id = p_user_id AND permission = p_permission;
  IF FOUND THEN
    RETURN v_enabled;
  END IF;
  -- Fall back to role defaults (mirrors src/lib/permissions.ts)
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id;
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  -- price_override defaults
  IF p_permission = 'price_override' THEN
    RETURN v_role IN ('manager', 'agent', 'operator');
  END IF;
  -- record_sale defaults
  IF p_permission = 'record_sale' THEN
    RETURN v_role IN ('manager', 'agent', 'operator');
  END IF;
  -- modify_transactions default (used for recording payments)
  IF p_permission = 'modify_transactions' THEN
    RETURN v_role IN ('manager');
  END IF;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission TO authenticated;

-- ──────────────────────────────────────────────
-- 0b. Helper: caller_role_check — reusable
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_caller_allowed(
  p_user_id UUID,
  p_allowed_roles TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User has no role assigned';
  END IF;
  IF NOT (v_role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION 'Permission denied: role % is not allowed to perform this action', v_role;
  END IF;
  RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_caller_allowed TO authenticated;

-- ──────────────────────────────────────────────
-- 1. Harden record_sale with role + price checks
-- ──────────────────────────────────────────────
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
  p_expected_outstanding  NUMERIC DEFAULT NULL,
  p_fulfilled_order_id    UUID DEFAULT NULL
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
    v_warehouse_id UUID;
    v_target_user_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_staff_available_stock NUMERIC;
    v_product_available_stock NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_all_product_ids uuid[];
    v_store_customer_id UUID;
    v_has_price_override BOOLEAN;
    v_base_price NUMERIC;
    v_item_price NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ROLE CHECK: only super_admin, manager, agent, operator can record sales
    v_caller_role := public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'operator']);
    v_caller_is_admin := v_caller_role IN ('super_admin', 'manager');

    -- PRICE OVERRIDE CHECK: verify caller has price_override or prices match base
    v_has_price_override := public.user_has_permission(p_recorded_by, 'price_override');
    IF NOT v_has_price_override THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
      LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_item_price := (v_item->>'unit_price')::NUMERIC;
        SELECT base_price INTO v_base_price FROM public.products WHERE id = v_product_id;
        IF v_item_price IS DISTINCT FROM v_base_price THEN
          RAISE EXCEPTION 'Price override not permitted: product % price % differs from base price %',
            v_product_id, v_item_price, v_base_price;
        END IF;
      END LOOP;
    END IF;

    -- OPERATOR FULL-PAYMENT CHECK
    IF v_caller_role = 'operator' AND COALESCE(p_outstanding_amount, 0) > 0 THEN
        RAISE EXCEPTION 'Operator sales require full payment. Outstanding must be 0.';
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

    v_target_user_id := p_recorded_by;

    -- Enforce Operator POS store restraint
    IF v_caller_role = 'operator' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.stores
            WHERE id = p_store_id
              AND warehouse_id = v_warehouse_id
              AND store_type_id = '00000000-0000-0000-0000-000000000001'::uuid
        ) THEN
            RAISE EXCEPTION 'Operator can only record sales for the POS store of their warehouse';
        END IF;
    END IF;

    -- Check if target has staff_stock
    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id) INTO v_has_staff_stock;

    -- LOCK store row + fetch outstanding
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

    -- Credit limit check — gated by company_settings
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

    -- Lock all stock rows upfront in consistent order to prevent deadlocks
    SELECT array_agg(DISTINCT (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid)
    INTO v_all_product_ids
    FROM jsonb_array_elements(p_sale_items) AS item;

    PERFORM ss.product_id
    FROM staff_stock ss
    WHERE ss.user_id = v_target_user_id AND ss.product_id = ANY(v_all_product_ids)
    ORDER BY ss.product_id
    FOR UPDATE;

    PERFORM ps.product_id
    FROM product_stock ps
    WHERE ps.warehouse_id = v_warehouse_id AND ps.product_id = ANY(v_all_product_ids)
    ORDER BY ps.product_id
    FOR UPDATE;

    -- LOCK stock rows + pre-check + DEDUCT in one pass
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        IF v_caller_role = 'agent' THEN
            SELECT ss.quantity INTO v_staff_available_stock
            FROM public.staff_stock ss
            WHERE ss.user_id = v_target_user_id
              AND ss.product_id = v_product_id
              AND ss.warehouse_id = v_warehouse_id;

            v_staff_available_stock := COALESCE(v_staff_available_stock, 0);

            IF v_staff_available_stock >= v_quantity THEN
                UPDATE public.staff_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE user_id = v_target_user_id
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;
            ELSE
                v_insufficient_products := array_append(v_insufficient_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        ELSE
            IF v_has_staff_stock THEN
                SELECT ss.quantity INTO v_staff_available_stock
                FROM public.staff_stock ss
                WHERE ss.user_id = v_target_user_id
                  AND ss.product_id = v_product_id
                  AND ss.warehouse_id = v_warehouse_id;

                v_staff_available_stock := COALESCE(v_staff_available_stock, 0);

                IF v_staff_available_stock >= v_quantity THEN
                    UPDATE public.staff_stock
                    SET quantity = quantity - v_quantity, updated_at = now()
                    WHERE user_id = v_target_user_id
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
        END IF;
    END LOOP;

    IF array_length(v_insufficient_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_products, ', ');
    END IF;

    IF COALESCE(p_total_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Sale amount must be positive';
    END IF;

    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by,
        fulfilled_order_id
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by,
        p_fulfilled_order_id
    ) RETURNING id INTO v_sale_id;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
    SELECT v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'total_price')::NUMERIC,
        v_warehouse_id
    FROM jsonb_array_elements(p_sale_items) AS item;

    IF p_fulfilled_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'delivered',
            delivered_at = now(),
            fulfilled_by = p_recorded_by,
            fulfilled_by_sale_id = v_sale_id,
            updated_by = p_recorded_by,
            updated_at = now()
        WHERE id = p_fulfilled_order_id
          AND status != 'delivered';
    ELSE
        UPDATE public.orders o SET status = 'delivered', delivered_at = now(), fulfilled_by = p_recorded_by
        WHERE o.store_id = p_store_id AND o.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM public.order_items oi
            WHERE oi.order_id = o.id
            AND oi.quantity > COALESCE((
                SELECT SUM((item->>'quantity')::numeric)
                FROM jsonb_array_elements(p_sale_items) AS item
                WHERE (item->>'product_id')::uuid = oi.product_id
            ), 0)
        );
    END IF;

    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;


-- ──────────────────────────────────────────────
-- 2. Harden record_transaction with role check
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_transaction(
  p_display_id TEXT,
  p_store_id UUID,
  p_customer_id UUID,
  p_recorded_by UUID,
  p_logged_by UUID DEFAULT NULL,
  p_cash_amount NUMERIC DEFAULT 0,
  p_upi_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(txn_id UUID, txn_display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn_id            UUID;
  v_old_outstanding   NUMERIC;
  v_total_amount      NUMERIC;
  v_new_outstanding   NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ROLE CHECK: super_admin, manager, agent, marketer, operator can record transactions
  PERFORM public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'marketer', 'operator']);

  v_total_amount := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT s.outstanding
  INTO   v_old_outstanding
  FROM   public.stores s
  WHERE  s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  v_new_outstanding := GREATEST(v_old_outstanding - v_total_amount, 0);

  INSERT INTO public.transactions (
    display_id, store_id, customer_id, recorded_by, logged_by,
    cash_amount, upi_amount, total_amount,
    old_outstanding, new_outstanding, notes, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), v_total_amount,
    v_old_outstanding, v_new_outstanding, p_notes,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_txn_id;

  UPDATE public.stores SET outstanding = v_new_outstanding WHERE id = p_store_id;

  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_txn_id, p_display_id, v_new_outstanding;
END;
$$;


-- ──────────────────────────────────────────────
-- 3. Harden record_sale_return with role check
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id           UUID,
    p_returned_by       UUID,
    p_reason            TEXT,
    p_items             JSONB,
    p_created_at        TIMESTAMPTZ DEFAULT NULL
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
    v_sale_items_count INT;
    v_return_items_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ROLE CHECK: only super_admin, manager, agent, operator can return sales
    PERFORM public.assert_caller_allowed(p_returned_by, ARRAY['super_admin', 'manager', 'agent', 'operator']);

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

    -- Enforce full returns only
    SELECT COUNT(*) INTO v_sale_items_count FROM public.sale_items WHERE sale_id = p_sale_id;
    SELECT jsonb_array_length(p_items) INTO v_return_items_count;

    IF v_sale_items_count != v_return_items_count THEN
        RAISE EXCEPTION 'Partial returns are not allowed. You must return all items in the sale.';
    END IF;

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

    SELECT COALESCE(p_sale_id::TEXT, 'SR-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT) || '-RETURN'
    INTO v_display_id;

    INSERT INTO public.sale_returns (sale_id, store_id, customer_id, created_by, reason, display_id, return_date, total_amount, status, created_at)
    VALUES (p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id, COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()))
    RETURNING id INTO v_return_id;

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

        SELECT quantity, unit_price INTO v_original_qty, v_unit_price
        FROM public.sale_items WHERE id = v_sale_item_id AND sale_id = p_sale_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found on this sale', v_sale_item_id;
        END IF;

        IF v_return_qty != v_original_qty THEN
            RAISE EXCEPTION 'Partial item returns are not allowed. You must return all quantities for each product.';
        END IF;

        INSERT INTO public.sale_return_tracked_items (
            return_id, sale_item_id, product_id,
            returned_qty, damaged_qty, unit_price, subtotal
        ) VALUES (
            v_return_id, v_sale_item_id, v_product_id,
            v_return_qty, v_damaged_qty, v_unit_price,
            v_return_qty * v_unit_price
        );

        v_subtotal := v_return_qty * v_unit_price;
        v_total_return_amount := v_total_return_amount + v_subtotal;

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

    v_new_outstanding := GREATEST(v_old_outstanding - v_total_return_amount, 0);

    UPDATE public.sales
    SET outstanding_amount = v_new_outstanding,
        updated_at = now()
    WHERE id = p_sale_id;

    UPDATE public.sale_returns
    SET outstanding_adjustment = v_total_return_amount,
        total_amount = v_total_return_amount,
        status = 'completed',
        processed_at = COALESCE(p_created_at, now()),
        processed_by = auth.uid()
    WHERE id = v_return_id;

    PERFORM public.recalc_running_balances(v_sale.store_id);

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;


-- ──────────────────────────────────────────────
-- 4. Create record_purchase RPC (dynamic status)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_purchase(
  p_vendor_id UUID,
  p_warehouse_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_bill_amount NUMERIC DEFAULT 0,
  p_bill_number TEXT DEFAULT NULL,
  p_invoice_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_bill_url TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'pending'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id UUID;
  v_display_id TEXT;
  v_wh_id UUID;
  v_item JSONB;
  v_seq_val BIGINT;
  v_seq_name TEXT;
BEGIN
  -- ROLE CHECK
  PERFORM public.assert_caller_allowed(COALESCE(p_user_id, auth.uid()), ARRAY['super_admin', 'manager', 'operator']);

  -- Validate status
  IF p_status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'Invalid purchase status: %. Must be pending or completed.', p_status;
  END IF;

  -- Only super_admin/manager can set completed directly
  IF p_status = 'completed' THEN
    PERFORM public.assert_caller_allowed(COALESCE(p_user_id, auth.uid()), ARRAY['super_admin', 'manager']);
  END IF;

  -- Resolve warehouse
  v_wh_id := COALESCE(p_warehouse_id, (SELECT id FROM warehouses LIMIT 1));

  -- Generate display ID
  BEGIN
    v_seq_name := 'purchases_display_id_seq';
    EXECUTE 'SELECT COALESCE(last_value, 0) + 1 FROM ' || v_seq_name INTO v_seq_val;
    v_display_id := 'PUR-' || LPAD(v_seq_val::TEXT, 6, '0');
  EXCEPTION WHEN OTHERS THEN
    v_display_id := 'PUR-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text;
  END;

  -- Insert purchase
  INSERT INTO purchases (
    display_id, vendor_id, warehouse_id, purchase_date,
    bill_number, bill_amount, total_amount, status, notes, bill_url, created_by
  ) VALUES (
    v_display_id, p_vendor_id, v_wh_id, COALESCE(p_invoice_date, CURRENT_DATE),
    p_bill_number, COALESCE(p_bill_amount, 0), COALESCE(p_bill_amount, 0), p_status,
    p_notes, p_bill_url, COALESCE(p_user_id, auth.uid())
  ) RETURNING id INTO v_purchase_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO purchase_items (
      purchase_id, raw_material_id, quantity, unit_cost, total_cost
    ) VALUES (
      v_purchase_id,
      (v_item->>'raw_material_id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::NUMERIC
    );
  END LOOP;

  RETURN v_display_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_purchase TO authenticated;


-- ──────────────────────────────────────────────
-- 5. Create approve_purchase RPC
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_purchase(
  p_purchase_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_display_id TEXT;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := COALESCE(p_user_id, auth.uid());

  -- Only super_admin/manager can approve
  PERFORM public.assert_caller_allowed(v_current_user_id, ARRAY['super_admin', 'manager']);

  SELECT status, display_id INTO v_status, v_display_id
  FROM public.purchases WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Purchase is already completed';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Cannot approve purchase with status: %', v_status;
  END IF;

  UPDATE public.purchases
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = p_purchase_id;

  -- Log activity
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_current_user_id, 'Approved purchase', 'purchase', p_purchase_id,
    jsonb_build_object('display_id', v_display_id));

  RETURN v_display_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_purchase TO authenticated;


-- ──────────────────────────────────────────────
-- 6a. Create reject_handover RPC
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_handover(
  p_handover_id UUID,
  p_rejected_by UUID
)
RETURNS TABLE(id UUID, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_handed_to UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, handed_to INTO v_status, v_handed_to
  FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'rejected' THEN RAISE EXCEPTION 'Handover is already rejected'; END IF;
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Cannot reject a confirmed handover'; END IF;
  IF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %', v_status;
  END IF;

  -- Only the recipient or admin/manager can reject
  IF v_handed_to != p_rejected_by AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_rejected_by AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject this handover';
  END IF;

  UPDATE public.handovers
  SET status = 'rejected',
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (p_rejected_by, 'Rejected handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_handover TO authenticated;


-- ──────────────────────────────────────────────
-- 6b. Create cancel_handover RPC
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_handover(
  p_handover_id UUID,
  p_cancelled_by UUID
)
RETURNS TABLE(id UUID, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_user_id UUID;
  v_handed_to UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, user_id, handed_to INTO v_status, v_user_id, v_handed_to
  FROM public.handovers WHERE id = p_handover_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Handover is already cancelled'; END IF;
  IF v_status = 'confirmed' THEN
    -- Cancelling a confirmed handover requires admin/manager AND reverses balances
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = p_cancelled_by AND role IN ('super_admin', 'manager')
    ) THEN
      RAISE EXCEPTION 'Only admins can cancel a confirmed handover';
    END IF;

    -- Reverse income_entries for this handover
    DELETE FROM public.income_entries
    WHERE source_type = 'handover' AND source_id = p_handover_id::TEXT;

    -- Reverse staff_cash_accounts: decrease receiver, increase sender
    UPDATE public.staff_cash_accounts
    SET cash_amount = GREATEST(COALESCE(cash_amount, 0) - COALESCE(h.cash_amount, 0), 0),
        upi_amount = GREATEST(COALESCE(upi_amount, 0) - COALESCE(h.upi_amount, 0), 0),
        updated_at = NOW()
    FROM public.handovers h
    WHERE h.id = p_handover_id AND staff_cash_accounts.user_id = h.confirmed_by;

    UPDATE public.staff_cash_accounts
    SET cash_amount = COALESCE(cash_amount, 0) + COALESCE(h.cash_amount, 0),
        upi_amount = COALESCE(upi_amount, 0) + COALESCE(h.upi_amount, 0),
        updated_at = NOW()
    FROM public.handovers h
    WHERE h.id = p_handover_id AND staff_cash_accounts.user_id = h.user_id;

  ELSIF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %', v_status;
  END IF;

  -- Sender, recipient, or admin can cancel (for pending)
  IF v_status = 'awaiting_confirmation' THEN
    IF v_user_id != p_cancelled_by AND v_handed_to != p_cancelled_by AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = p_cancelled_by AND role IN ('super_admin', 'manager')
    ) THEN
      RAISE EXCEPTION 'Not authorized to cancel this handover';
    END IF;
  END IF;

  UPDATE public.handovers
  SET status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (p_cancelled_by, 'Cancelled handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_handover TO authenticated;


-- ──────────────────────────────────────────────
-- 7. Fix create_handover_with_type: add holding balance check
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_handover_with_type(
  p_user_id uuid,
  p_handed_to uuid,
  p_cash_amount numeric DEFAULT 0,
  p_upi_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text,
  p_handover_type text DEFAULT 'transfer'::text
)
RETURNS TABLE(id uuid, user_id uuid, handed_to uuid, cash_amount numeric, upi_amount numeric, status text, handover_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_handover_id UUID;
    v_display_id TEXT;
    v_holding RECORD;
    v_total_handover NUMERIC;
    v_net_holding NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validation
    IF p_user_id IS NULL OR p_handed_to IS NULL THEN
        RAISE EXCEPTION 'Both sender and recipient are required';
    END IF;

    IF p_user_id = p_handed_to THEN
        RAISE EXCEPTION 'Cannot hand over to yourself';
    END IF;

    v_total_handover := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

    IF v_total_handover <= 0 THEN
        RAISE EXCEPTION 'Handover amount must be greater than zero';
    END IF;

    -- HOLDING BALANCE CHECK: Validate sender has enough holding
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);

    v_net_holding := COALESCE(v_holding.net_holding, 0);

    -- Subtract pending handovers from available holding
    SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
    INTO v_total_handover
    FROM public.handovers
    WHERE user_id = p_user_id
      AND status = 'awaiting_confirmation';

    v_net_holding := v_net_holding - v_total_handover;

    IF v_net_holding < COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0) THEN
        RAISE EXCEPTION 'Insufficient holding balance. Available: %, Requested: %',
            GREATEST(v_net_holding, 0),
            COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);
    END IF;

    -- Check for duplicate pending handover
    IF EXISTS (
        SELECT 1 FROM public.handovers h
        WHERE h.user_id = p_user_id
        AND h.handed_to = p_handed_to
        AND h.handover_date = CURRENT_DATE
        AND h.status = 'awaiting_confirmation'
    ) THEN
        RAISE EXCEPTION 'DUPLICATE: You already have a pending handover to this recipient today';
    END IF;

    -- Generate display ID
    BEGIN
        SELECT public.generate_display_id('handovers', 'HND') INTO v_display_id;
    EXCEPTION WHEN OTHERS THEN
        v_display_id := 'HND-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text;
    END;

    -- Create handover
    INSERT INTO public.handovers (
        user_id, handed_to, handover_date,
        cash_amount, upi_amount, status, handover_type, notes,
        created_at, updated_at
    ) VALUES (
        p_user_id, p_handed_to, CURRENT_DATE,
        COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0),
        'awaiting_confirmation', p_handover_type, p_notes,
        NOW(), NOW()
    )
    RETURNING public.handovers.id INTO v_handover_id;

    -- Log activity
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
        p_user_id,
        'Created handover request',
        'handover',
        v_handover_id,
        jsonb_build_object(
            'display_id', v_display_id,
            'cash_amount', p_cash_amount,
            'upi_amount', p_upi_amount,
            'total', COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0),
            'handed_to', p_handed_to,
            'handover_type', p_handover_type
        )
    );

    RETURN QUERY SELECT h.id, h.user_id, h.handed_to, h.cash_amount, h.upi_amount, h.status, h.handover_type
    FROM public.handovers h WHERE h.id = v_handover_id;
END;
$$;


-- ──────────────────────────────────────────────
-- 8. Add bill_url column to purchases (if missing)
-- ──────────────────────────────────────────────
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS bill_url TEXT,
  ADD COLUMN IF NOT EXISTS bill_amount NUMERIC DEFAULT 0;

-- Create sequence for purchase display IDs (if missing)
CREATE SEQUENCE IF NOT EXISTS purchases_display_id_seq;


-- ──────────────────────────────────────────────
-- 9. RLS policies on unprotected tables
-- ──────────────────────────────────────────────

-- staff_stock: agents see own, admins see all
ALTER TABLE public.staff_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents view own staff stock" ON public.staff_stock;
CREATE POLICY "Agents view own staff stock" ON public.staff_stock
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "Admins manage staff stock" ON public.staff_stock;
CREATE POLICY "Admins manage staff stock" ON public.staff_stock
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

-- staff_cash_accounts: staff see own, admins see all
ALTER TABLE public.staff_cash_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own staff cash accounts" ON public.staff_cash_accounts;
CREATE POLICY "View own staff cash accounts" ON public.staff_cash_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "Admins manage staff cash accounts" ON public.staff_cash_accounts;
CREATE POLICY "Admins manage staff cash accounts" ON public.staff_cash_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

-- sale_returns: staff can view/insert their own or all for admins
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View sale returns" ON public.sale_returns;
CREATE POLICY "View sale returns" ON public.sale_returns
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager', 'agent', 'operator'))
  );

-- sale_return_tracked_items
ALTER TABLE public.sale_return_tracked_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View sale return tracked items" ON public.sale_return_tracked_items;
CREATE POLICY "View sale return tracked items" ON public.sale_return_tracked_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sale_returns WHERE id = return_id AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager', 'agent', 'operator'))
    ))
  );

-- agent_routes
ALTER TABLE public.agent_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents view own routes" ON public.agent_routes;
CREATE POLICY "Agents view own routes" ON public.agent_routes
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "Admins manage agent routes" ON public.agent_routes;
CREATE POLICY "Admins manage agent routes" ON public.agent_routes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

-- agent_store_types
ALTER TABLE public.agent_store_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents view own store types" ON public.agent_store_types;
CREATE POLICY "Agents view own store types" ON public.agent_store_types
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "Admins manage agent store types" ON public.agent_store_types;
CREATE POLICY "Admins manage agent store types" ON public.agent_store_types
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

-- wastage_entries
ALTER TABLE public.wastage_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View wastage entries" ON public.wastage_entries;
CREATE POLICY "View wastage entries" ON public.wastage_entries
  FOR SELECT TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "Insert wastage entries" ON public.wastage_entries;
CREATE POLICY "Insert wastage entries" ON public.wastage_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'manager'))
  );
