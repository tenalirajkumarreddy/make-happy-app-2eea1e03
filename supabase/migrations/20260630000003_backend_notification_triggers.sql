-- Helper function to notify admins/managers
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  SELECT user_id, p_title, p_message, p_type, p_entity_type, p_entity_id
  FROM public.user_roles
  WHERE role IN ('super_admin', 'manager', 'operator')
  ON CONFLICT DO NOTHING;
END;
$$;


-- 1. HANDOVERS TRIGGER
CREATE OR REPLACE FUNCTION public.trg_handovers_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On Insert (New Handover)
  IF TG_OP = 'INSERT' THEN
    IF NEW.handed_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.handed_to,
        'New Handover',
        format('You received a new handover of %s', NEW.cash_amount),
        'handover', 'handover', NEW.id::text
      );
    END IF;
  
  -- On Update (Status changes)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'confirmed' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Handover Confirmed',
        format('Your handover of %s was confirmed', NEW.cash_amount),
        'handover', 'handover', NEW.id::text
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Handover Rejected',
        format('Your handover of %s was rejected', NEW.cash_amount),
        'handover', 'handover', NEW.id::text
      );
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.handed_to IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (
          NEW.handed_to,
          'Handover Cancelled',
          format('A handover of %s to you was cancelled', NEW.cash_amount),
          'handover', 'handover', NEW.id::text
        );
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_handovers_notifications ON public.handovers;
CREATE TRIGGER trg_handovers_notifications
  AFTER INSERT OR UPDATE ON public.handovers
  FOR EACH ROW EXECUTE FUNCTION public.trg_handovers_notifications();


-- 2. EXPENSE CLAIMS TRIGGER
CREATE OR REPLACE FUNCTION public.trg_expense_claims_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On Insert (New Claim)
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins(
      'New Expense Claim',
      format('New expense claim for %s requires review', NEW.amount),
      'system', 'expense_claim', NEW.id::text
    );
  
  -- On Update (Status changes)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Expense Claim Approved',
        format('Your expense claim for %s was approved', NEW.amount),
        'system', 'expense_claim', NEW.id::text
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Expense Claim Rejected',
        format('Your expense claim for %s was rejected', NEW.amount),
        'system', 'expense_claim', NEW.id::text
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_claims_notifications ON public.expense_claims;
CREATE TRIGGER trg_expense_claims_notifications
  AFTER INSERT OR UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_expense_claims_notifications();


-- 3. CUSTOMER ORDERS TRIGGER
CREATE OR REPLACE FUNCTION public.trg_customer_orders_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_user_id uuid;
BEGIN
  -- On Insert (New Order)
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins(
      'New Customer Order',
      format('Order %s has been created', NEW.display_id),
      'order_created', 'proforma_invoices', NEW.id::text
    );

    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.assigned_to,
        'New Order Assigned',
        format('Order %s has been assigned to you', NEW.display_id),
        'order_assigned', 'proforma_invoices', NEW.id::text
      );
    END IF;
  
  -- On Update
  ELSIF TG_OP = 'UPDATE' THEN
    -- Assignment changed
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.assigned_to,
        'Order Assigned',
        format('Order %s has been assigned to you', NEW.display_id),
        'order_assigned', 'proforma_invoices', NEW.id::text
      );
    END IF;

    -- Status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      -- Find customer's user_id
      SELECT user_id INTO v_customer_user_id FROM public.customers WHERE id = NEW.customer_id;

      IF NEW.status = 'fulfilled' AND v_customer_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (
          v_customer_user_id,
          'Order Fulfilled',
          format('Your order %s has been fulfilled', NEW.display_id),
          'order_fulfilled', 'proforma_invoices', NEW.id::text
        );
      ELSIF NEW.status = 'cancelled' AND v_customer_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (
          v_customer_user_id,
          'Order Cancelled',
          format('Your order %s has been cancelled', NEW.display_id),
          'order', 'proforma_invoices', NEW.id::text
        );
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_orders_notifications ON public.proforma_invoices;
CREATE TRIGGER trg_customer_orders_notifications
  AFTER INSERT OR UPDATE ON public.proforma_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_customer_orders_notifications();


-- 4. STOCK TRANSFERS TRIGGER
CREATE OR REPLACE FUNCTION public.trg_stock_transfers_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On Insert (New Transfer)
  IF TG_OP = 'INSERT' THEN
    IF NEW.to_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.to_user,
        'New Stock Transfer',
        'You have received a new stock transfer to accept',
        'stock_transfer', 'stock_transfers', NEW.id::text
      );
    END IF;
  
  -- On Update (Status changes)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.created_by,
        'Transfer Accepted',
        'Your stock transfer was accepted',
        'stock_transfer', 'stock_transfers', NEW.id::text
      );
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.to_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (
          NEW.to_user,
          'Transfer Cancelled',
          'A pending stock transfer to you was cancelled',
          'stock_transfer', 'stock_transfers', NEW.id::text
        );
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_transfers_notifications ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfers_notifications
  AFTER INSERT OR UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_transfers_notifications();


-- 5. STOCK REQUESTS TRIGGER
CREATE OR REPLACE FUNCTION public.trg_stock_requests_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On Insert (New Request)
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins(
      'New Stock Request',
      'A new stock request requires your review',
      'stock_request', 'stock_requests', NEW.id::text
    );
  
  -- On Update (Status changes)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Stock Request Approved',
        'Your stock request was approved',
        'stock_request', 'stock_requests', NEW.id::text
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
      VALUES (
        NEW.user_id,
        'Stock Request Rejected',
        'Your stock request was rejected',
        'stock_request', 'stock_requests', NEW.id::text
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_requests_notifications ON public.stock_requests;
CREATE TRIGGER trg_stock_requests_notifications
  AFTER INSERT OR UPDATE ON public.stock_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_requests_notifications();
