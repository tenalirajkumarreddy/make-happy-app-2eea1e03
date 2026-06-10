-- Fix all RPCs that insert into warehouse-scoped tables without setting warehouse_id,
-- + backfill existing NULL warehouse_ids across all tables.

-- FIX 1: create_handover_with_type — resolve and set warehouse_id
CREATE OR REPLACE FUNCTION public.create_handover_with_type(p_user_id uuid, p_handed_to uuid, p_cash_amount numeric DEFAULT 0, p_upi_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_handover_type text DEFAULT 'transfer'::text)
 RETURNS TABLE(id uuid, user_id uuid, handed_to uuid, cash_amount numeric, upi_amount numeric, status text, handover_type text)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
#variable_conflict use_column
DECLARE
    v_handover_id UUID; v_display_id TEXT; v_holding RECORD; v_total_handover NUMERIC; v_warehouse_id UUID;
BEGIN
    IF p_user_id IS NULL OR p_handed_to IS NULL THEN RAISE EXCEPTION 'Both sender and recipient are required'; END IF;
    IF p_user_id = p_handed_to THEN RAISE EXCEPTION 'Cannot hand over to yourself'; END IF;
    v_total_handover := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);
    IF v_total_handover <= 0 THEN RAISE EXCEPTION 'Handover amount must be greater than zero'; END IF;
    SELECT * INTO v_holding FROM public.get_agent_cash_holding(p_user_id);
    IF v_holding IS NULL THEN v_holding.net_holding := 0; END IF;
    IF EXISTS (SELECT 1 FROM public.handovers h WHERE h.user_id = p_user_id AND h.handed_to = p_handed_to AND h.handover_date = CURRENT_DATE AND h.status = 'awaiting_confirmation') THEN
        RAISE EXCEPTION 'DUPLICATE: You already have a pending handover to this recipient today';
    END IF;
    BEGIN SELECT public.generate_display_id('handovers', 'HND') INTO v_display_id; EXCEPTION WHEN OTHERS THEN v_display_id := 'HND-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 10000)::text; END;
    SELECT COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = p_user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) INTO v_warehouse_id;
    INSERT INTO public.handovers ("user_id", "handed_to", "handover_date", "cash_amount", "upi_amount", "status", "handover_type", "notes", "created_at", "updated_at", "warehouse_id")
    VALUES (p_user_id, p_handed_to, CURRENT_DATE, COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), 'awaiting_confirmation', p_handover_type, p_notes, NOW(), NOW(), v_warehouse_id)
    RETURNING public.handovers.id INTO v_handover_id;
    INSERT INTO public.activity_logs ("user_id", "action", "entity_type", "entity_id", "metadata")
    VALUES (p_user_id, 'Created handover request', 'handover', v_handover_id, jsonb_build_object('display_id', v_display_id, 'cash_amount', p_cash_amount, 'upi_amount', p_upi_amount, 'total', v_total_handover, 'handed_to', p_handed_to, 'handover_type', p_handover_type));
    RETURN QUERY SELECT v_handover_id, p_user_id, p_handed_to, COALESCE(p_cash_amount, 0), COALESCE(p_upi_amount, 0), 'awaiting_confirmation'::TEXT, p_handover_type;
END;
$function$;

-- FIX 2: adjust_staff_holding_balance — resolve and set warehouse_id
CREATE OR REPLACE FUNCTION public.adjust_staff_holding_balance(
  p_target_user_id UUID, p_admin_id UUID, p_cash_adjustment NUMERIC DEFAULT 0, p_upi_adjustment NUMERIC DEFAULT 0, p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, cash_balance NUMERIC, upi_balance NUMERIC, total_balance NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_current_account RECORD; v_new_cash NUMERIC; v_new_upi NUMERIC; v_warehouse_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_admin_id AND role IN ('super_admin', 'manager')) THEN RAISE EXCEPTION 'Only admins can adjust holding balances'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_target_user_id AND role IN ('agent', 'marketer', 'operator', 'manager')) THEN RAISE EXCEPTION 'Target user does not have a staff account'; END IF;
  SELECT COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = p_target_user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) INTO v_warehouse_id;
  SELECT * INTO v_current_account FROM public.staff_cash_accounts WHERE user_id = p_target_user_id;
  IF v_current_account IS NULL THEN
    INSERT INTO public.staff_cash_accounts (user_id, cash_balance, upi_balance, warehouse_id) VALUES (p_target_user_id, p_cash_adjustment, p_upi_adjustment, v_warehouse_id) RETURNING * INTO v_current_account;
  ELSE
    UPDATE public.staff_cash_accounts SET cash_balance = COALESCE(cash_balance, 0) + p_cash_adjustment, upi_balance = COALESCE(upi_balance, 0) + p_upi_adjustment, updated_at = now() WHERE user_id = p_target_user_id RETURNING * INTO v_current_account;
  END IF;
  v_new_cash := COALESCE(v_current_account.cash_balance, 0); v_new_upi := COALESCE(v_current_account.upi_balance, 0);
  INSERT INTO public.income_entries (recorded_by, warehouse_id, source_type, source_id, cash_amount, upi_amount, total_amount, notes)
  VALUES (p_admin_id, v_warehouse_id, 'adjustment', NULL, p_cash_adjustment, p_upi_adjustment, p_cash_adjustment + p_upi_adjustment, CASE WHEN p_reason IS NOT NULL THEN 'Admin adjustment: ' || p_reason ELSE 'Admin holding balance adjustment' END);
  RETURN QUERY SELECT p_target_user_id, v_new_cash, v_new_upi, v_new_cash + v_new_upi;
END;
$$;

