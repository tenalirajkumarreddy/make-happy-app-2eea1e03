-- =============================================================================
-- Agent Stock Return Request RPC
-- Allows agents to request stock returns to the warehouse.
-- approve_agent_return / reject_agent_return already exist and handle the
-- warehouse-side approval workflow with correct stock movements.
-- =============================================================================

-- ── Helper: agent can see their own return requests ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stock_transfers'
      AND policyname = 'agent_see_own_returns'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY agent_see_own_returns ON public.stock_transfers
        FOR SELECT
        USING (
          requested_by = auth.uid()
          AND is_return = true
        );
    $pol$;
  END IF;
END
$$;

-- =============================================================================
-- RPC: request_agent_return
-- Called by the agent (APK) to submit a stock return request.
-- Stock is immediately deducted from staff_stock (reserved / in-transit).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_agent_return(
    p_product_id    UUID,
    p_quantity      NUMERIC,
    p_damaged_qty   NUMERIC  DEFAULT 0,
    p_reason        TEXT     DEFAULT NULL,
    p_damage_notes  TEXT     DEFAULT NULL,
    p_warehouse_id  UUID     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller_id       UUID;
    v_caller_role     TEXT;
    v_staff_stock     RECORD;
    v_warehouse_id    UUID;
    v_transfer_id     UUID;
    v_display_id      TEXT;
    v_product_name    TEXT;
    v_product_price   NUMERIC;
    v_notify_user_id  UUID;
BEGIN
    -- ── Auth ─────────────────────────────────────────────────────────────────
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT ur.role INTO v_caller_role
    FROM user_roles ur WHERE ur.user_id = v_caller_id LIMIT 1;

    IF v_caller_role NOT IN ('agent', 'marketer') THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Only agents can submit stock return requests');
    END IF;

    -- ── Validate inputs ───────────────────────────────────────────────────────
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Return quantity must be greater than zero');
    END IF;

    IF p_damaged_qty < 0 OR p_damaged_qty > p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Damaged quantity cannot exceed return quantity');
    END IF;

    -- ── Check existing pending return for same product ────────────────────────
    IF EXISTS (
        SELECT 1 FROM stock_transfers
        WHERE from_user_id = v_caller_id
          AND product_id   = p_product_id
          AND is_return    = true
          AND status       = 'pending'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'A pending return already exists for this product. Wait for it to be processed first.');
    END IF;

    -- ── Get agent stock (with row lock) ───────────────────────────────────────
    SELECT * INTO v_staff_stock
    FROM staff_stock
    WHERE user_id    = v_caller_id
      AND product_id = p_product_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_staff_stock.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error',
            'No stock record found for this product');
    END IF;

    IF v_staff_stock.quantity < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Insufficient stock. You have %s units, requested %s',
                   v_staff_stock.quantity, p_quantity));
    END IF;

    -- ── Resolve target warehouse ───────────────────────────────────────────────
    IF p_warehouse_id IS NOT NULL THEN
        v_warehouse_id := p_warehouse_id;
    ELSE
        -- Use agent's assigned warehouse, fallback to staff_stock warehouse, then default
        SELECT COALESCE(
            (SELECT warehouse_id FROM user_roles
             WHERE user_id = v_caller_id AND warehouse_id IS NOT NULL LIMIT 1),
            v_staff_stock.warehouse_id,
            (SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1)
        ) INTO v_warehouse_id;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Could not resolve target warehouse');
    END IF;

    -- ── Fetch product info ────────────────────────────────────────────────────
    SELECT name, base_price INTO v_product_name, v_product_price
    FROM products WHERE id = p_product_id;

    IF v_product_price IS NULL THEN v_product_price := 0; END IF;

    -- ── Generate display ID ───────────────────────────────────────────────────
    v_display_id := 'RTN-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD((floor(random() * 99999) + 1)::TEXT, 5, '0');

    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM stock_transfers WHERE display_id = v_display_id) LOOP
        v_display_id := 'RTN-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
                        LPAD((floor(random() * 99999) + 1)::TEXT, 5, '0');
    END LOOP;

    -- ── 1. Deduct from agent's staff_stock (reserve) ─────────────────────────
    UPDATE staff_stock
    SET quantity   = quantity - p_quantity,
        updated_at = NOW(),
        is_negative = (quantity - p_quantity) < 0
    WHERE user_id    = v_caller_id
      AND product_id = p_product_id;

    -- ── 2. Create the return transfer record ─────────────────────────────────
    INSERT INTO stock_transfers (
        display_id, transfer_type,
        from_user_id, from_warehouse_id,
        to_warehouse_id,
        product_id, quantity,
        status, is_return,
        return_reason, damaged_qty, damage_notes,
        requested_by, description,
        created_by, created_at, updated_at
    ) VALUES (
        v_display_id, 'staff_to_warehouse',
        v_caller_id, v_staff_stock.warehouse_id,
        v_warehouse_id,
        p_product_id, p_quantity,
        'pending', true,
        p_reason, COALESCE(p_damaged_qty, 0), p_damage_notes,
        v_caller_id,
        'Agent return request: ' || COALESCE(p_reason, 'No reason given'),
        v_caller_id, NOW(), NOW()
    )
    RETURNING id INTO v_transfer_id;

    -- ── 3. Stock movement: agent stock reserved for return ────────────────────
    INSERT INTO stock_movements (
        product_id, warehouse_id, quantity, type,
        reason, reference_id, from_user_id, transfer_id,
        unit_price, total_value, from_location, to_location,
        created_by, created_at
    ) VALUES (
        p_product_id, COALESCE(v_staff_stock.warehouse_id, v_warehouse_id),
        -p_quantity, 'transfer_out',
        'Return request submitted [' || v_display_id || ']: ' ||
            COALESCE(p_reason, 'stock return to warehouse') ||
            CASE WHEN p_damaged_qty > 0
                 THEN ' (' || p_damaged_qty || ' reported damaged)'
                 ELSE '' END,
        v_transfer_id::TEXT, v_caller_id, v_transfer_id,
        v_product_price, v_product_price * p_quantity,
        'staff', 'warehouse',
        v_caller_id, NOW()
    );

    -- ── 4. Notify managers / operators / super_admin ──────────────────────────
    FOR v_notify_user_id IN
        SELECT DISTINCT ur.user_id
        FROM user_roles ur
        WHERE ur.role IN ('super_admin', 'manager', 'operator')
          AND ur.user_id != v_caller_id
    LOOP
        INSERT INTO notifications (
            user_id, title, message, type,
            entity_type, entity_id, created_by
        ) VALUES (
            v_notify_user_id,
            'Return Request: ' || v_display_id,
            'Agent return request for ' || p_quantity || 'x ' ||
                COALESCE(v_product_name, 'item') ||
                CASE WHEN p_damaged_qty > 0
                     THEN ' (' || p_damaged_qty || ' damaged)'
                     ELSE '' END ||
                '. Reason: ' || COALESCE(p_reason, 'None'),
            'stock_return',
            'stock_transfers', v_transfer_id,
            v_caller_id
        );
    END LOOP;

    -- ── 5. Activity log ───────────────────────────────────────────────────────
    INSERT INTO activity_logs (
        user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        v_caller_id,
        'Submitted stock return request',
        'stock_transfer',
        v_display_id,
        jsonb_build_object(
            'transfer_id',   v_transfer_id,
            'product_id',    p_product_id,
            'product_name',  v_product_name,
            'quantity',      p_quantity,
            'damaged_qty',   p_damaged_qty,
            'warehouse_id',  v_warehouse_id,
            'reason',        p_reason
        )
    );

    RETURN jsonb_build_object(
        'success',      true,
        'transfer_id',  v_transfer_id,
        'display_id',   v_display_id,
        'quantity',     p_quantity,
        'damaged_qty',  COALESCE(p_damaged_qty, 0),
        'warehouse_id', v_warehouse_id,
        'message',      'Return request submitted successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$;

-- Grant execute to authenticated users (RLS role check is inside the function)
GRANT EXECUTE ON FUNCTION public.request_agent_return(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID)
  TO authenticated;

-- Ensure agents can SELECT their own pending/completed returns for the status view
-- (some deployments may already have a broader SELECT policy; this is additive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stock_transfers'
      AND policyname = 'agent_see_own_returns'
  ) THEN
    CREATE POLICY agent_see_own_returns ON public.stock_transfers
      FOR SELECT
      USING (requested_by = auth.uid() AND is_return = true);
  END IF;
END
$$;
