-- Migration: Add cancel_order RPC
-- Server-side order cancellation with auth.uid() to avoid FK constraint issues

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only pending or confirmed orders can be cancelled');
  END IF;

  UPDATE orders
  SET status = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id
    AND status IN ('pending', 'confirmed');

  -- Soft-delete associated proforma invoice
  UPDATE proforma_invoices
  SET status = 'cancelled', deleted_at = NOW()
  WHERE order_id = p_order_id;

  -- Log activity
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_user_id, 'Cancelled order', 'order', p_order_id, jsonb_build_object('reason', p_reason, 'display_id', v_order.display_id));

  -- Notify customer if linked
  IF v_order.customer_id IS NOT NULL THEN
    DECLARE
      v_cust_user_id UUID;
    BEGIN
      SELECT user_id INTO v_cust_user_id FROM customers WHERE id = v_order.customer_id;
      IF v_cust_user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (v_cust_user_id, 'Order Cancelled', format('Order %s was cancelled. Reason: %s', v_order.display_id, p_reason), 'order', 'order', p_order_id::TEXT);
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'display_id', v_order.display_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
