-- supabase/migrations/20260418000006_inventory_management.sql

-- 1. Tables for Inventory Management

-- staff_stock: Tracks how much stock each staff member holds for each product.
CREATE TABLE IF NOT EXISTS public.staff_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    is_negative boolean NOT NULL DEFAULT false,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()),
    CONSTRAINT staff_stock_unique UNIQUE (user_id, warehouse_id, product_id)
);
COMMENT ON TABLE public.staff_stock IS 'Tracks current stock holdings for each staff member.';

-- stock_transfers: A log of all stock movements between warehouse and staff.
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id text NOT NULL,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    transfer_type text NOT NULL, -- warehouse_to_staff, staff_to_warehouse, staff_to_staff
    from_warehouse_id uuid REFERENCES public.warehouses(id),
    from_user_id uuid REFERENCES public.users(id),
    to_warehouse_id uuid REFERENCES public.warehouses(id),
    to_user_id uuid REFERENCES public.users(id),
    quantity numeric NOT NULL,
    status text NOT NULL, -- pending, approved, rejected, completed
    actual_quantity numeric,
    difference numeric,
    action_taken text, -- keep or flag
    reviewed_by uuid REFERENCES public.users(id),
    reviewed_at timestamptz,
    description text,
    created_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT timezone('utc'::text, now())
);
COMMENT ON TABLE public.stock_transfers IS 'Logs all stock movements between warehouse, staff, and other staff.';

-- staff_performance_logs: Logs discrepancies found during stock returns.
CREATE TABLE IF NOT EXISTS public.staff_performance_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    log_type text NOT NULL, -- stock_discrepancy, stock_return_variance
    product_id uuid NOT NULL REFERENCES public.products(id),
    transfer_id uuid REFERENCES public.stock_transfers(id),
    expected_quantity numeric,
    actual_quantity numeric,
    difference numeric,
    notes text,
    created_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT timezone('utc'::text, now())
);
COMMENT ON TABLE public.staff_performance_logs IS 'Tracks staff performance related to stock management.';


-- 2. RLS Policies
ALTER TABLE public.staff_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON public.staff_stock
  FOR ALL USING (warehouse_id IN (SELECT public.get_my_claim('warehouse_id')::uuid));

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON public.stock_transfers
  FOR ALL USING (warehouse_id IN (SELECT public.get_my_claim('warehouse_id')::uuid));

ALTER TABLE public.staff_performance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON public.staff_performance_logs
  FOR ALL USING (warehouse_id IN (SELECT public.get_my_claim('warehouse_id')::uuid));


-- 3. RPC Functions

-- Helper function to execute the stock movement
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  transfer record;
  current_warehouse_stock numeric;
  current_from_staff_stock numeric;
BEGIN
  SELECT * INTO transfer FROM public.stock_transfers WHERE id = p_transfer_id;

  -- WAREHOUSE -> STAFF
  IF transfer.transfer_type = 'warehouse_to_staff' THEN
    -- Decrement warehouse stock
    UPDATE public.product_stock SET quantity = quantity - transfer.quantity WHERE product_id = transfer.product_id AND warehouse_id = transfer.from_warehouse_id;
    -- Upsert staff stock
    INSERT INTO public.staff_stock (user_id, warehouse_id, product_id, quantity)
    VALUES (transfer.to_user_id, transfer.warehouse_id, transfer.product_id, transfer.quantity)
    ON CONFLICT (user_id, warehouse_id, product_id)
    DO UPDATE SET quantity = staff_stock.quantity + transfer.quantity;

  -- STAFF -> WAREHOUSE
  ELSIF transfer.transfer_type = 'staff_to_warehouse' THEN
    -- Decrement staff stock
    UPDATE public.staff_stock SET quantity = quantity - transfer.quantity WHERE user_id = transfer.from_user_id AND product_id = transfer.product_id;
    -- Increment warehouse stock
    UPDATE public.product_stock SET quantity = quantity + transfer.quantity WHERE product_id = transfer.product_id AND warehouse_id = transfer.to_warehouse_id;

  -- STAFF -> STAFF
  ELSIF transfer.transfer_type = 'staff_to_staff' THEN
    -- Decrement source staff stock
    UPDATE public.staff_stock SET quantity = quantity - transfer.quantity WHERE user_id = transfer.from_user_id AND product_id = transfer.product_id;
    -- Upsert destination staff stock
    INSERT INTO public.staff_stock (user_id, warehouse_id, product_id, quantity)
    VALUES (transfer.to_user_id, transfer.warehouse_id, transfer.product_id, transfer.quantity)
    ON CONFLICT (user_id, warehouse_id, product_id)
    DO UPDATE SET quantity = staff_stock.quantity + transfer.quantity;
  END IF;
END;
$$;

-- Function to record a new stock transfer
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
AS $$
DECLARE
  new_transfer_id uuid;
  v_display_id text;
  v_status text;
  v_warehouse_id uuid;
  current_stock numeric;
  user_role text;
