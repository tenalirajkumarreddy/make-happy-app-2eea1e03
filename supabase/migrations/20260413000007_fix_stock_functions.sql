-- ============================================================================
-- MIGRATION: Fix Stock Functions - Drop and Recreate
-- ============================================================================

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.record_stock_transfer(TEXT, UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS public.execute_stock_transfer(UUID);
DROP FUNCTION IF EXISTS public.process_stock_return(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, BOOLEAN);

-- Add status column to stock_transfers if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_transfers' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.stock_transfers ADD COLUMN status TEXT DEFAULT 'completed';
    ALTER TABLE public.stock_transfers ADD COLUMN reviewed_by UUID REFERENCES auth.users(id);
    ALTER TABLE public.stock_transfers ADD COLUMN reviewed_at TIMESTAMPTZ;
    ALTER TABLE public.stock_transfers ADD COLUMN actual_quantity NUMERIC;
    ALTER TABLE public.stock_transfers ADD COLUMN difference NUMERIC DEFAULT 0;
    ALTER TABLE public.stock_transfers ADD COLUMN action_taken TEXT;
  END IF;
END $$;

-- Add constraint for status values
ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;
ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

-- ============================================================================
-- FUNCTION: record_stock_transfer
-- Unified function for all stock transfers: warehouse↔staff, staff↔staff
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_stock_transfer(
  p_transfer_type TEXT,
  p_from_warehouse_id UUID,
  p_from_user_id UUID,
  p_to_warehouse_id UUID,
  p_to_user_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID;
  v_display_id TEXT;
  v_from_stock NUMERIC;
BEGIN
  -- Validate quantity
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  -- Generate display ID
  v_display_id := 'STF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);

  -- Validate transfer type and check stock availability
  CASE p_transfer_type
    WHEN 'warehouse_to_staff' THEN
      -- Check warehouse stock
      SELECT quantity INTO v_from_stock
      FROM product_stock
      WHERE warehouse_id = p_from_warehouse_id AND product_id = p_product_id;

      IF v_from_stock IS NULL OR v_from_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock in warehouse. Available: %', COALESCE(v_from_stock, 0);
      END IF;

    WHEN 'staff_to_warehouse' THEN
      -- Check staff stock
      SELECT quantity INTO v_from_stock
      FROM staff_stock
      WHERE user_id = p_from_user_id AND product_id = p_product_id;

      IF v_from_stock IS NULL OR v_from_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock with staff. Available: %', COALESCE(v_from_stock, 0);
      END IF;

    WHEN 'staff_to_staff' THEN
      -- Check source staff stock
      SELECT quantity INTO v_from_stock
      FROM staff_stock
      WHERE user_id = p_from_user_id AND product_id = p_product_id;

      IF v_from_stock IS NULL OR v_from_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock with source staff. Available: %', COALESCE(v_from_stock, 0);
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid transfer type: %', p_transfer_type;
  END CASE;

  -- Create transfer record (status pending for staff_to_warehouse, completed for others)
  INSERT INTO stock_transfers (
    display_id,
    transfer_type,
    from_warehouse_id,
    from_user_id,
    to_warehouse_id,
    to_user_id,
    product_id,
    quantity,
    description,
    created_by,
    status
  ) VALUES (
    v_display_id,
    p_transfer_type,
    p_from_warehouse_id,
    p_from_user_id,
    p_to_warehouse_id,
    p_to_user_id,
    p_product_id,
    p_quantity,
    p_reason,
    p_created_by,
    CASE WHEN p_transfer_type = 'staff_to_warehouse' THEN 'pending' ELSE 'completed' END
  )
  RETURNING id INTO v_transfer_id;

  -- Execute transfer immediately for non-return transfers
  IF p_transfer_type != 'staff_to_warehouse' THEN
    PERFORM execute_stock_transfer(v_transfer_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'display_id', v_display_id,
    'status', CASE WHEN p_transfer_type = 'staff_to_warehouse' THEN 'pending' ELSE 'completed' END
  );
END;
$$;

-- ============================================================================
-- FUNCTION: execute_stock_transfer
-- Internal function to actually move the stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id;

  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  CASE v_transfer.transfer_type
    WHEN 'warehouse_to_staff' THEN
      -- Deduct from warehouse
      UPDATE product_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND product_id = v_transfer.product_id;

      -- Record movement
      INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.from_warehouse_id, -v_transfer.quantity, 'transfer_out', v_transfer.description, v_transfer.created_by);

      -- Add to staff
      INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity)
      VALUES (v_transfer.to_user_id, v_transfer.from_warehouse_id, v_transfer.product_id, v_transfer.quantity)
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET
        quantity = staff_stock.quantity + v_transfer.quantity,
        updated_at = NOW(),
        is_negative = (staff_stock.quantity + v_transfer.quantity) < 0;

    WHEN 'staff_to_warehouse' THEN
      -- Deduct from staff
      UPDATE staff_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW(),
          is_negative = (quantity - v_transfer.quantity) < 0
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id;

      -- Add to warehouse
      UPDATE product_stock
      SET quantity = quantity + v_transfer.actual_quantity,
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.to_warehouse_id
        AND product_id = v_transfer.product_id;

      -- If warehouse record doesn't exist, create it
      IF NOT FOUND THEN
        INSERT INTO product_stock (warehouse_id, product_id, quantity)
        VALUES (v_transfer.to_warehouse_id, v_transfer.product_id, v_transfer.actual_quantity);
      END IF;

      -- Record movement with actual quantity
      INSERT INTO stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, v_transfer.actual_quantity, 'transfer_in', v_transfer.description, v_transfer.created_by);

    WHEN 'staff_to_staff' THEN
      -- Deduct from source staff
      UPDATE staff_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW(),
          is_negative = (quantity - v_transfer.quantity) < 0
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id;

      -- Add to destination staff
      INSERT INTO staff_stock (user_id, warehouse_id, product_id, quantity)
      VALUES (v_transfer.to_user_id, v_transfer.from_warehouse_id, v_transfer.quantity)
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET
        quantity = staff_stock.quantity + v_transfer.quantity,
        updated_at = NOW(),
        is_negative = (staff_stock.quantity + v_transfer.quantity) < 0;

  END CASE;

  -- Update transfer status
  UPDATE stock_transfers
  SET status = 'completed'
  WHERE id = p_transfer_id;
