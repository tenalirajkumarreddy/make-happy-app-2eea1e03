-- Migration: Vendor Balance Tracking
-- Date: 2026-04-13
-- Description: Track vendor balances with purchases and payments

-- 1. Add balance tracking columns to vendors
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_purchases NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_payments NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_vendors_balance ON vendors(current_balance) WHERE current_balance != 0;

-- 2. Create vendor transactions table
CREATE TABLE IF NOT EXISTS vendor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'adjustment', 'return', 'refund')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_id UUID, -- purchase_id or payment_id
  reference_type TEXT, -- 'raw_material_purchase', 'vendor_payment', etc.
  payment_method TEXT, -- for payments: 'cash', 'upi', 'bank_transfer', 'cheque'
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_vendor ON vendor_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_type ON vendor_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_date ON vendor_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_reference ON vendor_transactions(reference_id);

-- 3. Trigger function to update vendor balance
CREATE OR REPLACE FUNCTION update_vendor_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update vendor totals based on transaction type
  UPDATE vendors
  SET 
    current_balance = CASE 
      WHEN NEW.transaction_type IN ('purchase', 'adjustment') THEN current_balance + NEW.amount
      WHEN NEW.transaction_type IN ('payment', 'return', 'refund') THEN current_balance - NEW.amount
      ELSE current_balance
    END,
    total_purchases = CASE 
      WHEN NEW.transaction_type = 'purchase' THEN total_purchases + NEW.amount
      ELSE total_purchases
    END,
    total_payments = CASE 
      WHEN NEW.transaction_type = 'payment' THEN total_payments + NEW.amount
      ELSE total_payments
    END,
    last_purchase_at = CASE 
      WHEN NEW.transaction_type = 'purchase' THEN NEW.created_at
      ELSE last_purchase_at
    END,
    last_payment_at = CASE 
      WHEN NEW.transaction_type = 'payment' THEN NEW.created_at
      ELSE last_payment_at
    END,
    updated_at = NOW()
  WHERE id = NEW.vendor_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_update_vendor_balance ON vendor_transactions;

-- Create trigger
CREATE TRIGGER trg_update_vendor_balance
AFTER INSERT ON vendor_transactions
FOR EACH ROW
EXECUTE FUNCTION update_vendor_balance();

