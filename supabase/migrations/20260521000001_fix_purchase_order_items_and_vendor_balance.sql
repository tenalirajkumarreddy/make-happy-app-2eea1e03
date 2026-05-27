-- Fix purchase order items FK + vendor balance data flow
-- =======================================================

-- 1. Allow purchase_items to reference purchase_orders before a purchase is finalized
ALTER TABLE purchase_items
  ADD COLUMN purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ALTER COLUMN purchase_id DROP NOT NULL;

CREATE INDEX idx_purchase_items_purchase_order_id ON purchase_items(purchase_order_id);

-- 2. Update stock trigger to skip PO-linked items (purchase_id IS NULL)
CREATE OR REPLACE FUNCTION update_stock_on_purchase_item()
RETURNS TRIGGER AS $$
DECLARE
  warehouse_id_val uuid;
BEGIN
  -- Skip PO-linked items (no actual purchase yet — stock updates on completion)
  IF TG_OP = 'INSERT' AND NEW.purchase_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get warehouse from the purchase
  SELECT warehouse_id INTO warehouse_id_val FROM purchases WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);

  IF warehouse_id_val IS NULL THEN
    warehouse_id_val := (SELECT id FROM warehouses LIMIT 1);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE product_stock
      SET quantity = quantity + NEW.quantity,
          updated_at = now()
      WHERE product_id = NEW.product_id AND warehouse_id = warehouse_id_val;

      IF NOT FOUND THEN
        INSERT INTO product_stock (product_id, warehouse_id, quantity)
        VALUES (NEW.product_id, warehouse_id_val, NEW.quantity);
      END IF;
    END IF;

    IF NEW.raw_material_id IS NOT NULL THEN
      UPDATE raw_materials
      SET current_stock = current_stock + NEW.quantity,
          updated_at = now()
      WHERE id = NEW.raw_material_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE product_stock
      SET quantity = quantity - OLD.quantity + NEW.quantity,
          updated_at = now()
      WHERE product_id = NEW.product_id AND warehouse_id = warehouse_id_val;
    END IF;

    IF NEW.raw_material_id IS NOT NULL THEN
      UPDATE raw_materials
      SET current_stock = current_stock - OLD.quantity + NEW.quantity,
          updated_at = now()
      WHERE id = NEW.raw_material_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE product_stock
      SET quantity = quantity - OLD.quantity,
          updated_at = now()
      WHERE product_id = OLD.product_id AND warehouse_id = warehouse_id_val;
    END IF;

    IF OLD.raw_material_id IS NOT NULL THEN
      UPDATE raw_materials
      SET current_stock = current_stock - OLD.quantity,
          updated_at = now()
      WHERE id = OLD.raw_material_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Create vendor_transactions entries when purchases are completed
