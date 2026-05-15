-- Migration: Fix accept_stock_transfer and migrate staff_products
-- Date: 2026-05-06

-- 1. Refactor accept_stock_transfer to use the unified execute_stock_transfer
CREATE OR REPLACE FUNCTION public.accept_stock_transfer(p_transfer_id uuid, p_accepted_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  
  IF v_transfer.status != 'awaiting_acceptance' THEN
    RAISE EXCEPTION 'Transfer is not awaiting acceptance';
  END IF;
  
  IF v_transfer.to_user_id != p_accepted_by AND v_transfer.to_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'You are not the recipient';
  END IF;

  -- Mark existing notifications as read
  UPDATE notifications 
  SET is_read = true 
  WHERE entity_id = p_transfer_id::text 
    AND entity_type = 'stock_transfers';

  -- Update status to approved so execute_stock_transfer can process it
  UPDATE stock_transfers SET 
    status = 'approved',
    approved_by = p_accepted_by,
    approved_at = NOW()
  WHERE id = p_transfer_id;
  
  -- Send notification to creator
  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (v_transfer.created_by, 'Transfer Accepted', 'The recipient has accepted the transfer', 'stock_transfer', 'stock_transfers', p_transfer_id);

  -- Execute the transfer using the unified logic
  PERFORM execute_stock_transfer(p_transfer_id);
END;
$function$;


-- 2. Migrate existing data from staff_products to staff_stock (if staff_products exists)
DO $$
DECLARE
    r RECORD;
    v_warehouse_id UUID;
BEGIN
    -- Check if staff_products table exists before migrating
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_products' AND table_schema = 'public') THEN
        FOR r IN SELECT * FROM public.staff_products WHERE quantity > 0 LOOP
            -- Try to find the warehouse_id for the user from user_roles
            SELECT warehouse_id INTO v_warehouse_id FROM public.user_roles WHERE user_id = r.user_id AND warehouse_id IS NOT NULL LIMIT 1;
            
            -- Fallback to the first available warehouse if user has no specific warehouse
            IF v_warehouse_id IS NULL THEN
                SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;
            END IF;

            IF v_warehouse_id IS NOT NULL THEN
                INSERT INTO public.staff_stock (user_id, product_id, warehouse_id, quantity)
                VALUES (r.user_id, r.product_id, v_warehouse_id, r.quantity)
                ON CONFLICT (user_id, product_id, warehouse_id)
                DO UPDATE SET quantity = staff_stock.quantity + r.quantity;
                
                -- Set old quantity to 0 to prevent double counting
                UPDATE public.staff_products SET quantity = 0 WHERE id = r.id;
            END IF;
        END LOOP;
    END IF;
END $$;
