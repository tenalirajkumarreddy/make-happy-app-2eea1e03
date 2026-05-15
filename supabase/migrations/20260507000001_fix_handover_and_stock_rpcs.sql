-- Fix get_all_staff_balances parameter clash
CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
 RETURNS TABLE(user_id uuid, today_sales numeric, today_payments numeric, today_sent numeric, prev_pending numeric, total numeric, sales numeric, received numeric, sent_confirmed numeric, sent_pending numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH staff_users AS (
    SELECT ur.user_id
    FROM user_roles ur
    WHERE ur.role IN ('manager', 'agent', 'marketer', 'operator')
  ),
  balances AS (
    SELECT
      su.user_id,
      -COALESCE(p.holding_balance, 0) AS total_holding
    FROM staff_users su
    JOIN profiles p ON p.user_id = su.user_id
  ),
  today_sales_agg AS (
    SELECT
      s.recorded_by AS uid,
      COALESCE(SUM(COALESCE(s.cash_amount, 0) + COALESCE(s.upi_amount, 0)), 0) AS amt
    FROM sales s
    WHERE DATE(s.created_at) = v_today
    GROUP BY s.recorded_by
  ),
  today_payments_agg AS (
    SELECT
      t.recorded_by AS uid,
      COALESCE(SUM(COALESCE(t.cash_amount, 0) + COALESCE(t.upi_amount, 0)), 0) AS amt
    FROM transactions t
    WHERE DATE(t.created_at) = v_today
    GROUP BY t.recorded_by
  ),
  today_sent_agg AS (
    SELECT
      h.user_id AS uid,
      COALESCE(SUM(COALESCE(h.cash_amount, 0) + COALESCE(h.upi_amount, 0)), 0) AS amt
    FROM handovers h
    WHERE h.handover_date = v_today
      AND h.status IN ('confirmed', 'awaiting_confirmation')
    GROUP BY h.user_id
  ),
  received_agg AS (
    SELECT
      h.handed_to AS uid,
      COALESCE(SUM(COALESCE(h.cash_amount, 0) + COALESCE(h.upi_amount, 0)), 0) AS amt
    FROM handovers h
    WHERE h.status IN ('confirmed', 'accepted')
    GROUP BY h.handed_to
  ),
  sent_confirmed_agg AS (
    SELECT
      h.user_id AS uid,
      COALESCE(SUM(COALESCE(h.cash_amount, 0) + COALESCE(h.upi_amount, 0)), 0) AS amt
    FROM handovers h
    WHERE h.status IN ('confirmed', 'accepted')
    GROUP BY h.user_id
  ),
  sent_pending_agg AS (
    SELECT
      h.user_id AS uid,
      COALESCE(SUM(COALESCE(h.cash_amount, 0) + COALESCE(h.upi_amount, 0)), 0) AS amt
    FROM handovers h
    WHERE h.status IN ('pending', 'submitted', 'awaiting_confirmation')
    GROUP BY h.user_id
  )
  SELECT
    b.user_id,
    COALESCE(ts.amt, 0)  AS today_sales,
    COALESCE(tp.amt, 0)  AS today_payments,
    COALESCE(tse.amt, 0) AS today_sent,
    GREATEST(0,
      b.total_holding
      - (COALESCE(ts.amt, 0) + COALESCE(tp.amt, 0))
      + COALESCE(tse.amt, 0)
    ) AS prev_pending,
    b.total_holding AS total,
    COALESCE(ts.amt, 0) AS sales,
    COALESCE(ra.amt, 0) AS received,
    COALESCE(sca.amt, 0) AS sent_confirmed,
    COALESCE(spa.amt, 0) AS sent_pending
  FROM balances b
  LEFT JOIN today_sales_agg ts ON ts.uid = b.user_id
  LEFT JOIN today_payments_agg tp ON tp.uid = b.user_id
  LEFT JOIN today_sent_agg tse ON tse.uid = b.user_id
  LEFT JOIN received_agg ra ON ra.uid = b.user_id
  LEFT JOIN sent_confirmed_agg sca ON sca.uid = b.user_id
  LEFT JOIN sent_pending_agg spa ON spa.uid = b.user_id
  WHERE b.total_holding != 0
     OR COALESCE(ts.amt, 0) != 0
     OR COALESCE(tp.amt, 0) != 0
     OR COALESCE(tse.amt, 0) != 0
     OR COALESCE(spa.amt, 0) != 0;
END;
$function$;

-- Fix get_agent_cash_holding parameter clash
CREATE OR REPLACE FUNCTION public.get_agent_cash_holding(p_user_id uuid)
 RETURNS TABLE(sales_cash numeric, sales_upi numeric, transactions_cash numeric, transactions_upi numeric, total_collected numeric, confirmed_handovers_cash numeric, confirmed_handovers_upi numeric, total_handed_over numeric, net_holding numeric, materialized_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_materialized NUMERIC;
BEGIN
  -- Get materialized balance
  SELECT COALESCE(holding_balance, 0) INTO v_materialized
  FROM public.profiles
  WHERE user_id = p_user_id;

  RETURN QUERY
  WITH sales_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.sales
    WHERE recorded_by = p_user_id
  ),
  transaction_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.transactions
    WHERE recorded_by = p_user_id
  ),
  handover_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.handovers
    WHERE user_id = p_user_id
    AND status = 'confirmed'
  )
  SELECT
    s.cash as sales_cash,
    s.upi as sales_upi,
    t.cash as transactions_cash,
    t.upi as transactions_upi,
    (s.cash + s.upi + t.cash + t.upi) as total_collected,
    h.cash as confirmed_handovers_cash,
    h.upi as confirmed_handovers_upi,
    (h.cash + h.upi) as total_handed_over,
    COALESCE(v_materialized, 0) as net_holding,
    v_materialized as materialized_balance
  FROM sales_totals s, transaction_totals t, handover_totals h;