CREATE OR REPLACE FUNCTION trigger_vendor_purchase_to_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('purchase', 'debit_note') THEN amount
        ELSE -amount
      END
    ), 0) INTO v_balance_before
    FROM vendor_transactions
    WHERE vendor_id = NEW.vendor_id;

    v_balance_after := v_balance_before + NEW.total_amount;

    INSERT INTO vendor_transactions (
      vendor_id, transaction_type, amount, balance_before, balance_after,
      reference_id, reference_type, description, created_by, created_at
    ) VALUES (
      NEW.vendor_id, 'purchase', NEW.total_amount,
      v_balance_before, v_balance_after,
      NEW.id::text, 'purchase', NULL, NEW.created_by, NEW.created_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_vendor_purchase_to_transaction ON purchases;
CREATE TRIGGER trigger_vendor_purchase_to_transaction
  AFTER INSERT ON purchases
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_vendor_purchase_to_transaction();

-- 4. RPC: record_vendor_purchase — atomic purchase + items + transaction
CREATE OR REPLACE FUNCTION record_vendor_purchase(
  p_vendor_id UUID,
  p_warehouse_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_total_amount NUMERIC DEFAULT 0,
  p_invoice_number TEXT DEFAULT NULL,
  p_invoice_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_id UUID;
  v_display_id TEXT;
  v_wh_id UUID;
  v_item JSONB;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
BEGIN
  -- Resolve warehouse
  v_wh_id := COALESCE(p_warehouse_id, (SELECT id FROM warehouses LIMIT 1));

  -- Generate display ID
  SELECT 'PUR-' || LPAD(NEXTVAL('purchases_display_id_seq')::TEXT, 6, '0')
  INTO v_display_id;

  -- Insert purchase (triggers: trigger_update_vendor_debit + trigger_vendor_purchase_to_transaction)
  INSERT INTO purchases (
    display_id, vendor_id, warehouse_id, purchase_date,
    bill_number, total_amount, status, notes, created_by
  ) VALUES (
    v_display_id, p_vendor_id, v_wh_id, COALESCE(p_invoice_date, CURRENT_DATE),
    p_invoice_number, p_total_amount, 'completed', p_notes, p_user_id
  ) RETURNING id INTO v_purchase_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO purchase_items (
      purchase_id, raw_material_id, quantity, unit_cost, total_cost
    ) VALUES (
      v_purchase_id,
      (v_item->>'raw_material_id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::NUMERIC
    );
  END LOOP;

  RETURN v_display_id;
END;
$$;

-- 5. RPC: record_vendor_payment — atomic payment + expense + transaction
CREATE OR REPLACE FUNCTION record_vendor_payment(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id UUID;
  v_display_id TEXT;
BEGIN
  SELECT 'PAY-' || LPAD(NEXTVAL('pay_display_seq')::TEXT, 6, '0')
  INTO v_display_id;

  INSERT INTO vendor_payments (
    display_id, vendor_id, payment_date, amount,
    payment_method, payment_reference, status, notes, created_by
  ) VALUES (
    v_display_id, p_vendor_id, CURRENT_DATE, p_amount,
    p_payment_method, p_reference_number, 'completed', p_notes, p_user_id
  ) RETURNING id INTO v_payment_id;

  RETURN v_display_id;
END;
$$;

-- 6. RPC: complete_purchase_order — convert PO to completed purchase atomically
CREATE OR REPLACE FUNCTION complete_purchase_order(
  p_po_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_po RECORD;
  v_purchase_id UUID;
  v_display_id TEXT;
  v_wh_id UUID;
  v_item_count INT;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_po.status = 'completed' THEN
    RAISE EXCEPTION 'Purchase order is already completed';
  END IF;

  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled purchase order';
  END IF;

  -- Count PO-linked items
  SELECT COUNT(*) INTO v_item_count
  FROM purchase_items
  WHERE purchase_order_id = p_po_id AND purchase_id IS NULL;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'No items found for purchase order %', v_po.display_id;
  END IF;

  v_wh_id := COALESCE(v_po.warehouse_id, (SELECT id FROM warehouses LIMIT 1));

  SELECT 'PUR-' || LPAD(NEXTVAL('purchases_display_id_seq')::TEXT, 6, '0')
  INTO v_display_id;

  -- Create purchase (triggers: trigger_update_vendor_debit + trigger_vendor_purchase_to_transaction)
  INSERT INTO purchases (
    display_id, vendor_id, warehouse_id, purchase_date,
    total_amount, status, notes, created_by
  ) VALUES (
    v_display_id, v_po.vendor_id, v_wh_id, CURRENT_DATE,
    v_po.total_amount, 'completed', v_po.notes, COALESCE(p_user_id, v_po.created_by)
  ) RETURNING id INTO v_purchase_id;

  -- Move items from PO to purchase (triggers: update_stock_on_purchase_item UPDATE)
  UPDATE purchase_items
  SET purchase_id = v_purchase_id,
      purchase_order_id = NULL
  WHERE purchase_order_id = p_po_id
    AND purchase_id IS NULL;

  -- Mark PO as completed
  UPDATE purchase_orders
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_po_id;

  RETURN v_display_id;
END;
$$;
