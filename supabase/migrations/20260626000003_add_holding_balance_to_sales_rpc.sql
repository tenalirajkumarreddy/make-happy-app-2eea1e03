-- Migration: Update record_sale() to update profiles.holding_balance immediately
-- Date: 2026-06-26
--
-- ISSUE: When a sale is created, the profiles.holding_balance cache was not updated.
--        While the triggers added in 20260626000001 now handle this, the RPC itself
--        should be self-consistent and update the cache immediately in the same
--        transaction, ensuring strong consistency.
--
-- This migration patches record_sale() to update profiles.holding_balance
-- immediately after the sale is inserted.
-- =========================================================

-- Note: We patch the latest version of record_sale from 20260611000002_fix_rpc_auth_uses_authdotuid.sql
-- Copy the full function here, adding a single UPDATE at the end.

DROP FUNCTION IF EXISTS public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ, NUMERIC, UUID) CASCADE;

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
    v_caller_id UUID;
    v_new_holding_balance NUMERIC;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- PROXY CHECK: caller must be acting as themselves OR be admin/manager
    IF v_caller_id IS DISTINCT FROM p_recorded_by THEN
        PERFORM public.assert_caller_allowed(v_caller_id, ARRAY['super_admin', 'manager']);
    END IF;

    -- ROLE CHECK
    v_caller_role := public.assert_caller_allowed(p_recorded_by, ARRAY['super_admin', 'manager', 'agent', 'operator']);
    v_caller_is_admin := v_caller_role IN ('super_admin', 'manager');

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

    -- Lock all stock rows upfront in consistent order
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

    -- Insert the sale
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

    -- Insert sale items with warehouse_id
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
    SELECT v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        COALESCE((item->>'total_price')::NUMERIC, (item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC),
        v_warehouse_id
    FROM jsonb_array_elements(p_sale_items) AS item;

    -- Atomically fulfill specific order if provided
    IF p_fulfilled_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'delivered',
            delivered_at = now(),
            fulfilled_by = p_recorded_by,
            fulfilled_by_sale_id = v_sale_id,
            updated_at = now()
        WHERE id = p_fulfilled_order_id;
    ELSE
        -- Auto-fulfill pending orders for this store matching stock list (legacy fallback)
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

    -- Recalculate running balances if backdated
    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    -- =========================================================
    -- FIX: Update the agent's cached holding balance directly
    -- =========================================================
    -- Calculate the new correct balance for the agent and update profiles
    v_new_holding_balance := public.calculate_holding_balance(p_recorded_by);

    UPDATE public.profiles
    SET holding_balance = v_new_holding_balance,
        holding_balance_updated_at = NOW()
    WHERE user_id = p_recorded_by;

    -- Return sale details
    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale TO authenticated;