END;
$$;

-- ============================================================================
-- FUNCTION: process_stock_return
-- Process a pending return request (approve/reject)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_stock_return(
  p_transfer_id UUID,
  p_actual_quantity NUMERIC,
  p_difference NUMERIC,
  p_action TEXT,
  p_notes TEXT,
  p_reviewed_by UUID,
  p_approved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_staff_user_id UUID;
BEGIN
  -- Get the transfer
  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id AND status = 'pending';

  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found or already processed';
  END IF;

  v_staff_user_id := v_transfer.from_user_id;

  IF p_approved THEN
    -- Update transfer record
    UPDATE stock_transfers
    SET status = 'approved',
        actual_quantity = p_actual_quantity,
        difference = p_difference,
        action_taken = p_action,
        description = COALESCE(v_transfer.description, '') || E'\n[Review] ' || p_notes,
        reviewed_by = p_reviewed_by,
        reviewed_at = NOW()
    WHERE id = p_transfer_id;

    -- Execute the transfer
    PERFORM execute_stock_transfer(p_transfer_id);

    -- Handle difference based on action
    IF p_difference > 0 THEN
      IF p_action = 'flag' THEN
        -- Log discrepancy for performance report
        INSERT INTO staff_performance_logs (
          user_id, log_type, reference_id, product_id,
          expected_quantity, actual_quantity, difference, notes, created_by
        ) VALUES (
          v_staff_user_id, 'stock_discrepancy', p_transfer_id, v_transfer.product_id,
          v_transfer.quantity, p_actual_quantity, p_difference, p_notes, p_reviewed_by
        );
      ELSE
        -- Keep with user
        INSERT INTO staff_performance_logs (
          user_id, log_type, reference_id, product_id,
          expected_quantity, actual_quantity, difference, notes, created_by
        ) VALUES (
          v_staff_user_id, 'stock_return_variance', p_transfer_id, v_transfer.product_id,
          v_transfer.quantity, p_actual_quantity, p_difference,
          'Variance kept with staff: ' || p_notes, p_reviewed_by
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true, 'message', 'Return approved and processed', 'transfer_id', p_transfer_id
    );
  ELSE
    -- Reject the return
    UPDATE stock_transfers
    SET status = 'rejected',
        description = COALESCE(v_transfer.description, '') || E'\n[Rejected] ' || p_notes,
        reviewed_by = p_reviewed_by, reviewed_at = NOW()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
      'success', true, 'message', 'Return rejected', 'transfer_id', p_transfer_id
    );
  END IF;
END;
$$;

-- ============================================================================
-- TABLE: staff_performance_logs (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL,
  reference_id UUID,
  product_id UUID REFERENCES public.products(id),
  expected_quantity NUMERIC, actual_quantity NUMERIC, difference NUMERIC,
  notes TEXT, created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_performance_logs_user ON public.staff_performance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_performance_logs_type ON public.staff_performance_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_staff_performance_logs_created ON public.staff_performance_logs(created_at DESC);

ALTER TABLE public.staff_performance_logs ENABLE ROW LEVEL SECURITY;

-- RLS for staff_performance_logs
CREATE POLICY "super_admin_all_performance_logs" ON public.staff_performance_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "manager_view_performance_logs" ON public.staff_performance_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'manager'
    AND ur.warehouse_id IN (
      SELECT warehouse_id FROM public.user_roles WHERE user_id = staff_performance_logs.user_id
    )
  ));

CREATE POLICY "staff_view_own_logs" ON public.staff_performance_logs FOR SELECT
  USING (user_id = auth.uid());

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.record_stock_transfer(TEXT, UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_return(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(UUID) TO authenticated;
