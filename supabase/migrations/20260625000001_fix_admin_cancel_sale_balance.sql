-- Fix admin_cancel_sale to correctly restore store balance and recalc ledger
-- Drop existing function signatures
DROP FUNCTION IF EXISTS public.admin_cancel_sale(UUID, UUID);

-- Recreate with correct balance logic + recalc
CREATE OR REPLACE FUNCTION public.admin_cancel_sale(
  p_sale_id UUID,
  p_restock_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_warehouse_id UUID;
  v_new_store_outstanding NUMERIC;
BEGIN
  -- Get current user
  v_caller_id := auth.uid();

  -- Check user role
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id;

  IF v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only super_admin or manager can cancel sales';
  END IF;

  -- lock sale row
  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND deleted_at IS NULL
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

  -- soft-delete the sale (must happen before recalc so it's excluded)
  UPDATE public.sales
  SET deleted_at = NOW(), outstanding_amount = 0, updated_at = NOW()
  WHERE id = p_sale_id;

  -- recalc store outstanding using the same formula as recalc_store_outstanding trigger
  SELECT GREATEST((
    COALESCE(st.opening_balance, 0)
    -- outstanding from non-returned, non-deleted sales
    + COALESCE((
        SELECT SUM(COALESCE(s.total_amount, 0) - COALESCE(s.cash_amount, 0) - COALESCE(s.upi_amount, 0))
        FROM public.sales s
        WHERE s.store_id = v_sale.store_id AND s.deleted_at IS NULL AND s.is_fully_returned = false
      ), 0)
    -- minus payments
    - COALESCE((
        SELECT SUM(COALESCE(t.total_amount, 0))
        FROM public.transactions t
        WHERE t.store_id = v_sale.store_id AND t.deleted_at IS NULL
      ), 0)
    -- plus completed payment returns
    + COALESCE((
        SELECT SUM(COALESCE(pr.return_amount, 0))
        FROM public.payment_returns pr
        WHERE pr.store_id = v_sale.store_id AND pr.status = 'completed'
      ), 0)
    -- plus adjustments
    + COALESCE((
        SELECT SUM(COALESCE(ba.adjustment_amount, 0))
        FROM public.balance_adjustments ba
        WHERE ba.store_id = v_sale.store_id
      ), 0)
    -- plus approved increase corrections
    + COALESCE((
        SELECT SUM(COALESCE(bc.correction_amount, 0))
        FROM public.balance_corrections bc
        WHERE bc.store_id = v_sale.store_id AND bc.status = 'approved' AND bc.correction_type = 'increase'
      ), 0)
    -- minus approved decrease corrections
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

  -- return result
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
