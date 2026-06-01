-- Migration: Business Logic Integrity & Dynamic Stock Restoration
-- Date: 2026-05-28

-- 1. Keep RLS disabled on user_roles to prevent infinite recursion
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

-- 2. Create the complete Reconciliation Ledger Outstanding calculator
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding_logic(p_store_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_balance NUMERIC := 0;
  v_base_time TIMESTAMPTZ := '-infinity'::TIMESTAMPTZ;
  v_outstanding NUMERIC;
BEGIN
  -- Find the latest approved direct-set balance adjustment (reconciliation starting point)
  SELECT COALESCE(new_outstanding, 0), COALESCE(approved_at, '-infinity'::TIMESTAMPTZ) INTO v_base_balance, v_base_time
  FROM public.balance_corrections
  WHERE store_id = p_store_id AND status = 'approved' AND correction_type = 'adjustment'
  ORDER BY approved_at DESC
  LIMIT 1;

  -- Fall back to opening balance if no direct-set correction is found
  IF v_base_time IS NULL OR v_base_time = '-infinity'::TIMESTAMPTZ THEN
    SELECT COALESCE(opening_balance, 0) INTO v_base_balance
    FROM public.stores
    WHERE id = p_store_id;
    v_base_time := '-infinity'::TIMESTAMPTZ;
  END IF;

  -- Calculate running balance starting from that base point
  SELECT
    v_base_balance
    -- Add sales outstanding created after base time (exclude soft-deleted ones)
    + COALESCE((
        SELECT SUM(outstanding_amount) FROM public.sales
        WHERE store_id = p_store_id AND deleted_at IS NULL AND created_at > v_base_time
      ), 0)
    -- Subtract payments received after base time (exclude soft-deleted ones)
    - COALESCE((
        SELECT SUM(total_amount) FROM public.transactions
        WHERE store_id = p_store_id AND deleted_at IS NULL AND created_at > v_base_time
      ), 0)
    -- Add payment returns completed after base time
    + COALESCE((
        SELECT SUM(return_amount) FROM public.payment_returns
        WHERE store_id = p_store_id AND status = 'completed' AND created_at > v_base_time
      ), 0)
    -- Subtract sale returns processed after base time
    - COALESCE((
        SELECT SUM(outstanding_adjustment) FROM public.sale_returns
        WHERE store_id = p_store_id AND status = 'completed' AND deleted_at IS NULL AND created_at > v_base_time
      ), 0)
    -- Add manual adjustments (increases)
    + COALESCE((
        SELECT SUM(correction_amount) FROM public.balance_corrections
        WHERE store_id = p_store_id AND status = 'approved' AND correction_type = 'increase' AND approved_at > v_base_time
      ), 0)
    -- Subtract manual adjustments (decreases)
    - COALESCE((
        SELECT SUM(correction_amount) FROM public.balance_corrections
        WHERE store_id = p_store_id AND status = 'approved' AND correction_type = 'decrease' AND approved_at > v_base_time
      ), 0)
  INTO v_outstanding;

  RETURN GREATEST(COALESCE(v_outstanding, 0), 0);
END;
$$;

-- 3. Update the recalc_store_outstanding trigger function
CREATE OR REPLACE FUNCTION public.recalc_store_outstanding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_id ELSE NEW.store_id END;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.stores
    SET outstanding = public.recalc_store_outstanding_logic(v_store_id),
        updated_at = NOW()
    WHERE id = v_store_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 4. Bind recalculated triggers to payment_returns and balance_corrections
DROP TRIGGER IF EXISTS trg_payment_returns_recalc_outstanding ON public.payment_returns;
CREATE TRIGGER trg_payment_returns_recalc_outstanding
AFTER INSERT OR UPDATE OR DELETE ON public.payment_returns
FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

DROP TRIGGER IF EXISTS trg_balance_corrections_recalc_outstanding ON public.balance_corrections;
CREATE TRIGGER trg_balance_corrections_recalc_outstanding
AFTER INSERT OR UPDATE OR DELETE ON public.balance_corrections
FOR EACH ROW EXECUTE FUNCTION public.recalc_store_outstanding();

-- 5. Drop old duplicate/blind triggers on sale_returns to prevent double-restoration
DROP TRIGGER IF EXISTS trg_sale_return_stock ON public.sale_returns;
DROP TRIGGER IF EXISTS trg_sale_return_outstanding ON public.sale_returns;

-- 6. Rewrite process_completed_sale_return to support dynamic agent vs warehouse stock restoration
CREATE OR REPLACE FUNCTION public.process_completed_sale_return(p_return_id UUID)
RETURNS TABLE(out_return_id UUID, out_success BOOLEAN, out_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return RECORD;
    v_sale RECORD;
    v_store RECORD;
    v_item RECORD;
    v_warehouse_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_return_amount NUMERIC := 0;
    v_is_agent BOOLEAN;
BEGIN
    -- Get return details
    SELECT * INTO v_return FROM sale_returns WHERE id = p_return_id AND status = 'approved';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Approved return not found';
    END IF;

    -- Get sale details
    SELECT * INTO v_sale FROM sales WHERE id = v_return.sale_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    -- Get store details
    SELECT * INTO v_store FROM stores WHERE id = v_sale.store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    -- Determine the warehouse to restore stock to
    v_warehouse_id := v_sale.warehouse_id;
    IF v_warehouse_id IS NULL THEN
        SELECT COALESCE(
          (SELECT warehouse_id FROM public.user_roles WHERE user_id = v_sale.recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
          (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
          (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
        ) INTO v_warehouse_id;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Warehouse not resolved for sale/return';
    END IF;

    -- Calculate return amount and process stock restoration for each item
    FOR v_item IN 
        SELECT sri.product_id, sri.quantity, sri.unit_price, sri.total
        FROM sale_return_items sri
        WHERE sri.return_id = p_return_id
    LOOP
        v_return_amount := v_return_amount + v_item.total;

        -- Check if it's NOT damaged (then restore stock)
        IF v_return.is_damaged IS NOT TRUE THEN
            -- Check if the return creator is an agent
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = v_return.created_by AND role = 'agent'
            ) INTO v_is_agent;

            IF v_is_agent THEN
                -- Restore to agent staff stock
                INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
                VALUES (v_return.created_by, v_item.product_id, v_warehouse_id, v_item.quantity, NOW(), NOW())
                ON CONFLICT (user_id, product_id, warehouse_id)
                DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW(),
                              last_sale_at = NOW();

                -- Log stock movement (return to agent)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock returned to agent holding for return ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
            ELSE
                -- Restore to warehouse stock
                INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, NOW())
                ON CONFLICT (product_id, warehouse_id)
                DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                              updated_at = NOW();

                -- Log stock movement (return to warehouse)
                INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
                VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock returned to warehouse for return ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
            END IF;
        ELSE
            -- Log as wastage (no stock restored anywhere)
            INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
            VALUES (v_item.product_id, v_warehouse_id, -v_item.quantity, 'wastage', 'Damaged items from return - wastage ' || v_return.display_id, v_return.id::text, v_return.created_by, NOW());
        END IF;
    END LOOP;

    -- Update outstanding adjustment in sale_returns
    UPDATE public.sale_returns
    SET outstanding_adjustment = v_return_amount,
        status = 'completed',
        completed_at = NOW(),
        processed_by = auth.uid()
    WHERE id = p_return_id;

    -- Recalculate store outstanding atomically
    UPDATE public.stores 
    SET outstanding = public.recalc_store_outstanding_logic(v_sale.store_id),
        updated_at = NOW()
    WHERE id = v_sale.store_id;

    -- Recalculate running balances timeline for consistency
    PERFORM public.recalc_running_balances(v_sale.store_id);

    -- Log activity
    INSERT INTO public.activity_log (action, entity_type, entity_id, user_id, details)
    VALUES ('sale_return_completed', 'sale_return', p_return_id, auth.uid(), jsonb_build_object(
        'sale_id', v_sale.id,
        'store_id', v_sale.store_id,
        'return_amount', v_return_amount,
        'is_damaged', v_return.is_damaged,
        'new_outstanding', public.recalc_store_outstanding_logic(v_sale.store_id)
    ));

    IF v_return.is_damaged IS TRUE THEN
        RETURN QUERY SELECT p_return_id, TRUE, 
            'Return processed: Damaged items logged as wastage, outstanding reduced by ₹' || v_return_amount;
    ELSE
        RETURN QUERY SELECT p_return_id, TRUE, 
            'Return processed: Stock restored, outstanding reduced by ₹' || v_return_amount;
    END IF;
END;
$$;

-- 7. Add stock restoration on hard-deletion of sale_items
CREATE OR REPLACE FUNCTION public.handle_sale_stock_restoration_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale RECORD;
  v_is_agent BOOLEAN;
  v_warehouse_id UUID;
  v_canceller_id UUID;
BEGIN
  -- Get the sale details
  SELECT * INTO v_sale FROM public.sales WHERE id = OLD.sale_id;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- The canceller is the current authenticated user (auth.uid()) or fallback to recorded_by
  v_canceller_id := COALESCE(auth.uid(), v_sale.recorded_by);
  v_warehouse_id := v_sale.warehouse_id;

  -- Check if the canceller is an agent
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_canceller_id AND role = 'agent'
  ) INTO v_is_agent;

  IF v_is_agent THEN
    -- Restore to agent staff stock
    INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
    VALUES (v_canceller_id, OLD.product_id, v_warehouse_id, OLD.quantity, NOW(), NOW())
    ON CONFLICT (user_id, product_id, warehouse_id)
    DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                  updated_at = NOW(),
                  last_sale_at = NOW();

    -- Log stock movement (return to agent)
    INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
    VALUES (OLD.product_id, v_warehouse_id, OLD.quantity, 'return', 'Stock restored to agent holding on sale deletion: ' || v_sale.display_id, v_sale.id::text, v_canceller_id, NOW());
  ELSE
    -- Restore to warehouse stock
    INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (OLD.product_id, v_warehouse_id, OLD.quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                  updated_at = NOW();

    -- Log stock movement (return to warehouse)
    INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
    VALUES (OLD.product_id, v_warehouse_id, OLD.quantity, 'return', 'Stock restored to warehouse on sale deletion: ' || v_sale.display_id, v_sale.id::text, v_canceller_id, NOW());
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_sale_delete ON public.sale_items;
CREATE TRIGGER trg_restore_stock_on_sale_delete
AFTER DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_stock_restoration_on_delete();

-- 8. Add stock restoration on soft-deletion (setting deleted_at) of sales
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
BEGIN
  -- Only fire if deleted_at transitioned from NULL to non-NULL
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_canceller_id := COALESCE(auth.uid(), NEW.recorded_by);
    v_warehouse_id := NEW.warehouse_id;

    -- Check if the canceller is an agent
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_canceller_id AND role = 'agent'
    ) INTO v_is_agent;

    -- Loop through all items of this sale and restore stock
    FOR v_item IN 
      SELECT product_id, quantity 
      FROM public.sale_items 
      WHERE sale_id = NEW.id
    LOOP
      IF v_is_agent THEN
        -- Restore to agent staff stock
        INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity, updated_at, last_sale_at)
        VALUES (v_canceller_id, v_item.product_id, v_warehouse_id, v_item.quantity, NOW(), NOW())
        ON CONFLICT (user_id, product_id, warehouse_id)
        DO UPDATE SET quantity = staff_stock.quantity + EXCLUDED.quantity,
                      updated_at = NOW(),
                      last_sale_at = NOW();

        -- Log stock movement (return to agent)
        INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock restored to agent holding on sale soft-delete: ' || NEW.display_id, NEW.id::text, v_canceller_id, NOW());
      ELSE
        -- Restore to warehouse stock
        INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, NOW())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                      updated_at = NOW();

        -- Log stock movement (return to warehouse)
        INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, reference_id, created_by, created_at)
        VALUES (v_item.product_id, v_warehouse_id, v_item.quantity, 'return', 'Stock restored to warehouse on sale soft-delete: ' || NEW.display_id, NEW.id::text, v_canceller_id, NOW());
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_sale_soft_delete ON public.sales;
CREATE TRIGGER trg_restore_stock_on_sale_soft_delete
AFTER UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_stock_restoration_on_soft_delete();
