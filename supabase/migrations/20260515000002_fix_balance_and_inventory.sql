-- Fix get_all_staff_balances: use created_at instead of handover_date
CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
 RETURNS TABLE(user_id uuid, full_name text, role text, holding_balance numeric, today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        SELECT p.user_id, p.full_name, pr.role, COALESCE(p.holding_balance, 0) as holding
        FROM public.profiles p
        JOIN public.user_roles pr ON p.user_id = pr.user_id
        WHERE pr.role IN ('agent', 'pos', 'marketer', 'manager', 'operator', 'super_admin')
        AND p.deleted_at IS NULL
    LOOP
        v_total_holding := r.holding;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_sales
        FROM public.sales s
        WHERE s.recorded_by = r.user_id AND DATE(s.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_payments
        FROM public.transactions t
        WHERE t.recorded_by = r.user_id AND DATE(t.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_received
        FROM public.handovers h
        WHERE h.handed_to = r.user_id AND h.status = 'confirmed' AND DATE(h.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_sent_confirmed
        FROM public.handovers h
        WHERE h.user_id = r.user_id AND h.status = 'confirmed' AND DATE(h.created_at) = v_today;

        v_prev_pending := v_total_holding - (v_today_sales + v_today_payments + v_today_received - v_today_sent_confirmed);

        user_id := r.user_id;
        full_name := r.full_name;
        role := r.role;
        holding_balance := v_total_holding;
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

-- Fix handle_sale_inventory: deterministic warehouse resolution
CREATE OR REPLACE FUNCTION public.handle_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_warehouse_id UUID;
    v_user_role TEXT;
    v_sale_recorded_by UUID;
    v_is_admin_or_manager BOOLEAN;
    v_rows_affected INTEGER;
    v_pending_outgoing NUMERIC;
    v_warehouse_pending NUMERIC;
    v_staff_pending NUMERIC;
    v_physical_qty NUMERIC;
    v_product_name TEXT;
BEGIN
    SELECT s.recorded_by INTO v_sale_recorded_by
    FROM public.sales s WHERE s.id = NEW.sale_id;

    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_sale_recorded_by
    LIMIT 1;

    v_is_admin_or_manager := v_user_role IN ('super_admin', 'manager');

    -- Deterministic warehouse resolution: no CROSS JOIN
    SELECT COALESCE(
      (SELECT warehouse_id FROM public.user_roles WHERE user_id = v_sale_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
      (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;

    IF v_is_admin_or_manager THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_warehouse_pending
        FROM public.stock_transfers
        WHERE status IN ('pending', 'awaiting_acceptance')
          AND from_warehouse_id = v_warehouse_id
          AND product_id = NEW.product_id;

        UPDATE public.product_stock
        SET quantity = quantity - NEW.quantity,
            updated_at = now()
        WHERE warehouse_id = v_warehouse_id
          AND product_id = NEW.product_id
          AND (quantity - v_warehouse_pending) >= NEW.quantity;

        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        IF v_rows_affected = 0 THEN
            SELECT quantity INTO v_physical_qty FROM public.product_stock
            WHERE warehouse_id = v_warehouse_id AND product_id = NEW.product_id;

            RAISE EXCEPTION 'insufficient_stock: % (Truly Available: %, Physical: %, Pending Outgoing: %)',
                v_product_name,
                COALESCE(v_physical_qty, 0) - v_warehouse_pending,
                COALESCE(v_physical_qty, 0),
                v_warehouse_pending;
        END IF;

        INSERT INTO public.stock_movements (
            product_id, warehouse_id, quantity, type,
            reference_id, reason, created_by, created_at
        ) VALUES (
            NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
            NEW.sale_id::text, 'Admin/Manager sale - warehouse stock', v_sale_recorded_by, now()
        );
    ELSE
        SELECT COALESCE(SUM(quantity), 0) INTO v_staff_pending
        FROM public.stock_transfers
        WHERE status IN ('pending', 'awaiting_acceptance')
          AND from_user_id = v_sale_recorded_by
          AND product_id = NEW.product_id
          AND from_warehouse_id = v_warehouse_id;

        UPDATE public.staff_stock
        SET quantity = quantity - NEW.quantity,
            updated_at = now(),
            last_sale_at = now(),
            is_negative = (quantity - NEW.quantity) < 0
        WHERE user_id = v_sale_recorded_by
          AND product_id = NEW.product_id
          AND warehouse_id = v_warehouse_id
          AND (quantity - v_staff_pending) >= NEW.quantity;

        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        IF v_rows_affected > 0 THEN
            INSERT INTO public.stock_movements (
                product_id, warehouse_id, quantity, type,
                reference_id, reason, created_by, created_at
            ) VALUES (
                NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
                NEW.sale_id::text, 'Staff sale - staff stock', v_sale_recorded_by, now()
            );
        ELSE
            SELECT COALESCE(SUM(quantity), 0) INTO v_warehouse_pending
            FROM public.stock_transfers
            WHERE status IN ('pending', 'awaiting_acceptance')
              AND from_warehouse_id = v_warehouse_id
              AND product_id = NEW.product_id;

            UPDATE public.product_stock
            SET quantity = quantity - NEW.quantity,
                updated_at = now()
            WHERE warehouse_id = v_warehouse_id
              AND product_id = NEW.product_id
              AND (quantity - v_warehouse_pending) >= NEW.quantity;

            GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
            IF v_rows_affected = 0 THEN
                SELECT quantity INTO v_physical_qty FROM public.product_stock
                WHERE warehouse_id = v_warehouse_id AND product_id = NEW.product_id;

                RAISE EXCEPTION 'insufficient_stock: % (Staff/Warehouse fallback failed. Truly Available: %, Physical: %, Pending Outgoing: %)',
                    v_product_name,
                    COALESCE(v_physical_qty, 0) - v_warehouse_pending,
                    COALESCE(v_physical_qty, 0),
                    v_warehouse_pending;
            END IF;

            INSERT INTO public.stock_movements (
                product_id, warehouse_id, quantity, type,
                reference_id, reason, created_by, created_at
            ) VALUES (
                NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
                NEW.sale_id::text, 'Staff sale - warehouse fallback', v_sale_recorded_by, now()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
