-- ============================================================
-- 20260530000008_admin_cancel_sale_rpc.sql
-- Admin/Manager can cancel a sale and choose stock destination.
-- ============================================================

-- 1. RPC for admin/manager to cancel a sale with configurable stock destination
--    p_restock_user_id = NULL → restore to warehouse (product_stock)
--    p_restock_user_id = <uuid> → restore to that agent's staff_stock
CREATE OR REPLACE FUNCTION public.admin_cancel_sale(
  p_sale_id UUID,
  p_restock_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_warehouse_id UUID;
BEGIN
  v_caller_id := auth.uid();

  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id;

  IF v_caller_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only super_admin or manager can cancel sales';
  END IF;

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

  IF p_restock_user_id IS NOT NULL THEN
    PERFORM 1 FROM public.user_roles
    WHERE user_id = p_restock_user_id AND role = 'agent';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Restock user must have agent role';
    END IF;
  END IF;

  FOR v_item IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    IF p_restock_user_id IS NOT NULL THEN
      INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
      VALUES (p_restock_user_id, v_item.product_id, v_warehouse_id, v_item.quantity, NOW(), NOW())
      ON CONFLICT (user_id, product_id, warehouse_id)
      DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                    updated_at = NOW(),
                    last_sale_at = NOW();

      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
      VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return',
              'Admin/manager cancelled sale ' || v_sale.display_id || ' - stock restored to agent ' || p_restock_user_id,
              v_sale.id::text, v_caller_id, NOW());
    ELSE
      INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
      VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, NOW())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                    updated_at = NOW();

      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
      VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return',
              'Admin/manager cancelled sale ' || v_sale.display_id || ' - stock restored to warehouse',
              v_sale.id::text, v_caller_id, NOW());
    END IF;
  END LOOP;

  UPDATE public.stores
  SET outstanding = GREATEST(outstanding - v_sale.outstanding_amount, 0),
      updated_at = NOW()
  WHERE id = v_sale.store_id;

  PERFORM set_config('app.admin_cancelled_sale', p_sale_id::text, true);

  UPDATE public.sales
  SET deleted_at = NOW(),
      outstanding_amount = 0,
      updated_at = NOW()
  WHERE id = p_sale_id;

  PERFORM public.recalc_running_balances(v_sale.store_id);

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'display_id', v_sale.display_id,
    'restock_user_id', p_restock_user_id,
    'restock_target', CASE WHEN p_restock_user_id IS NULL THEN 'warehouse' ELSE 'agent' END
  );
END;
$$;

-- 2. Modify soft-delete trigger to skip when admin_cancel_sale handled stock restoration
CREATE OR REPLACE FUNCTION public.handle_sale_stock_restoration_on_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_is_agent BOOLEAN;
  v_warehouse_id UUID;
  v_canceller_id UUID;
  v_admin_cancelled TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    BEGIN
      v_admin_cancelled := NULLIF(current_setting('app.admin_cancelled_sale', true), '');
      IF v_admin_cancelled IS NOT NULL AND v_admin_cancelled = NEW.id::text THEN
        RETURN NEW;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    v_canceller_id := COALESCE(auth.uid(), NEW.recorded_by);
    v_warehouse_id := NEW.warehouse_id;

    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_canceller_id AND role = 'agent'
    ) INTO v_is_agent;

    FOR v_item IN
      SELECT product_id, quantity
      FROM public.sale_items
      WHERE sale_id = NEW.id
    LOOP
      IF v_is_agent THEN
        INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
        VALUES (v_canceller_id, v_item.product_id, v_warehouse_id, v_item.quantity, NOW(), NOW())
        ON CONFLICT (user_id, product_id, warehouse_id)
        DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                      updated_at = NOW(),
                      last_sale_at = NOW();

        INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock restored to agent holding on sale soft-delete: ' || NEW.display_id, NEW.id::text, v_canceller_id, NOW());
      ELSE
        INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, NOW())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                      updated_at = NOW();

        INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock restored to warehouse on sale soft-delete: ' || NEW.display_id, NEW.id::text, v_canceller_id, NOW());
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