END;
$function$;

-- Fix create_handover_with_type parameter clash
CREATE OR REPLACE FUNCTION public.create_handover_with_type(p_user_id uuid, p_handed_to uuid, p_cash_amount numeric DEFAULT 0, p_upi_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_handover_type text DEFAULT 'transfer'::text)
 RETURNS TABLE(id uuid, user_id uuid, handed_to uuid, cash_amount numeric, upi_amount numeric, status text, handover_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
#variable_conflict use_column
DECLARE
    v_handover_id UUID;
    v_display_id TEXT;
    v_holding RECORD;
    v_total_handover NUMERIC;
BEGIN
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

    -- Validate against holding
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);
    
    IF v_holding IS NULL THEN
        v_holding.net_holding := 0;
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
        "user_id", "handed_to", "handover_date",
        "cash_amount", "upi_amount", "status", "handover_type", "notes",
        "created_at", "updated_at"
    ) VALUES (
        p_user_id, p_handed_to, CURRENT_DATE,
        COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), 
        'awaiting_confirmation', p_handover_type, p_notes,
        NOW(), NOW()
    )
    RETURNING public.handovers.id INTO v_handover_id;

    -- Log activity
    INSERT INTO public.activity_logs ("user_id", "action", "entity_type", "entity_id", "metadata")
    VALUES (
        p_user_id, 
        'Created handover request',
        'handover',
        v_handover_id,
        jsonb_build_object(
            'display_id', v_display_id,
            'cash_amount', p_cash_amount,
            'upi_amount', p_upi_amount,
            'total', v_total_handover,
            'handed_to', p_handed_to,
            'handover_type', p_handover_type
        )
    );

    RETURN QUERY SELECT h.id, h.user_id, h.handed_to, h.cash_amount, h.upi_amount, h.status, h.handover_type 
    FROM public.handovers h WHERE h.id = v_handover_id;
END;
$function$;

