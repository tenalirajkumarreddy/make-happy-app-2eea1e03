-- Migration: Fix ambiguous status column + logic bug in admin_cancel_sale
-- Date: 2026-06-28
--
-- ISSUES:
-- 1. The deployed admin_cancel_sale function sets status = 'cancelled' but does NOT
--    set deleted_at = NOW(). This means AFTER UPDATE triggers (recalc_store_outstanding)
--    that filter by deleted_at IS NULL still count the cancelled sale, overriding the
--    correct outstanding with a wrong (higher) value.
-- 2. The function lacks SET search_path, which can cause "column reference 'status'
--    is ambiguous" errors when PL/pgSQL variable resolution conflicts with table columns.
--
-- FIX:
-- - Add SET search_path TO 'public'
-- - Set BOTH status = 'cancelled' AND deleted_at = NOW() for trigger compatibility
-- - Call set_config('app.admin_cancelled_sale', ...) BEFORE the UPDATE so the
--   handle_sale_stock_restoration_on_soft_delete BEFORE UPDATE trigger skips its
--   stock restoration (admin_cancel_sale already handles it)
-- - Keep the stock restoration logic and inline store outstanding recalc

-- First drop the existing function to replace it
DROP FUNCTION IF EXISTS public.admin_cancel_sale(UUID, UUID);

CREATE OR REPLACE FUNCTION public.admin_cancel_sale(
  p_sale_id UUID,
  p_restock_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_warehouse_id UUID;
  v_new_store_outstanding NUMERIC;
BEGIN
  v_caller_id := auth.uid();

  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id;

  IF v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only super_admin or manager can cancel sales';
  END IF;

  SELECT s.* INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id AND s.deleted_at IS NULL AND s.status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found or already cancelled';
  END IF;

  IF v_sale.is_fully_returned THEN
    RAISE EXCEPTION 'Sale has already been fully returned';
  END IF;

  v_warehouse_id := v_sale.warehouse_id;

  -- restore stock
  FOR v_item IN
    SELECT si.product_id, si.quantity, p.warehouse_id
    FROM public.sale_items si
    JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id
  LOOP
    IF p_restock_user_id IS NOT NULL THEN
      INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
      VALUES (p_restock_user_id, v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id), v_item.quantity, NOW(), NOW())
      ON CONFLICT (user_id, product_id, warehouse_id)
      DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity, updated_at = NOW(), last_sale_at = NOW();
    ELSE
      INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
      VALUES (v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id), v_item.quantity, NOW())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity, updated_at = NOW();
    END IF;
  END LOOP;

  -- Tell the soft-delete trigger to skip stock restoration (we handle it above)
  PERFORM set_config('app.admin_cancelled_sale', p_sale_id::text, true);

  -- soft-delete the sale + set cancelled status (compatible with both frontend and triggers)
  UPDATE public.sales s
  SET
    status = 'cancelled',
    deleted_at = NOW(),
    outstanding_amount = 0,
    updated_at = NOW()
  WHERE s.id = p_sale_id;

  -- recalc store outstanding using same formula as recalc_store_outstanding trigger
  SELECT GREATEST((
    COALESCE(st.opening_balance, 0)
    + COALESCE((
        SELECT SUM(COALESCE(s.total_amount, 0) - COALESCE(s.cash_amount, 0) - COALESCE(s.upi_amount, 0))
        FROM public.sales s
        WHERE s.store_id = v_sale.store_id AND s.deleted_at IS NULL AND s.status != 'cancelled' AND s.is_fully_returned = false
      ), 0)
    - COALESCE((
        SELECT SUM(COALESCE(t.total_amount, 0))
        FROM public.transactions t
        WHERE t.store_id = v_sale.store_id AND t.deleted_at IS NULL
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(pr.return_amount, 0))
        FROM public.payment_returns pr
        WHERE pr.store_id = v_sale.store_id AND pr.status = 'completed'
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(ba.adjustment_amount, 0))
        FROM public.balance_adjustments ba
        WHERE ba.store_id = v_sale.store_id
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(bc.correction_amount, 0))
        FROM public.balance_corrections bc
        WHERE bc.store_id = v_sale.store_id AND bc.status = 'approved' AND bc.correction_type = 'increase'
      ), 0)
    - COALESCE((
        SELECT SUM(COALESCE(bc.correction_amount, 0))
        FROM public.balance_corrections bc
        WHERE bc.store_id = v_sale.store_id AND bc.status = 'approved' AND bc.correction_type = 'decrease'
      ), 0)
  ), 0) INTO v_new_store_outstanding
  FROM public.stores st
  WHERE st.id = v_sale.store_id;

  UPDATE public.stores
  SET outstanding = v_new_store_outstanding, updated_at = NOW()
  WHERE id = v_sale.store_id;

  -- recalc ledger running balances
  PERFORM public.recalc_running_balances(v_sale.store_id);

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'display_id', v_sale.display_id,
    'restock_user_id', p_restock_user_id,
    'restock_target', CASE WHEN p_restock_user_id IS NULL THEN 'warehouse' ELSE 'agent' END,
    'store_new_outstanding', v_new_store_outstanding
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_sale TO authenticated;

-- ============================================================
-- Also fix recalc_store_outstanding trigger to exclude cancelled sales
-- as a safety net (in case any other code path cancels via status only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_id ELSE NEW.store_id END;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.stores
    SET outstanding = GREATEST((
      SELECT
        COALESCE(st.opening_balance, 0)
        + COALESCE((
            SELECT SUM(COALESCE(s.total_amount, 0) - COALESCE(s.cash_amount, 0) - COALESCE(s.upi_amount, 0))
            FROM public.sales s
            WHERE s.store_id = v_store_id AND s.deleted_at IS NULL AND s.status != 'cancelled' AND s.is_fully_returned = false
          ), 0)
        - COALESCE((
            SELECT SUM(COALESCE(t.total_amount, 0))
            FROM public.transactions t
            WHERE t.store_id = v_store_id AND t.deleted_at IS NULL
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(pr.return_amount, 0))
            FROM public.payment_returns pr
            WHERE pr.store_id = v_store_id AND pr.status = 'completed'
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(ba.adjustment_amount, 0))
            FROM public.balance_adjustments ba
            WHERE ba.store_id = v_store_id
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store_id AND bc.status = 'approved' AND bc.correction_type = 'increase'
          ), 0)
        - COALESCE((
            SELECT SUM(COALESCE(bc.correction_amount, 0))
            FROM public.balance_corrections bc
            WHERE bc.store_id = v_store_id AND bc.status = 'approved' AND bc.correction_type = 'decrease'
          ), 0)
      FROM public.stores st
      WHERE st.id = v_store_id
    ), 0),
    updated_at = now()
    WHERE id = v_store_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
