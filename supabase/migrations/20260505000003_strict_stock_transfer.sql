-- Migration: Add strict stock checking to execute_stock_transfer
-- Date: 2026-05-05

CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
  v_source_warehouse_id UUID;
  v_rows_affected INTEGER;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id;

  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found: %', p_transfer_id;
  END IF;

  -- Only execute if approved or completed (idempotency)
  IF v_transfer.status = 'completed' THEN
    RETURN;
  END IF;

  IF NOT v_transfer.is_approved AND v_transfer.status != 'approved' THEN
    RAISE EXCEPTION 'Transfer must be approved before execution';
  END IF;

  CASE v_transfer.transfer_type
    WHEN 'warehouse_to_staff' THEN
      v_source_warehouse_id := v_transfer.from_warehouse_id;
      
      -- Subtract from warehouse with strict check
      UPDATE public.product_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND product_id = v_transfer.product_id
        AND quantity >= v_transfer.quantity;
      
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'Insufficient warehouse stock for transfer (Product: %, Available: %)', 
          (SELECT name FROM products WHERE id = v_transfer.product_id),
          COALESCE((SELECT quantity FROM product_stock WHERE warehouse_id = v_transfer.from_warehouse_id AND product_id = v_transfer.product_id), 0);
      END IF;

      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.from_warehouse_id, -v_transfer.quantity, 'transfer_out', v_transfer.description, v_transfer.created_by);

      INSERT INTO public.staff_stock (
        user_id, warehouse_id, product_id, quantity, 
        last_received_at, transfer_count
      )
      VALUES (
        v_transfer.to_user_id, v_source_warehouse_id, v_transfer.product_id, v_transfer.quantity,
        NOW(), 1
      )
      ON CONFLICT (user_id, product_id, warehouse_id)
      DO UPDATE SET
        quantity = public.staff_stock.quantity + v_transfer.quantity,
        updated_at = NOW(),
        last_received_at = NOW(),
        transfer_count = public.staff_stock.transfer_count + 1,
        is_negative = (public.staff_stock.quantity + v_transfer.quantity) < 0;

    WHEN 'staff_to_warehouse' THEN
      SELECT warehouse_id INTO v_source_warehouse_id
      FROM public.staff_stock
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id
      LIMIT 1;
      
      -- Subtract from staff with strict check
      UPDATE public.staff_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW(),
          is_negative = (quantity - v_transfer.quantity) < 0,
          last_sale_at = NOW()
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id
        AND warehouse_id = v_source_warehouse_id
        AND quantity >= v_transfer.quantity;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'Insufficient staff stock for transfer (Product: %, Available: %)', 
          (SELECT name FROM products WHERE id = v_transfer.product_id),
          COALESCE((SELECT quantity FROM staff_stock WHERE user_id = v_transfer.from_user_id AND product_id = v_transfer.product_id LIMIT 1), 0);
      END IF;

      UPDATE public.product_stock
      SET quantity = quantity + COALESCE(v_transfer.actual_quantity, v_transfer.quantity),
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.to_warehouse_id
        AND product_id = v_transfer.product_id;

      IF NOT FOUND THEN
        INSERT INTO public.product_stock (warehouse_id, product_id, quantity)
        VALUES (v_transfer.to_warehouse_id, v_transfer.product_id, COALESCE(v_transfer.actual_quantity, v_transfer.quantity));
      END IF;

      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, COALESCE(v_transfer.actual_quantity, v_transfer.quantity), 'transfer_in', v_transfer.description, v_transfer.created_by);

    WHEN 'staff_to_staff' THEN
      SELECT warehouse_id INTO v_source_warehouse_id
      FROM public.staff_stock
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id
      LIMIT 1;
      
      -- Subtract from staff with strict check
      UPDATE public.staff_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW(),
          is_negative = (quantity - v_transfer.quantity) < 0,
          last_sale_at = NOW()
      WHERE user_id = v_transfer.from_user_id
        AND product_id = v_transfer.product_id
        AND warehouse_id = v_source_warehouse_id
        AND quantity >= v_transfer.quantity;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'Insufficient staff stock for transfer (Product: %, Available: %)', 
          (SELECT name FROM products WHERE id = v_transfer.product_id),
          COALESCE((SELECT quantity FROM staff_stock WHERE user_id = v_transfer.from_user_id AND product_id = v_transfer.product_id LIMIT 1), 0);
      END IF;

      INSERT INTO public.staff_stock (
        user_id, warehouse_id, product_id, quantity,
        last_received_at, transfer_count
      )
      VALUES (
        v_transfer.to_user_id, v_source_warehouse_id, v_transfer.product_id, v_transfer.quantity,
        NOW(), 1
      )
      ON CONFLICT (user_id, product_id, warehouse_id)
      DO UPDATE SET
        quantity = public.staff_stock.quantity + v_transfer.quantity,
        updated_at = NOW(),
        last_received_at = NOW(),
        transfer_count = public.staff_stock.transfer_count + 1,
        is_negative = (public.staff_stock.quantity + v_transfer.quantity) < 0;

    WHEN 'warehouse_to_warehouse' THEN
      UPDATE public.product_stock
      SET quantity = quantity - v_transfer.quantity,
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND product_id = v_transfer.product_id
        AND quantity >= v_transfer.quantity;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'Insufficient source warehouse stock for transfer (Product: %, Available: %)', 
          (SELECT name FROM products WHERE id = v_transfer.product_id),
          COALESCE((SELECT quantity FROM product_stock WHERE warehouse_id = v_transfer.from_warehouse_id AND product_id = v_transfer.product_id), 0);
      END IF;

      UPDATE public.product_stock
      SET quantity = quantity + v_transfer.quantity,
          updated_at = NOW()
      WHERE warehouse_id = v_transfer.to_warehouse_id
        AND product_id = v_transfer.product_id;

      IF NOT FOUND THEN
        INSERT INTO public.product_stock (warehouse_id, product_id, quantity)
        VALUES (v_transfer.to_warehouse_id, v_transfer.product_id, v_transfer.quantity);
      END IF;

      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.from_warehouse_id, -v_transfer.quantity, 'transfer_out', v_transfer.description || ' (warehouse-to-warehouse)', v_transfer.created_by);
      
      INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reason, created_by)
      VALUES (v_transfer.product_id, v_transfer.to_warehouse_id, v_transfer.quantity, 'transfer_in', v_transfer.description || ' (warehouse-to-warehouse)', v_transfer.created_by);

  END CASE;

  UPDATE public.stock_transfers
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = p_transfer_id;

END;
$function$;
