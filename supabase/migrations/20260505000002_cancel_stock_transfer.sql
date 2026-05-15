-- Migration: Add cancel_stock_transfer RPC
-- Date: 2026-05-05

CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid, p_cancelled_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_transfer RECORD;
BEGIN
  -- Get transfer details
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;

  -- Check if user is the creator
  IF v_transfer.created_by != p_cancelled_by THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the creator can cancel this transfer');
  END IF;

  -- Check if status is valid for cancellation
  IF v_transfer.status NOT IN ('pending', 'awaiting_acceptance') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only pending or awaiting transfers can be cancelled');
  END IF;
  
  -- Update the transfer
  UPDATE stock_transfers
  SET status = 'cancelled',
      rejection_reason = 'Cancelled by creator',
      updated_at = NOW()
  WHERE id = p_transfer_id
  RETURNING jsonb_build_object(
    'success', true,
    'status', status
  ) INTO v_result;

  -- Mark existing notifications for this transfer as read for everyone (Clever Notifications)
  UPDATE notifications 
  SET is_read = true 
  WHERE entity_id = p_transfer_id::text 
    AND entity_type = 'stock_transfers';

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;
