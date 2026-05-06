-- Migration: Operator Dashboard and Stock Transfer Approval Fixes
-- Date: 2026-05-05

-- 1. Update approve_stock_transfer to support rejection reasons and clever notifications
CREATE OR REPLACE FUNCTION public.approve_stock_transfer(p_transfer_id uuid, p_approved_by uuid, p_rejection_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_is_approved BOOLEAN;
  v_transfer RECORD;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Get transfer details
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;

  -- Check if this is an approval or rejection
  v_is_approved := p_rejection_reason IS NULL;
  
  -- Update the transfer
  UPDATE stock_transfers
  SET is_approved = v_is_approved,
      approved_by = p_approved_by,
      approved_at = NOW(),
      rejection_reason = p_rejection_reason,
      status = CASE 
        WHEN v_is_approved THEN 'approved' 
        ELSE 'rejected' 
      END,
      updated_at = NOW()
  WHERE id = p_transfer_id
  RETURNING jsonb_build_object(
    'success', true,
    'status', status,
    'is_approved', is_approved
  ) INTO v_result;

  -- Mark existing notifications for this transfer as read for everyone (Clever Notifications)
  UPDATE notifications 
  SET is_read = true 
  WHERE entity_id = p_transfer_id::text 
    AND entity_type = 'stock_transfers';

  -- Send notification to the creator
  IF v_is_approved THEN
    v_title := 'Transfer Approved';
    v_message := 'Your stock transfer has been approved and processed.';
  ELSE
    v_title := 'Transfer Rejected';
    v_message := 'Your stock transfer has been rejected: ' || COALESCE(p_rejection_reason, 'No reason provided');
  END IF;

  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_transfer.created_by,
    v_title,
    v_message,
    'stock_transfer',
    'stock_transfers',
    p_transfer_id
  );

  -- If approved, execute the transfer
  IF v_is_approved THEN
    PERFORM execute_stock_transfer(p_transfer_id);
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- 2. Update accept_stock_transfer for clever notifications
CREATE OR REPLACE FUNCTION public.accept_stock_transfer(p_transfer_id uuid, p_accepted_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
  v_to_userId UUID;
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
  
  v_to_userId := v_transfer.to_user_id;
  
  IF v_transfer.from_warehouse_id IS NOT NULL THEN
    UPDATE warehouse_products 
    SET quantity = quantity - v_transfer.quantity 
    WHERE warehouse_id = v_transfer.from_warehouse_id AND product_id = v_transfer.product_id;
  END IF;
  
  INSERT INTO staff_products (user_id, product_id, quantity)
  VALUES (v_to_userId, v_transfer.product_id, v_transfer.quantity)
  ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = quantity + v_transfer.quantity;
  
  INSERT INTO stock_movements (product_id, quantity, movement_type, reference_id, moved_by)
  VALUES (v_transfer.product_id, v_transfer.quantity, 'transfer_accepted', p_transfer_id, p_accepted_by);
  
  -- Mark existing notifications as read (Clever Notifications)
  UPDATE notifications 
  SET is_read = true 
  WHERE entity_id = p_transfer_id::text 
    AND entity_type = 'stock_transfers';

  UPDATE stock_transfers SET 
    status = 'completed',
    approved_by = p_accepted_by,
    approved_at = NOW()
  WHERE id = p_transfer_id;
  
  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (v_transfer.created_by, 'Transfer Accepted', 'The recipient has accepted the transfer', 'stock_transfer', 'stock_transfers', p_transfer_id);
END;
$function$;

-- 3. Ensure profiles are viewable by operators
DROP POLICY IF EXISTS "Operators can view staff profiles" ON profiles;
CREATE POLICY "Operators can view staff profiles" ON profiles
  FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('super_admin', 'manager', 'operator', 'agent', 'marketer')
  );
