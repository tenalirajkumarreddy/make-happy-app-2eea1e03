-- ==========================================================================
-- Fix: Atomic stock check within record_sale RPC
-- 
-- PROBLEM: Stock check happens before sale submission, allowing race condition
-- where two concurrent sales both check stock, both pass, both insert,
-- resulting in negative stock.
--
-- SOLUTION: Move stock check inside the atomic record_sale function with
-- FOR UPDATE locks on stock rows.
-- ==========================================================================

-- First, create a helper function to get user's warehouse
CREATE OR REPLACE FUNCTION public.get_user_warehouse_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.user_roles
  WHERE user_id = p_user_id
  LIMIT 1;
  
  RETURN v_warehouse_id;
END;
$$;

-- Enhanced record_sale with atomic stock check
CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id TEXT,
  p_store_id UUID,
  p_customer_id UUID,
  p_recorded_by UUID,
  p_logged_by UUID,
  p_total_amount NUMERIC,
  p_cash_amount NUMERIC,
  p_upi_amount NUMERIC,
  p_outstanding_amount NUMERIC,
  p_sale_items JSONB,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  sale_id UUID, 
  sale_display_id TEXT, 
  new_outstanding NUMERIC,
  stock_reserved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_old_outstanding NUMERIC;
  v_new_outstanding NUMERIC;
  v_computed_outstanding NUMERIC;
  v_credit_limit NUMERIC := 0;
  v_store_type_id UUID;
  v_store_customer_id UUID;
  v_kyc_status TEXT;
  v_credit_limit_override NUMERIC;
  v_caller_is_admin BOOLEAN;
  v_warehouse_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_available_stock NUMERIC;
  v_stock_after_sale NUMERIC;
  v_insufficient_stock_products TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get warehouse ID for stock operations
  v_warehouse_id := public.get_user_warehouse_id(p_recorded_by);
  
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'User has no warehouse assignment';
  END IF;

  -- Lock store row for outstanding update
  SELECT s.outstanding, s.store_type_id, s.customer_id
  INTO v_old_outstanding, v_store_type_id, v_store_customer_id
  FROM public.stores s
  WHERE s.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store % not found', p_store_id;
  END IF;

  -- Compute outstanding delta server-side
  v_computed_outstanding := p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0);
  v_new_outstanding := v_old_outstanding + v_computed_outstanding;

  -- Credit limit check
  SELECT c.kyc_status, c.credit_limit_override
  INTO v_kyc_status, v_credit_limit_override
  FROM public.customers c
  WHERE c.id = v_store_customer_id;

  IF v_credit_limit_override IS NOT NULL THEN
    v_credit_limit := v_credit_limit_override;
  ELSE
    SELECT CASE
      WHEN v_kyc_status IN ('verified', 'approved')
      THEN COALESCE(credit_limit_kyc, 0)
      ELSE COALESCE(credit_limit_no_kyc, 0)
    END
    INTO v_credit_limit
    FROM public.store_types
    WHERE id = v_store_type_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  ) INTO v_caller_is_admin;

  IF v_credit_limit > 0
    AND v_new_outstanding > v_credit_limit
    AND NOT v_caller_is_admin
  THEN
    RAISE EXCEPTION 'credit_limit_exceeded';
  END IF;

  -- ATOMIC STOCK CHECK: Check and reserve stock for each item
  -- This happens inside the same transaction as the sale insert
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    
    -- Lock the stock row and check availability
    SELECT current_stock INTO v_available_stock
    FROM public.product_stock
    WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
    FOR UPDATE;
    
    -- Also check staff stock for agents
    IF v_available_stock IS NULL OR v_available_stock < v_quantity THEN
      -- Check staff stock as fallback for agents
      SELECT ss.current_stock INTO v_available_stock
      FROM public.staff_stock ss
      WHERE ss.user_id = p_recorded_by 
        AND ss.product_id = v_product_id
        AND ss.warehouse_id = v_warehouse_id
      FOR UPDATE;
      
      IF v_available_stock IS NULL OR v_available_stock < v_quantity THEN
        -- Get product name for error message
        SELECT name INTO v_product_id
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID;
        
        v_insufficient_stock_products := array_append(
          v_insufficient_stock_products, 
          COALESCE(v_product_id::TEXT, 'Product ' || (v_item->>'product_id'))
        );
      END IF;
    END IF;
  END LOOP;

  -- If any products have insufficient stock, raise exception
  IF array_length(v_insufficient_stock_products, 1) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_stock_products, ', ');
  END IF;

  -- All checks passed - insert the sale
  INSERT INTO public.sales (
    display_id, store_id, customer_id, recorded_by, logged_by,
    total_amount, cash_amount, upi_amount, outstanding_amount,
    old_outstanding, new_outstanding, created_at
  ) VALUES (
    p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
    p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
    v_old_outstanding, v_new_outstanding,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  -- Insert sale items
  INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    (item->>'total_price')::NUMERIC
  FROM jsonb_array_elements(p_sale_items) AS item;

  -- DEDUCT STOCK: Now safely deduct stock (we know it's available)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    
    -- Try to deduct from warehouse stock first
    UPDATE public.product_stock
    SET current_stock = current_stock - v_quantity,
        updated_at = now()
    WHERE product_id = v_product_id 
      AND warehouse_id = v_warehouse_id
      AND current_stock >= v_quantity;
    
    -- If no rows updated, try staff stock (for agents selling from personal inventory)
    IF NOT FOUND THEN
      UPDATE public.staff_stock
      SET current_stock = current_stock - v_quantity,
          updated_at = now()
      WHERE user_id = p_recorded_by 
        AND product_id = v_product_id
        AND warehouse_id = v_warehouse_id
        AND current_stock >= v_quantity;
    END IF;
    
    -- Log the stock movement
    INSERT INTO public.stock_movements (
      product_id,
      warehouse_id,
      user_id,
      quantity,
      type,
      reference_id,
      notes
    ) VALUES (
      v_product_id,
      v_warehouse_id,
      p_recorded_by,
      -v_quantity,
      'sale',
      v_sale_id,
      'Stock deducted for sale ' || p_display_id
    );
  END LOOP;

  -- Update orders to delivered (only those with items in this sale)
  -- This prevents marking all pending orders as delivered when only some items are in the sale
  UPDATE public.orders o
  SET status = 'delivered', delivered_at = now()
  WHERE o.store_id = p_store_id 
    AND o.status = 'pending'
    AND EXISTS (
      -- Only mark orders whose items are in this sale
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = o.id
      AND oi.product_id IN (
        SELECT (item->>'product_id')::UUID 
        FROM jsonb_array_elements(p_sale_items) AS item
      )
    );

  -- Recalculate if backdated
  IF p_created_at IS NOT NULL THEN
    PERFORM public.recalc_running_balances(p_store_id);
  END IF;

  RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO authenticated;

-- Add comment documenting the fix
COMMENT ON FUNCTION public.record_sale IS 'Records a sale with atomic stock check and automatic stock deduction. Prevents race conditions by checking stock inside the transaction with FOR UPDATE locks.';
