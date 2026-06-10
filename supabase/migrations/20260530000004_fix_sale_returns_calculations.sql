-- Migration: Fix Outstanding Balance, Agent holding balance, and Ledger calculations on Sale Returns
-- Date: 2026-05-30

-- Add old_outstanding and new_outstanding to sale_returns
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS old_outstanding NUMERIC DEFAULT 0;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS new_outstanding NUMERIC DEFAULT 0;

-- 1. Redefine recalc_store_outstanding trigger function to handle returned sales correctly, ignore deleted records, and include manual balance adjustments.
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_id ELSE NEW.store_id END;

  UPDATE public.stores
  SET outstanding = (
    SELECT
      COALESCE(st.opening_balance, 0)
      + COALESCE((
          SELECT SUM(
            CASE 
              WHEN s.is_fully_returned = true THEN - (COALESCE(s.cash_amount, 0) + COALESCE(s.upi_amount, 0))
              ELSE COALESCE(s.total_amount, 0) - COALESCE(s.cash_amount, 0) - COALESCE(s.upi_amount, 0)
            END
          )
          FROM public.sales s
          WHERE s.store_id = v_store_id AND s.deleted_at IS NULL
        ), 0)
      - COALESCE((
          SELECT SUM(COALESCE(t.total_amount, 0))
          FROM public.transactions t
          WHERE t.store_id = v_store_id AND t.deleted_at IS NULL
        ), 0)
      + COALESCE((
          SELECT SUM(COALESCE(ba.adjustment_amount, 0))
          FROM public.balance_adjustments ba
          WHERE ba.store_id = v_store_id
        ), 0)
    FROM public.stores st
    WHERE st.id = v_store_id
  )
  WHERE id = v_store_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Create trigger on balance_adjustments to run recalc_store_outstanding
DROP TRIGGER IF EXISTS trg_balance_adjustments_recalc_outstanding ON public.balance_adjustments;
CREATE TRIGGER trg_balance_adjustments_recalc_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON public.balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

-- 2. Redefine recalc_running_balances to include sale_returns and balance_adjustments, and respect deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.recalc_running_balances(p_store_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_balance NUMERIC;
  v_running         NUMERIC;
  rec               RECORD;
BEGIN
  SELECT COALESCE(opening_balance, 0)
  INTO   v_opening_balance
  FROM   public.stores
  WHERE  id = p_store_id;

  v_running := v_opening_balance;

  FOR rec IN (
    SELECT 'sale' AS kind, id, created_at,
           CASE 
             WHEN is_fully_returned = true THEN - (COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0))
             ELSE COALESCE(total_amount, 0) - COALESCE(cash_amount, 0) - COALESCE(upi_amount, 0)
           END AS delta
    FROM public.sales
    WHERE store_id = p_store_id AND deleted_at IS NULL
    UNION ALL
    SELECT 'txn' AS kind, id, created_at,
           -COALESCE(total_amount, 0) AS delta
    FROM public.transactions
    WHERE store_id = p_store_id AND deleted_at IS NULL
    UNION ALL
    SELECT 'return' AS kind, id, created_at,
           -COALESCE(total_amount, 0) AS delta
    FROM public.sale_returns
    WHERE store_id = p_store_id AND status = 'completed'
    UNION ALL
    SELECT 'adj' AS kind, id, created_at,
           COALESCE(adjustment_amount, 0) AS delta
    FROM public.balance_adjustments
    WHERE store_id = p_store_id
    ORDER BY created_at
  ) LOOP
    IF rec.kind = 'sale' THEN
      UPDATE public.sales
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'txn' THEN
      UPDATE public.transactions
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'return' THEN
      UPDATE public.sale_returns
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    ELSIF rec.kind = 'adj' THEN
      UPDATE public.balance_adjustments
      SET old_outstanding = v_running,
          new_outstanding = v_running + rec.delta
      WHERE id = rec.id;
    END IF;
    v_running := v_running + rec.delta;
  END LOOP;
END;
$$;