-- FIX 3: record_sale — add warehouse_id to sale_items insert
CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id TEXT, p_store_id UUID, p_customer_id UUID, p_recorded_by UUID, p_logged_by UUID,
  p_total_amount NUMERIC, p_cash_amount NUMERIC, p_upi_amount NUMERIC, p_outstanding_amount NUMERIC, p_sale_items JSONB,
  p_created_at TIMESTAMPTZ DEFAULT NULL, p_expected_outstanding NUMERIC DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id UUID; v_old_outstanding NUMERIC; v_new_outstanding NUMERIC;
  v_computed_outstanding NUMERIC; v_final_total NUMERIC;
  v_warehouse_id UUID; v_target_user_id UUID;
  v_item record; v_product_id UUID; v_quantity NUMERIC;
  v_available_stock NUMERIC; v_product_name TEXT;
  v_insufficient_stock_products TEXT[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_final_total := COALESCE(p_total_amount, 0);
  IF v_final_total <= 0 THEN RAISE EXCEPTION 'Sale amount must be positive'; END IF;
  PERFORM id FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Store % not found', p_store_id; END IF;
  SELECT COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) INTO v_warehouse_id;
  SELECT outstanding INTO v_old_outstanding FROM public.stores WHERE id = p_store_id;
  IF p_expected_outstanding IS NOT NULL AND v_old_outstanding != p_expected_outstanding THEN
    RAISE EXCEPTION 'Outstanding balance changed since page load. Expected: %, Actual: %. Please refresh and try again.', p_expected_outstanding, v_old_outstanding;
  END IF;
  v_computed_outstanding := GREATEST(COALESCE(p_outstanding_amount, 0), 0);
  v_new_outstanding := v_old_outstanding + v_computed_outstanding;
  IF p_sale_items IS NOT NULL AND jsonb_array_length(p_sale_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items) WITH ORDINALITY AS t(elem, rn) LOOP
      v_product_id := (v_item.elem->>'product_id')::UUID; v_quantity := (v_item.elem->>'quantity')::NUMERIC;
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      SELECT COALESCE(ps.quantity, 0) INTO v_available_stock FROM public.product_stock ps WHERE ps.product_id = v_product_id AND ps.warehouse_id = v_warehouse_id;
      IF v_available_stock < v_quantity THEN v_insufficient_stock_products := array_append(v_insufficient_stock_products, COALESCE(v_product_name, 'Product ' || v_product_id::TEXT)); END IF;
    END LOOP;
  END IF;
  IF array_length(v_insufficient_stock_products, 1) > 0 THEN RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_stock_products, ', '); END IF;
  INSERT INTO public.sales (display_id, store_id, customer_id, recorded_by, logged_by, total_amount, cash_amount, upi_amount, outstanding_amount, old_outstanding, new_outstanding, created_at, warehouse_id, created_by)
  VALUES (p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by, v_final_total, p_cash_amount, p_upi_amount, v_computed_outstanding, v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()), v_warehouse_id, p_recorded_by)
  RETURNING id INTO v_sale_id;
  INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
  SELECT v_sale_id, (item->>'product_id')::UUID, (item->>'quantity')::NUMERIC, (item->>'unit_price')::NUMERIC, (item->>'total_price')::NUMERIC, v_warehouse_id FROM jsonb_array_elements(p_sale_items) AS item;
  UPDATE public.orders o SET status = 'delivered', delivered_at = now() WHERE o.store_id = p_store_id AND o.status = 'pending'
  AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.product_id IN (SELECT (item->>'product_id')::UUID FROM jsonb_array_elements(p_sale_items) AS item));
  IF p_created_at IS NOT NULL THEN PERFORM public.recalc_running_balances(p_store_id); END IF;
  RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;

-- FIX 4: record_vendor_payment — add warehouse_id
CREATE OR REPLACE FUNCTION record_vendor_payment(
  p_vendor_id UUID, p_amount NUMERIC, p_payment_method TEXT DEFAULT 'cash',
  p_reference_number TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_user_id UUID DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_payment_id UUID; v_display_id TEXT; v_warehouse_id UUID;
BEGIN
  SELECT 'PAY-' || LPAD(NEXTVAL('pay_display_seq')::TEXT, 6, '0') INTO v_display_id;
  SELECT COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = p_user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT warehouse_id FROM public.vendors WHERE id = p_vendor_id LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) INTO v_warehouse_id;
  INSERT INTO vendor_payments (display_id, vendor_id, payment_date, amount, payment_method, payment_reference, status, notes, created_by, warehouse_id)
  VALUES (v_display_id, p_vendor_id, CURRENT_DATE, p_amount, p_payment_method, p_reference_number, 'completed', p_notes, p_user_id, v_warehouse_id)
  RETURNING id INTO v_payment_id;
  RETURN v_display_id;
END;
$$;

-- Backfill warehouse_id on all warehouse-scoped tables where NULL
UPDATE public.handovers SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = handovers.user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.staff_cash_accounts SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = staff_cash_accounts.user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.income_entries SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.stores WHERE id = income_entries.source_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.sale_items SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.sales WHERE id = sale_items.sale_id), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.vendor_payments SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.vendors WHERE id = vendor_payments.vendor_id), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.orders SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.stores WHERE id = orders.store_id), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.customers SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = customers.user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.stores SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = stores.created_by AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.expense_claims SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = expense_claims.user_id AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
UPDATE public.workers SET warehouse_id = COALESCE((SELECT warehouse_id FROM public.user_roles WHERE user_id = workers.created_by AND warehouse_id IS NOT NULL LIMIT 1), (SELECT id FROM public.warehouses LIMIT 1)) WHERE warehouse_id IS NULL;