BEGIN
  v_warehouse_id := COALESCE(p_from_warehouse_id, p_to_warehouse_id);
  SELECT role INTO user_role FROM public.user_roles WHERE user_id = auth.uid() AND warehouse_id = v_warehouse_id;

  -- Validation
  IF p_transfer_type = 'warehouse_to_staff' THEN
    SELECT quantity INTO current_stock FROM public.product_stock WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;
    IF current_stock IS NULL OR current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in warehouse. Available: %', COALESCE(current_stock, 0);
    END IF;
    v_status := 'completed';
  ELSIF p_transfer_type = 'staff_to_staff' THEN
    SELECT quantity INTO current_stock FROM public.staff_stock WHERE user_id = p_from_user_id AND product_id = p_product_id;
     IF current_stock IS NULL OR current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock with staff. Available: %', COALESCE(current_stock, 0);
    END IF;
    v_status := 'completed';
  ELSIF p_transfer_type = 'staff_to_warehouse' THEN
    IF user_role NOT IN ('super_admin', 'manager') THEN
        RAISE EXCEPTION 'Only admins or managers can approve staff to warehouse returns.';
    END IF;
    v_status := 'pending'; -- Requires approval
  ELSE
    RAISE EXCEPTION 'Invalid transfer type';
  END IF;

  -- Generate display ID
  v_display_id := public.generate_display_id('stock_transfers', 'STF');

  -- Insert transfer record
  INSERT INTO public.stock_transfers (display_id, warehouse_id, product_id, transfer_type, from_warehouse_id, from_user_id, to_warehouse_id, to_user_id, quantity, status, description, created_by)
  VALUES (v_display_id, v_warehouse_id, p_product_id, p_transfer_type, p_from_warehouse_id, p_from_user_id, p_to_warehouse_id, p_to_user_id, p_quantity, v_status, p_reason, auth.uid())
  RETURNING id INTO new_transfer_id;

  -- Auto-execute if not pending
  IF v_status = 'completed' THEN
    PERFORM public.execute_stock_transfer(new_transfer_id);
  END IF;

  RETURN new_transfer_id;
END;
$$;

-- Function to process a stock return (a pending S->W transfer)
CREATE OR REPLACE FUNCTION public.process_stock_return(
    p_transfer_id uuid,
    p_actual_quantity numeric,
    p_action text,
    p_notes text,
    p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  transfer record;
  v_difference numeric;
  user_role text;
BEGIN
  SELECT * INTO transfer FROM public.stock_transfers WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending transfer not found or already processed.';
  END IF;

  SELECT role INTO user_role FROM public.user_roles WHERE user_id = auth.uid() AND warehouse_id = transfer.warehouse_id;
  IF user_role NOT IN ('super_admin', 'manager') THEN
    RAISE EXCEPTION 'Only admins or managers can process returns.';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.stock_transfers SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_transfer_id;
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
    description = concat_ws(E'\n', description, 'Reviewer Notes: ' || p_notes),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_transfer_id;

  -- Decrement staff stock by actual amount received
  UPDATE public.staff_stock SET quantity = quantity - p_actual_quantity WHERE user_id = transfer.from_user_id AND product_id = transfer.product_id;
  -- Increment warehouse stock by actual amount
  UPDATE public.product_stock SET quantity = quantity + p_actual_quantity WHERE product_id = transfer.product_id AND warehouse_id = transfer.to_warehouse_id;

  -- Handle discrepancy
  IF v_difference > 0 THEN
    IF p_action = 'flag' THEN
      -- Log performance issue
      INSERT INTO public.staff_performance_logs (user_id, warehouse_id, log_type, product_id, transfer_id, expected_quantity, actual_quantity, difference, notes, created_by)
      VALUES (transfer.from_user_id, transfer.warehouse_id, 'stock_return_variance', transfer.product_id, p_transfer_id, transfer.quantity, p_actual_quantity, v_difference, p_notes, auth.uid());
    ELSIF p_action = 'keep' THEN
      -- The difference remains with the user, so we add it back to their stock
      UPDATE public.staff_stock SET quantity = quantity + v_difference WHERE user_id = transfer.from_user_id AND product_id = transfer.product_id;
    END IF;
  END IF;

END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_return(uuid, numeric, text, text, boolean) TO authenticated;

-- 4. Function to get products with detailed stock breakdown
CREATE TYPE staff_holding AS (
  user_id uuid,
  full_name text,
  role text,
  quantity numeric
);

CREATE OR REPLACE FUNCTION public.get_products_with_stock_breakdown(p_warehouse_id uuid)
RETURNS TABLE (
  id uuid,
  display_id text,
  name text,
  sku text,
  category_id uuid,
  category_name text,
  unit text,
  price numeric,
  image_url text,
  is_active boolean,
  warehouse_quantity numeric,
  staff_holdings staff_holding[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    p.display_id,
    p.name,
    p.sku,
    p.category_id,
    c.name as category_name,
    p.unit,
    p.price,
    p.image_url,
    p.is_active,
    COALESCE(ps.quantity, 0) as warehouse_quantity,
    ARRAY(
      SELECT (ss.user_id, u.full_name, ur.role, ss.quantity)::staff_holding
      FROM public.staff_stock ss
      JOIN public.users u ON ss.user_id = u.id
      JOIN public.user_roles ur ON u.id = ur.user_id AND ur.warehouse_id = p_warehouse_id
      WHERE ss.product_id = p.id AND ss.warehouse_id = p_warehouse_id AND ss.quantity > 0
    ) as staff_holdings
  FROM public.products p
  LEFT JOIN public.product_stock ps ON p.id = ps.product_id AND ps.warehouse_id = p_warehouse_id
  LEFT JOIN public.categories c ON p.category_id = c.id
  WHERE p.warehouse_id = p_warehouse_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_products_with_stock_breakdown(uuid) TO authenticated;
