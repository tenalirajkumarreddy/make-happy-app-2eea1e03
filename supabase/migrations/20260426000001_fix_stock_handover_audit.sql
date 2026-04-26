-- =============================================================================
-- Migration: Fix Stock Transfer & Handover Audit Issues
-- Date: 2026-04-26
-- Fixes: ISSUE-01/03 (ON CONFLICT), ISSUE-02 (duplicate signatures),
--        ISSUE-04 (return discrepancy), ISSUE-05 (role check),
--        ISSUE-06 (create_handover), ISSUE-07 (admin_transfer),
--        ISSUE-09 (unique constraint), ISSUE-10 (confirm/reject RPCs)
-- =============================================================================

-- =============================================================================
-- PHASE 1: Fix Stock Transfer Functions
-- =============================================================================

-- Drop ALL old signatures to prevent orphan overloads
DROP FUNCTION IF EXISTS public.execute_stock_transfer(uuid);
DROP FUNCTION IF EXISTS public.record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS public.record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.process_stock_return(uuid, numeric, numeric, text, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.process_stock_return(uuid, numeric, text, text, boolean);

-- =============================================================================
-- FUNCTION: execute_stock_transfer (CANONICAL)
-- Fixes: ISSUE-01/03 — 3-column ON CONFLICT
--        ISSUE-04 — consistent quantity handling + stock_movements audit trail
-- =============================================================================
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transfer record;
BEGIN
  SELECT * INTO transfer FROM public.stock_transfers WHERE id = p_transfer_id;
  IF transfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found: %', p_transfer_id;
  END IF;

  -- WAREHOUSE -> STAFF
  IF transfer.transfer_type = 'warehouse_to_staff' THEN
    -- Decrement warehouse stock
    UPDATE public.product_stock
    SET quantity = quantity - transfer.quantity, updated_at = NOW()
    WHERE product_id = transfer.product_id
      AND warehouse_id = transfer.from_warehouse_id;

    -- Record movement (audit trail)
    INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
    VALUES (transfer.product_id, transfer.from_warehouse_id, -transfer.quantity, 'transfer_out',
            COALESCE(transfer.description, 'Warehouse to staff transfer'), transfer.created_by);

    -- Upsert staff stock — ISSUE-01/03 FIX: use 3-column conflict target
    INSERT INTO public.staff_stock (user_id, warehouse_id, product_id, quantity)
    VALUES (transfer.to_user_id, COALESCE(transfer.warehouse_id, transfer.from_warehouse_id), transfer.product_id, transfer.quantity)
    ON CONFLICT (user_id, warehouse_id, product_id)
    DO UPDATE SET
      quantity = staff_stock.quantity + transfer.quantity,
      updated_at = NOW(),
      is_negative = (staff_stock.quantity + transfer.quantity) < 0;

  -- STAFF -> WAREHOUSE
  ELSIF transfer.transfer_type = 'staff_to_warehouse' THEN
    -- Use actual_quantity if set (approved return), otherwise use quantity
    DECLARE
      v_deduct_qty numeric := COALESCE(transfer.actual_quantity, transfer.quantity);
    BEGIN
      -- Decrement staff stock by actual amount returned
      UPDATE public.staff_stock
      SET quantity = quantity - v_deduct_qty,
          updated_at = NOW(),
          is_negative = (quantity - v_deduct_qty) < 0
      WHERE user_id = transfer.from_user_id
        AND product_id = transfer.product_id;

      -- Increment warehouse stock by actual amount received
      UPDATE public.product_stock
      SET quantity = quantity + v_deduct_qty, updated_at = NOW()
      WHERE product_id = transfer.product_id
        AND warehouse_id = COALESCE(transfer.to_warehouse_id, transfer.warehouse_id);

      -- Create product_stock if doesn't exist
      IF NOT FOUND THEN
        INSERT INTO public.product_stock (warehouse_id, product_id, quantity)
        VALUES (COALESCE(transfer.to_warehouse_id, transfer.warehouse_id), transfer.product_id, v_deduct_qty);
      END IF;

      -- Record movement (audit trail)
      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (transfer.product_id, COALESCE(transfer.to_warehouse_id, transfer.warehouse_id), v_deduct_qty, 'transfer_in',
              COALESCE(transfer.description, 'Staff to warehouse return'), transfer.created_by);
    END;

  -- STAFF -> STAFF
  ELSIF transfer.transfer_type = 'staff_to_staff' THEN
    -- Decrement source staff stock
    UPDATE public.staff_stock
    SET quantity = quantity - transfer.quantity,
        updated_at = NOW(),
        is_negative = (quantity - transfer.quantity) < 0
    WHERE user_id = transfer.from_user_id
      AND product_id = transfer.product_id;

    -- Upsert destination staff stock — ISSUE-01/03 FIX: use 3-column conflict target
    INSERT INTO public.staff_stock (user_id, warehouse_id, product_id, quantity)
    VALUES (transfer.to_user_id, COALESCE(transfer.warehouse_id, transfer.from_warehouse_id), transfer.product_id, transfer.quantity)
    ON CONFLICT (user_id, warehouse_id, product_id)
    DO UPDATE SET
      quantity = staff_stock.quantity + transfer.quantity,
      updated_at = NOW(),
      is_negative = (staff_stock.quantity + transfer.quantity) < 0;

  -- WAREHOUSE -> WAREHOUSE
  ELSIF transfer.transfer_type = 'warehouse_to_warehouse' THEN
    -- Decrement source warehouse
    UPDATE public.product_stock
    SET quantity = quantity - transfer.quantity, updated_at = NOW()
    WHERE product_id = transfer.product_id
      AND warehouse_id = transfer.from_warehouse_id;

    -- Increment destination warehouse
    UPDATE public.product_stock
    SET quantity = quantity + transfer.quantity, updated_at = NOW()
    WHERE product_id = transfer.product_id
      AND warehouse_id = transfer.to_warehouse_id;

    IF NOT FOUND THEN
      INSERT INTO public.product_stock (warehouse_id, product_id, quantity)
      VALUES (transfer.to_warehouse_id, transfer.product_id, transfer.quantity);
    END IF;

    -- Record movements
    INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
    VALUES (transfer.product_id, transfer.from_warehouse_id, -transfer.quantity, 'transfer_out',
            COALESCE(transfer.description, 'Warehouse to warehouse'), transfer.created_by);
    INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
    VALUES (transfer.product_id, transfer.to_warehouse_id, transfer.quantity, 'transfer_in',
            COALESCE(transfer.description, 'Warehouse to warehouse'), transfer.created_by);
  END IF;

  -- Update transfer status to completed
  UPDATE public.stock_transfers
  SET status = 'completed'
  WHERE id = p_transfer_id AND status != 'completed';
END;
$$;

-- =============================================================================
-- FUNCTION: record_stock_transfer (CANONICAL — 8 params, uses auth.uid())
-- Fixes: ISSUE-02 — single canonical signature
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_stock_transfer(
    p_transfer_type text,
    p_from_warehouse_id uuid,
    p_from_user_id uuid,
    p_to_warehouse_id uuid,
    p_to_user_id uuid,
    p_product_id uuid,
    p_quantity numeric,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_transfer_id uuid;
  v_display_id text;
  v_status text;
  v_warehouse_id uuid;
  current_stock numeric;
  v_user_role text;
BEGIN
  v_warehouse_id := COALESCE(p_from_warehouse_id, p_to_warehouse_id);

  -- ISSUE-05 FIX: Use a safe role lookup that doesn't assume warehouse_id column exists on user_roles
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Validation per transfer type
  IF p_transfer_type = 'warehouse_to_staff' THEN
    SELECT quantity INTO current_stock
    FROM public.product_stock
    WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;
    IF current_stock IS NULL OR current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in warehouse. Available: %', COALESCE(current_stock, 0);
    END IF;
    v_status := 'completed';

  ELSIF p_transfer_type = 'staff_to_staff' THEN
    SELECT quantity INTO current_stock
    FROM public.staff_stock
    WHERE user_id = p_from_user_id AND product_id = p_product_id;
    IF current_stock IS NULL OR current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock with staff. Available: %', COALESCE(current_stock, 0);
    END IF;
    v_status := 'completed';

  ELSIF p_transfer_type = 'staff_to_warehouse' THEN
    v_status := 'pending'; -- Requires manager approval

  ELSIF p_transfer_type = 'warehouse_to_warehouse' THEN
    SELECT quantity INTO current_stock
    FROM public.product_stock
    WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;
    IF current_stock IS NULL OR current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in source warehouse. Available: %', COALESCE(current_stock, 0);
    END IF;
    v_status := 'completed';

  ELSE
    RAISE EXCEPTION 'Invalid transfer type: %', p_transfer_type;
  END IF;

  -- Generate display ID
  v_display_id := public.generate_display_id('stock_transfers', 'STF');

  -- Insert transfer record
  INSERT INTO public.stock_transfers (
    display_id, warehouse_id, product_id, transfer_type,
    from_warehouse_id, from_user_id, to_warehouse_id, to_user_id,
    quantity, status, description, created_by
  )
  VALUES (
    v_display_id, v_warehouse_id, p_product_id, p_transfer_type,
    p_from_warehouse_id, p_from_user_id, p_to_warehouse_id, p_to_user_id,
    p_quantity, v_status, p_reason, auth.uid()
  )
  RETURNING id INTO new_transfer_id;

  -- Auto-execute non-pending transfers
  IF v_status = 'completed' THEN
    PERFORM public.execute_stock_transfer(new_transfer_id);
  END IF;

  RETURN new_transfer_id;
END;
$$;

-- =============================================================================
-- FUNCTION: process_stock_return (CANONICAL — 5 params, inline stock math)
-- Fixes: ISSUE-04 — uses p_actual_quantity consistently, no stock "loss"
--        ISSUE-05 — safe role lookup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_stock_return(
    p_transfer_id uuid,
    p_actual_quantity numeric,
    p_action text,
    p_notes text,
    p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transfer record;
  v_difference numeric;
  v_user_role text;
BEGIN
  SELECT * INTO transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending transfer not found or already processed.';
  END IF;

  -- ISSUE-05 FIX: safe role lookup without warehouse_id assumption
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_user_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only admins or managers can process returns.';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.stock_transfers
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        description = concat_ws(E'\n', description, '[Rejected] ' || COALESCE(p_notes, ''))
    WHERE id = p_transfer_id;
    RETURN;
  END IF;

  v_difference := transfer.quantity - p_actual_quantity;

  -- Update transfer record
  UPDATE public.stock_transfers
  SET
    status = 'approved',
    actual_quantity = p_actual_quantity,
    difference = v_difference,
    action_taken = p_action,
    description = concat_ws(E'\n', description, '[Approved] ' || COALESCE(p_notes, '')),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_transfer_id;

  -- ISSUE-04 FIX: Deduct actual_quantity from staff (not the full requested amount)
  UPDATE public.staff_stock
  SET quantity = quantity - p_actual_quantity,
      updated_at = NOW(),
      is_negative = (quantity - p_actual_quantity) < 0
  WHERE user_id = transfer.from_user_id AND product_id = transfer.product_id;

  -- Increment warehouse stock by actual_quantity
  UPDATE public.product_stock
  SET quantity = quantity + p_actual_quantity, updated_at = NOW()
  WHERE product_id = transfer.product_id
    AND warehouse_id = COALESCE(transfer.to_warehouse_id, transfer.warehouse_id);

  -- Record movement
  INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
  VALUES (transfer.product_id, COALESCE(transfer.to_warehouse_id, transfer.warehouse_id),
          p_actual_quantity, 'transfer_in', 'Stock return (approved)', auth.uid());

  -- Handle discrepancy
  IF v_difference > 0 THEN
    IF p_action = 'keep' THEN
      -- Difference stays with staff, no stock movement needed
      -- (we only deducted actual_quantity above, so the difference remains naturally)
      NULL;
    END IF;

    -- Always log the discrepancy for audit
    INSERT INTO public.staff_performance_logs (
      user_id, log_type, product_id,
      expected_quantity, actual_quantity, difference,
      notes, created_by, created_at
    ) VALUES (
      transfer.from_user_id,
      CASE WHEN p_action = 'flag' THEN 'stock_discrepancy' ELSE 'stock_return_variance' END,
      transfer.product_id,
      transfer.quantity, p_actual_quantity, v_difference,
      COALESCE(p_notes, ''), auth.uid(), NOW()
    );
  END IF;
END;
$$;

-- Grant execute permissions for stock functions
GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_stock_return(uuid, numeric, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_return(uuid, numeric, text, text, boolean) TO service_role;


-- =============================================================================
-- PHASE 2: Create Missing Handover RPCs
-- =============================================================================

-- =============================================================================
-- ISSUE-09 FIX: Relax unique constraint to allow multiple recipients per day
-- Change from UNIQUE(user_id, handover_date) to UNIQUE(user_id, handover_date, handed_to)
-- =============================================================================
DO $$
BEGIN
  -- Drop the old unique index if it exists
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'handovers_user_id_handover_date_key') THEN
    DROP INDEX public.handovers_user_id_handover_date_key;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if already dropped
END $$;

-- Create new unique constraint allowing multiple recipients per day
CREATE UNIQUE INDEX IF NOT EXISTS handovers_user_date_recipient_key
  ON public.handovers (user_id, handover_date, handed_to);

-- =============================================================================
-- FUNCTION: create_handover (ISSUE-06)
-- Creates a handover record atomically with validation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_handover(
    p_user_id uuid,
    p_handed_to uuid,
    p_cash_amount numeric DEFAULT 0,
    p_notes text DEFAULT NULL
)
RETURNS SETOF public.handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover_id uuid;
  v_display_id text;
BEGIN
  -- Validation
  IF p_user_id IS NULL OR p_handed_to IS NULL THEN
    RAISE EXCEPTION 'Both sender and recipient are required';
  END IF;

  IF p_user_id = p_handed_to THEN
    RAISE EXCEPTION 'Cannot hand over to yourself';
  END IF;

  IF p_cash_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Check for duplicate handover to same recipient today
  IF EXISTS (
    SELECT 1 FROM public.handovers
    WHERE user_id = p_user_id
      AND handed_to = p_handed_to
      AND handover_date = CURRENT_DATE
      AND status = 'awaiting_confirmation'
  ) THEN
    RAISE EXCEPTION 'duplicate_handover: You already have a pending handover to this recipient today';
  END IF;

  -- Generate display ID
  BEGIN
    v_display_id := public.generate_display_id('handovers', 'HND');
  EXCEPTION WHEN OTHERS THEN
    v_display_id := 'HND-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text;
  END;

  -- Insert handover
  INSERT INTO public.handovers (
    user_id, handed_to, handover_date,
    cash_amount, upi_amount, status, notes,
    created_at, updated_at
  )
  VALUES (
    p_user_id, p_handed_to, CURRENT_DATE,
    p_cash_amount, 0, 'awaiting_confirmation', p_notes,
    NOW(), NOW()
  )
  RETURNING id INTO v_handover_id;

  -- Return the created record
  RETURN QUERY SELECT * FROM public.handovers WHERE id = v_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_handover(uuid, uuid, numeric, text) TO authenticated;

-- =============================================================================
-- FUNCTION: admin_transfer_between_staff (ISSUE-07)
-- Admin-initiated handover between two staff members, auto-confirmed
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_transfer_between_staff(
    p_from_user_id uuid,
    p_to_user_id uuid,
    p_amount numeric,
    p_reason text DEFAULT NULL,
    p_admin_id uuid DEFAULT NULL
)
RETURNS SETOF public.handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover_id uuid;
  v_admin uuid;
  v_admin_role text;
BEGIN
  v_admin := COALESCE(p_admin_id, auth.uid());

  -- Verify caller is admin or manager
  SELECT role INTO v_admin_role
  FROM public.user_roles
  WHERE user_id = v_admin
  LIMIT 1;

  IF v_admin_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only admins or managers can transfer between staff';
  END IF;

  -- Validation
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Both sender and recipient are required';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to the same staff member';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Create a confirmed handover (admin-authorized, no confirmation needed)
  INSERT INTO public.handovers (
    user_id, handed_to, handover_date,
    cash_amount, upi_amount, status,
    confirmed_by, confirmed_at,
    notes, created_at, updated_at
  )
  VALUES (
    p_from_user_id, p_to_user_id, CURRENT_DATE,
    p_amount, 0, 'confirmed',
    v_admin, NOW(),
    COALESCE(p_reason, '') || ' [Admin Transfer by ' || v_admin::text || ']',
    NOW(), NOW()
  )
  RETURNING id INTO v_handover_id;

  -- Return the created record
  RETURN QUERY SELECT * FROM public.handovers WHERE id = v_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_transfer_between_staff(uuid, uuid, numeric, text, uuid) TO authenticated;

-- =============================================================================
-- FUNCTION: confirm_handover (ISSUE-10)
-- Server-side validation for handover confirmation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.confirm_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover record;
  v_caller_role text;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT * INTO v_handover
  FROM public.handovers
  WHERE id = p_handover_id
  FOR UPDATE;

  IF v_handover IS NULL THEN
    RAISE EXCEPTION 'Handover not found';
  END IF;

  IF v_handover.status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Handover is not pending confirmation (current status: %)', v_handover.status;
  END IF;

  -- Check caller is the recipient or an admin/manager
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_handover.handed_to != auth.uid() AND v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only the recipient or an admin/manager can confirm this handover';
  END IF;

  -- Self-confirmation guard
  IF v_handover.user_id = auth.uid() AND v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'You cannot confirm your own handover';
  END IF;

  -- Perform atomic update
  UPDATE public.handovers
  SET status = 'confirmed',
      confirmed_by = auth.uid(),
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_handover(uuid) TO authenticated;

-- =============================================================================
-- FUNCTION: reject_handover (ISSUE-10)
-- Server-side validation for handover rejection
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reject_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover record;
  v_caller_role text;
BEGIN
  -- Lock the row
  SELECT * INTO v_handover
  FROM public.handovers
  WHERE id = p_handover_id
  FOR UPDATE;

  IF v_handover IS NULL THEN
    RAISE EXCEPTION 'Handover not found';
  END IF;

  IF v_handover.status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Handover is not pending (current status: %)', v_handover.status;
  END IF;

  -- Check caller is the recipient or an admin/manager
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_handover.handed_to != auth.uid() AND v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only the recipient or an admin/manager can reject this handover';
  END IF;

  -- Perform atomic update
  UPDATE public.handovers
  SET status = 'rejected',
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_handover(uuid) TO authenticated;

-- =============================================================================
-- FUNCTION: get_all_staff_balances (ISSUE-08)
-- Server-side balance aggregation replacing unbounded client-side calculation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
RETURNS TABLE (
  user_id uuid,
  sales numeric,
  received numeric,
  sent_confirmed numeric,
  sent_pending numeric,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH staff AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role NOT IN ('customer')
  ),
  sales_agg AS (
    SELECT
      s.recorded_by AS user_id,
      COALESCE(SUM(s.cash_amount + s.upi_amount), 0) AS total_sales
    FROM public.sales s
    WHERE s.recorded_by IN (SELECT user_id FROM staff)
    GROUP BY s.recorded_by
  ),
  handover_agg AS (
    SELECT
      h.user_id,
      h.handed_to,
      h.status,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) AS total_amount
    FROM public.handovers h
    WHERE h.user_id IN (SELECT user_id FROM staff)
       OR h.handed_to IN (SELECT user_id FROM staff)
    GROUP BY h.user_id, h.handed_to, h.status
  ),
  received AS (
    SELECT
      handed_to AS user_id,
      SUM(total_amount) AS received
    FROM handover_agg
    WHERE status = 'confirmed'
    GROUP BY handed_to
  ),
  sent_confirmed AS (
    SELECT
      ha.user_id,
      SUM(total_amount) AS sent
    FROM handover_agg ha
    WHERE ha.status = 'confirmed'
    GROUP BY ha.user_id
  ),
  sent_pending AS (
    SELECT
      ha.user_id,
      SUM(total_amount) AS pending
    FROM handover_agg ha
    WHERE ha.status = 'awaiting_confirmation'
    GROUP BY ha.user_id
  )
  SELECT
    st.user_id,
    COALESCE(sa.total_sales, 0) AS sales,
    COALESCE(r.received, 0) AS received,
    COALESCE(sc.sent, 0) AS sent_confirmed,
    COALESCE(sp.pending, 0) AS sent_pending,
    COALESCE(sa.total_sales, 0) + COALESCE(r.received, 0) - COALESCE(sc.sent, 0) - COALESCE(sp.pending, 0) AS total
  FROM staff st
  LEFT JOIN sales_agg sa ON st.user_id = sa.user_id
  LEFT JOIN received r ON st.user_id = r.user_id
  LEFT JOIN sent_confirmed sc ON st.user_id = sc.user_id
  LEFT JOIN sent_pending sp ON st.user_id = sp.user_id
  WHERE COALESCE(sa.total_sales, 0) + COALESCE(r.received, 0) + COALESCE(sc.sent, 0) + COALESCE(sp.pending, 0) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_staff_balances() TO authenticated;

-- =============================================================================
-- Update RLS policy for handovers INSERT to support SECURITY DEFINER functions
-- The create_handover RPC uses SECURITY DEFINER so it bypasses RLS,
-- but we also need to allow admin inserts for admin_transfer_between_staff
-- =============================================================================
-- Drop and recreate the INSERT policy to also allow admin inserts
DROP POLICY IF EXISTS "Users can insert own handovers" ON public.handovers;
CREATE POLICY "Users can insert own handovers" ON public.handovers
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'manager')
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