-- 3. Redefine calculate_holding_balance to exclude returned/deleted sales and transactions
CREATE OR REPLACE FUNCTION public.calculate_holding_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales              NUMERIC;
  v_transactions       NUMERIC;
  v_received_handovers NUMERIC;
  v_sent_handovers     NUMERIC;
BEGIN
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sales 
  FROM public.sales 
  WHERE recorded_by = p_user_id 
    AND is_fully_returned = false 
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_transactions 
  FROM public.transactions 
  WHERE recorded_by = p_user_id 
    AND deleted_at IS NULL;

  -- Only CONFIRMED received handovers count as income
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_received_handovers
  FROM public.handovers
  WHERE handed_to = p_user_id AND status = 'confirmed';

  -- Only CONFIRMED sent handovers count as deductions
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sent_handovers
  FROM public.handovers
  WHERE user_id = p_user_id AND status = 'confirmed';

  RETURN (v_sales + v_transactions + v_received_handovers) - v_sent_handovers;
END;
$$;

-- 4. Redefine get_user_daily_balance and get_all_staff_balances to exclude returned/deleted sales and transactions
CREATE OR REPLACE FUNCTION public.get_user_daily_balance(p_user_id uuid)
 RETURNS TABLE(today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, today_sent_pending numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_profile_holding NUMERIC;
BEGIN
    SELECT holding_balance INTO v_profile_holding
    FROM public.profiles
    WHERE id = p_user_id;

    v_profile_holding := COALESCE(v_profile_holding, 0);

    SELECT 
        COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO today_sales
    FROM public.sales s
    WHERE s.recorded_by = p_user_id 
      AND DATE(s.created_at) = v_today
      AND s.is_fully_returned = false
      AND s.deleted_at IS NULL;

    SELECT 
        COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO today_payments
    FROM public.transactions t
    WHERE t.recorded_by = p_user_id 
      AND DATE(t.created_at) = v_today
      AND t.deleted_at IS NULL;

    SELECT 
        COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO today_received
    FROM public.handovers h
    WHERE h.handed_to = p_user_id 
      AND h.status = 'confirmed' 
      AND h.handover_date = v_today;

    SELECT 
        COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO today_sent_confirmed
    FROM public.handovers h
    WHERE h.user_id = p_user_id 
      AND h.status = 'confirmed' 
      AND h.handover_date = v_today;

    SELECT 
        COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO today_sent_pending
    FROM public.handovers h
    WHERE h.user_id = p_user_id 
      AND h.status = 'awaiting_confirmation' 
      AND h.handover_date = v_today;

    prev_pending := v_profile_holding - (COALESCE(today_sales, 0) + COALESCE(today_payments, 0) + COALESCE(today_received, 0) - COALESCE(today_sent_confirmed, 0));
    total_holding := v_profile_holding;

    RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
 RETURNS TABLE(user_id uuid, full_name text, role text, today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    r RECORD;
    v_today DATE := CURRENT_DATE;
    v_today_sales NUMERIC;
    v_today_payments NUMERIC;
    v_today_received NUMERIC;
    v_today_sent_confirmed NUMERIC;
    v_prev_pending NUMERIC;
    v_total_holding NUMERIC;
BEGIN
    FOR r IN
        SELECT p.id, p.full_name, pr.role, COALESCE(p.holding_balance, 0) as holding
        FROM public.profiles p
        JOIN public.user_roles pr ON p.id = pr.user_id
        WHERE pr.role IN ('agent', 'pos', 'marketer', 'manager', 'operator', 'super_admin')
    LOOP
        v_total_holding := r.holding;

        SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO v_today_sales
        FROM public.sales s
        WHERE s.recorded_by = r.id 
          AND DATE(s.created_at) = v_today
          AND s.is_fully_returned = false
          AND s.deleted_at IS NULL;

        SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO v_today_payments
        FROM public.transactions t
        WHERE t.recorded_by = r.id 
          AND DATE(t.created_at) = v_today
          AND t.deleted_at IS NULL;

        SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO v_today_received
        FROM public.handovers h
        WHERE h.handed_to = r.id AND h.status = 'confirmed' AND h.handover_date = v_today;

        SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0) INTO v_today_sent_confirmed
        FROM public.handovers h
        WHERE h.user_id = r.id AND h.status = 'confirmed' AND h.handover_date = v_today;

        v_prev_pending := v_total_holding - (v_today_sales + v_today_payments + v_today_received - v_today_sent_confirmed);

        user_id := r.id;
        full_name := r.full_name;
        role := r.role;
        today_sales := v_today_sales;
        today_payments := v_today_payments;
        today_received := v_today_received;
        today_sent_confirmed := v_today_sent_confirmed;
        prev_pending := v_prev_pending;
        total_holding := v_total_holding;
        RETURN NEXT;
    END LOOP;
END;
$function$;

-- 5. Redefine edit_sale to mark the original sale as soft-deleted by setting deleted_at = now()
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

    -- Enforce Next-Day Edit Lockout in local timezone (Asia/Kolkata)
    IF (v_orig.created_at AT TIME ZONE 'Asia/Kolkata')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
       AND (v_orig.updated_at AT TIME ZONE 'Asia/Kolkata')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN
        RAISE EXCEPTION 'Sale edits are only allowed on the same day the sale was recorded';
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

    -- Mark original sale as voided and soft-deleted (deleted_at = now())
    UPDATE public.sales
    SET outstanding_amount = 0,
        is_fully_returned = false,
        deleted_at = now(),
        updated_at = now()
    WHERE id = p_original_sale_id;

    -- ── RECORD NEW SALE ────────────────────────────────────────────────────
    -- Lock store row for new outstanding
    SELECT s.outstanding, s.store_type_id, s.customer_id
    INTO   v_old_outstanding, v_store_type_id, v_store_customer_id
    FROM   public.stores s WHERE s.id = p_store_id FOR UPDATE;

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
        INTO   v_kyc_status, v_credit_limit_override
        FROM   public.customers c WHERE c.id = p_customer_id;

        IF v_credit_limit_override IS NOT NULL THEN
            v_credit_limit := v_credit_limit_override;
        ELSE
            SELECT CASE WHEN v_kyc_status IN ('verified', 'approved')
                THEN COALESCE(credit_limit_kyc, 0)
                ELSE COALESCE(credit_limit_no_kyc, 0)
            END INTO   v_credit_limit
            FROM   public.store_types WHERE id = v_store_type_id;
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

        IF v_caller_role = 'agent' THEN
            -- Strictly check and deduct from staff stock (no fallback to warehouse)
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
                v_insufficient_products := array_append(v_insufficient_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        ELSE
            -- Other roles: fallback check
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
        END IF;
    END LOOP;

    IF array_length(v_insufficient_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_products, ', ');
    END IF;

    IF COALESCE(p_total_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Sale amount must be positive';
    END IF;

    -- Insert new sale (maintaining original link if existing)
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
        v_orig.fulfilled_order_id
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

-- 6. Redefine record_sale_return to mark the returned sale's is_fully_returned = true
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

    -- Enforce Next-Day Return Lockout in local timezone (Asia/Kolkata)
    IF (v_sale.created_at AT TIME ZONE 'Asia/Kolkata')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
       AND (v_sale.updated_at AT TIME ZONE 'Asia/Kolkata')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN
        RAISE EXCEPTION 'Sale returns are only allowed on the same day the sale was recorded';
    END IF;

    -- Enforce full returns only
    SELECT COUNT(*) INTO v_sale_items_count FROM public.sale_items WHERE sale_id = p_sale_id;
    SELECT jsonb_array_length(p_items) INTO v_return_items_count;

    IF v_sale_items_count != v_return_items_count THEN
        RAISE EXCEPTION 'Partial returns are not allowed. You must return all items in the sale.';
    END IF;

    -- Check duplicate returns
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

    -- Update sale outstanding AND set is_fully_returned = true
    UPDATE public.sales
    SET outstanding_amount = v_new_outstanding,
        is_fully_returned = true,
        updated_at = now()
    WHERE id = p_sale_id;

    -- Update sale_returns
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