-- Fix stock transfer 409 conflict
CREATE OR REPLACE FUNCTION public.record_stock_transfer(p_transfer_type text, p_from_warehouse_id uuid DEFAULT NULL::uuid, p_from_user_id uuid DEFAULT NULL::uuid, p_to_warehouse_id uuid DEFAULT NULL::uuid, p_to_user_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_quantity numeric DEFAULT 1, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id           uuid;
    v_caller_role         text;
    v_caller_warehouse_id uuid;
    v_transfer_id         uuid;
    v_display_id          text;
    v_status              text;
    v_source_warehouse_id uuid;
    v_dest_warehouse_id   uuid;
    v_from_user_wh        uuid;
    v_to_user_wh          uuid;
BEGIN
    -- ── Basic validation ───────────────────────────────────────────────────────
    IF p_transfer_type IS NULL OR p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Missing required parameters: transfer_type, product_id, and quantity are required';
    END IF;

    -- ── Identity & role ────────────────────────────────────────────────────────
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated. Please log in again.';
    END IF;

    SELECT ur.role, ur.warehouse_id
    INTO v_caller_role, v_caller_warehouse_id
    FROM user_roles ur
    WHERE ur.user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'User has no assigned role. Contact admin.';
    END IF;

    -- ── Role-based permission gates ────────────────────────────────────────────
    IF v_caller_role = 'operator' THEN
        IF p_transfer_type NOT IN ('warehouse_to_staff', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Operators cannot perform % transfers. Allowed: warehouse_to_staff, staff_to_staff.', p_transfer_type;
        END IF;

        IF p_transfer_type = 'warehouse_to_staff' THEN
            IF p_from_warehouse_id IS NULL OR p_from_warehouse_id != v_caller_warehouse_id THEN
                RAISE EXCEPTION 'Operators can only dispatch stock from their own warehouse.';
            END IF;
        END IF;

        IF p_transfer_type = 'staff_to_staff' THEN
            SELECT warehouse_id INTO v_from_user_wh
            FROM staff_stock WHERE user_id = p_from_user_id AND product_id = p_product_id LIMIT 1;
            SELECT warehouse_id INTO v_to_user_wh
            FROM staff_stock WHERE user_id = p_to_user_id AND product_id = p_product_id LIMIT 1;

            IF v_from_user_wh IS NULL THEN
                SELECT warehouse_id INTO v_from_user_wh FROM user_roles WHERE user_id = p_from_user_id;
            END IF;
            IF v_to_user_wh IS NULL THEN
                SELECT warehouse_id INTO v_to_user_wh FROM user_roles WHERE user_id = p_to_user_id;
            END IF;

            IF v_from_user_wh IS DISTINCT FROM v_caller_warehouse_id OR v_to_user_wh IS DISTINCT FROM v_caller_warehouse_id THEN
                RAISE EXCEPTION 'Operators can only transfer between staff members within their own warehouse.';
            END IF;
        END IF;
    END IF;

    IF v_caller_role IN ('agent', 'marketer') THEN
        IF p_transfer_type NOT IN ('staff_to_warehouse', 'staff_to_staff') THEN
            RAISE EXCEPTION 'Agents cannot perform % transfers. Allowed: staff_to_warehouse, staff_to_staff.', p_transfer_type;
        END IF;
        IF p_from_user_id IS NULL OR p_from_user_id != v_caller_id THEN
            RAISE EXCEPTION 'Agents can only transfer from their own stock.';
        END IF;
    END IF;

    -- ── Product existence check ────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    -- ── Resolve source & destination warehouse context ─────────────────────────
    IF p_transfer_type IN ('staff_to_warehouse', 'staff_to_staff') THEN
        SELECT warehouse_id INTO v_source_warehouse_id
        FROM staff_stock WHERE user_id = p_from_user_id AND product_id = p_product_id LIMIT 1;

        IF v_source_warehouse_id IS NULL THEN
            SELECT warehouse_id INTO v_source_warehouse_id FROM user_roles WHERE user_id = p_from_user_id;
        END IF;

        IF v_source_warehouse_id IS NULL THEN
            v_source_warehouse_id := p_from_warehouse_id;
        END IF;
    ELSE
        v_source_warehouse_id := p_from_warehouse_id;
    END IF;

    v_dest_warehouse_id := COALESCE(
        p_to_warehouse_id,
        (SELECT warehouse_id FROM staff_stock WHERE user_id = p_to_user_id AND product_id = p_product_id LIMIT 1),
        (SELECT warehouse_id FROM user_roles WHERE user_id = p_to_user_id),
        v_caller_warehouse_id
    );

    -- ── Determine initial status ───────────────────────────────────────────────
    IF p_transfer_type IN ('warehouse_to_warehouse', 'warehouse_to_staff')
       AND v_caller_role IN ('super_admin', 'manager') THEN
        v_status := 'approved';
    ELSE
        v_status := 'pending';
    END IF;

    -- ── Generate display ID safely to prevent 409 conflicts ──────────────────
    BEGIN
        SELECT public.generate_display_id('stock_transfers', 'TRF') INTO v_display_id;
    EXCEPTION WHEN OTHERS THEN
        v_display_id := 'TRF-' || to_char(NOW(), 'YYMMDD') || '-' || floor(random() * 10000)::text;
    END;

    -- ── Insert transfer record ─────────────────────────────────────────────────
    INSERT INTO stock_transfers (
        display_id, transfer_type,
        from_warehouse_id, from_user_id,
        to_warehouse_id,   to_user_id,
        product_id, quantity, description,
        status, created_by, requested_by
    ) VALUES (
        v_display_id, p_transfer_type,
        v_source_warehouse_id, p_from_user_id,
        v_dest_warehouse_id,   p_to_user_id,
        p_product_id, p_quantity, p_description,
        v_status, v_caller_id, v_caller_id
    )
    RETURNING id INTO v_transfer_id;

    -- ── Auto-execute if immediately approved ───────────────────────────────────
    IF v_status = 'approved' THEN
        PERFORM execute_stock_transfer(v_transfer_id);
    END IF;

    RETURN jsonb_build_object(
        'success',     true,
        'transfer_id', v_transfer_id,
        'display_id',  v_display_id,
        'status',      v_status
    );
END;
$function$;