-- 4. Function to record vendor purchase
CREATE OR REPLACE FUNCTION record_vendor_purchase(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_raw_material_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_current_balance NUMERIC;
  v_transaction_id UUID;
  v_purchase_id UUID;
BEGIN
  -- Get current balance
  SELECT current_balance INTO v_current_balance
  FROM vendors WHERE id = p_vendor_id;
  
  -- Create raw material purchase record
  INSERT INTO raw_material_purchases (
    raw_material_id,
    vendor_id,
    quantity,
    unit_price,
    total_amount,
    notes,
    status
  ) VALUES (
    p_raw_material_id,
    p_vendor_id,
    p_quantity,
    p_unit_price,
    p_amount,
    p_notes,
    'completed'
  )
  RETURNING id INTO v_purchase_id;
  
  -- Create transaction
  INSERT INTO vendor_transactions (
    vendor_id, transaction_type, amount, balance_before, balance_after,
    reference_id, reference_type, notes
  ) VALUES (
    p_vendor_id, 'purchase', p_amount, v_current_balance, v_current_balance + p_amount,
    v_purchase_id, 'raw_material_purchase', p_notes
  )
  RETURNING id INTO v_transaction_id;
  
  -- Update raw material stock
  IF p_raw_material_id IS NOT NULL AND p_quantity IS NOT NULL THEN
    UPDATE raw_materials
    SET current_stock = current_stock + p_quantity,
        updated_at = NOW()
    WHERE id = p_raw_material_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'transaction_id', v_transaction_id,
    'amount', p_amount,
    'new_balance', v_current_balance + p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to record vendor payment
CREATE OR REPLACE FUNCTION record_vendor_payment(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_current_balance NUMERIC;
  v_transaction_id UUID;
  v_payment_id UUID;
BEGIN
  -- Get current balance
  SELECT current_balance INTO v_current_balance
  FROM vendors WHERE id = p_vendor_id;
  
  -- Validate payment doesn't exceed balance
  IF p_amount > v_current_balance THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Payment amount (%s) exceeds vendor balance (%s)', p_amount, v_current_balance)
    );
  END IF;
  
  -- Create payment record
  INSERT INTO vendor_payments (
    vendor_id,
    amount,
    payment_method,
    reference_number,
    notes,
    status
  ) VALUES (
    p_vendor_id,
    p_amount,
    p_payment_method,
    p_reference_number,
    p_notes,
    'completed'
  )
  RETURNING id INTO v_payment_id;
  
  -- Create transaction
  INSERT INTO vendor_transactions (
    vendor_id, transaction_type, amount, balance_before, balance_after,
    reference_id, reference_type, payment_method, notes
  ) VALUES (
    p_vendor_id, 'payment', p_amount, v_current_balance, v_current_balance - p_amount,
    v_payment_id, 'vendor_payment', p_payment_method, p_notes
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'transaction_id', v_transaction_id,
    'amount', p_amount,
    'new_balance', v_current_balance - p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to get vendor balance
CREATE OR REPLACE FUNCTION get_vendor_balance(p_vendor_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_balance NUMERIC;
  v_total_purchases NUMERIC;
  v_total_payments NUMERIC;
BEGIN
  SELECT 
    current_balance,
    total_purchases,
    total_payments
  INTO v_balance, v_total_purchases, v_total_payments
  FROM vendors
  WHERE id = p_vendor_id;
  
  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'current_balance', COALESCE(v_balance, 0),
    'total_purchases', COALESCE(v_total_purchases, 0),
    'total_payments', COALESCE(v_total_payments, 0),
    'credit_limit', (SELECT credit_limit FROM vendors WHERE id = p_vendor_id)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 7. Function to get vendor transaction history
CREATE OR REPLACE FUNCTION get_vendor_transactions(
  p_vendor_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  transaction_type TEXT,
  amount NUMERIC,
  balance_before NUMERIC,
  balance_after NUMERIC,
  payment_method TEXT,
  reference_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  created_by_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vt.id,
    vt.transaction_type,
    vt.amount,
    vt.balance_before,
    vt.balance_after,
    vt.payment_method,
    vt.reference_type,
    vt.notes,
    vt.created_at,
    COALESCE(u.raw_user_meta_data->>'full_name', 'System') as created_by_name
  FROM vendor_transactions vt
  LEFT JOIN auth.users u ON u.id = vt.created_by
  WHERE vt.vendor_id = p_vendor_id
  AND (p_start_date IS NULL OR vt.created_at >= p_start_date)
  AND (p_end_date IS NULL OR vt.created_at <= p_end_date::timestamptz + interval '1 day')
  ORDER BY vt.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 8. Create raw material purchases table if not exists
CREATE TABLE IF NOT EXISTS raw_material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id UUID REFERENCES raw_materials(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id),
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_vendor ON raw_material_purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_material ON raw_material_purchases(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_date ON raw_material_purchases(created_at);

-- 9. Create vendor payments table if not exists
CREATE TABLE IF NOT EXISTS vendor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(created_at);

-- 10. RLS Policies for vendor transactions
ALTER TABLE vendor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

-- Managers can view all
CREATE POLICY "Manager view vendor transactions" ON vendor_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

-- Managers can manage
CREATE POLICY "Manager manage vendor transactions" ON vendor_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

-- Similar policies for purchases and payments
CREATE POLICY "Manager view purchases" ON raw_material_purchases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

CREATE POLICY "Manager manage purchases" ON raw_material_purchases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

CREATE POLICY "Manager view payments" ON vendor_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

CREATE POLICY "Manager manage payments" ON vendor_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

-- 11. Grant permissions
GRANT EXECUTE ON FUNCTION record_vendor_purchase TO authenticated;
GRANT EXECUTE ON FUNCTION record_vendor_payment TO authenticated;
GRANT EXECUTE ON FUNCTION get_vendor_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_vendor_transactions TO authenticated;

-- 12. View for vendor balance summary
CREATE OR REPLACE VIEW vendor_balance_summary AS
SELECT 
  v.id as vendor_id,
  v.name as vendor_name,
  v.display_id,
  v.current_balance,
  v.total_purchases,
  v.total_payments,
  COUNT(DISTINCT vt.id) as transaction_count,
  MAX(vt.created_at) as last_transaction_date,
  COUNT(DISTINCT rm.id) as linked_raw_materials
FROM vendors v
LEFT JOIN vendor_transactions vt ON vt.vendor_id = v.id
LEFT JOIN raw_materials rm ON rm.vendor_id = v.id
GROUP BY v.id, v.name, v.display_id, v.current_balance, v.total_purchases, v.total_payments
ORDER BY v.current_balance DESC;

COMMENT ON TABLE vendor_transactions IS 'Tracks all financial transactions with vendors';
COMMENT ON FUNCTION record_vendor_purchase IS 'Records a purchase from vendor and increases balance';
COMMENT ON FUNCTION record_vendor_payment IS 'Records a payment to vendor and decreases balance';
COMMENT ON VIEW vendor_balance_summary IS 'Summary of vendor balances and activity';
