-- Migration: Receipts Table and Auto-Generation
-- Phase 4: Scale & Polish - Issue #12
-- Created: 2026-04-14

-- Create receipts table
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  receipt_number TEXT UNIQUE NOT NULL,
  receipt_data JSONB NOT NULL,
  pdf_url TEXT,
  html_generated BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  sent_to TEXT[] DEFAULT ARRAY[]::TEXT[],
  resent_count INTEGER DEFAULT 0,
  last_resent_at TIMESTAMPTZ,
  warehouse_id UUID REFERENCES warehouses(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_receipts_sale_id ON receipts(sale_id);
CREATE INDEX idx_receipts_number ON receipts(receipt_number);
CREATE INDEX idx_receipts_warehouse ON receipts(warehouse_id);
CREATE INDEX idx_receipts_generated_at ON receipts(generated_at);
CREATE INDEX idx_receipts_generated_by ON receipts(generated_by);

-- Create receipt storage bucket (done via Supabase Storage API, not SQL)
-- Note: Create bucket via dashboard or storage API with name 'receipts'

-- RLS Policies for receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view receipts from their warehouses
CREATE POLICY "Users can view receipts in their warehouses"
ON receipts FOR SELECT
TO authenticated
USING (
  user_is_staff(auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    (
      warehouse_id IS NOT NULL 
      AND user_has_warehouse_access(auth.uid(), warehouse_id)
    )
    OR
    warehouse_id IS NULL
    OR
    -- Can view receipts for sales they recorded
    generated_by = auth.uid()
  )
);

-- Policy: Users can insert receipts in their warehouses
CREATE POLICY "Users can insert receipts in their warehouses"
ON receipts FOR INSERT
TO authenticated
WITH CHECK (
  user_is_staff(auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    (
      warehouse_id IS NOT NULL 
      AND user_has_warehouse_access(auth.uid(), warehouse_id)
    )
    OR
    warehouse_id IS NULL
  )
);

-- Policy: Users can update receipts (for resend tracking)
CREATE POLICY "Users can update receipts in their warehouses"
ON receipts FOR UPDATE
TO authenticated
USING (
  user_is_staff(auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    (
      warehouse_id IS NOT NULL 
      AND user_has_warehouse_access(auth.uid(), warehouse_id)
    )
    OR
    warehouse_id IS NULL
    OR
    generated_by = auth.uid()
  )
)
WITH CHECK (
  user_is_staff(auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    (
      warehouse_id IS NOT NULL 
      AND user_has_warehouse_access(auth.uid(), warehouse_id)
    )
    OR
    warehouse_id IS NULL
  )
);

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  prefix TEXT := 'RCP-';
  timestamp TEXT;
  random_suffix TEXT;
  receipt_num TEXT;
  exists_check BOOLEAN;
BEGIN
  timestamp := to_char(now(), 'YYYYMMDD-HH24MISS');
  random_suffix := substr(md5(random()::text), 1, 6);
  receipt_num := prefix || timestamp || '-' || upper(random_suffix);
  
  -- Check if exists and regenerate if needed
  SELECT EXISTS(SELECT 1 FROM receipts WHERE receipt_number = receipt_num) INTO exists_check;
  
  IF exists_check THEN
    -- Add microsecond precision and retry
    timestamp := to_char(now(), 'YYYYMMDD-HH24MISS-MS');
    random_suffix := substr(md5(random()::text), 1, 8);
    receipt_num := prefix || timestamp || '-' || upper(random_suffix);
  END IF;
  
  RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate receipt on sale insert
CREATE OR REPLACE FUNCTION auto_generate_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_data JSONB;
  v_store_data JSONB;
  v_items_data JSONB;
  v_user_warehouse_id UUID;
BEGIN
  -- Get user's warehouse (if assigned)
  SELECT warehouse_id INTO v_user_warehouse_id
  FROM user_roles
  WHERE user_id = NEW.recorded_by
  LIMIT 1;
  
  -- Build receipt data
  SELECT jsonb_build_object(
    'sale_id', NEW.id,
    'display_id', NEW.display_id,
    'sale_date', NEW.created_at,
    'previous_balance', NEW.previous_balance,
    'subtotal', NEW.subtotal,
    'discount_amount', NEW.discount_amount,
    'total_amount', NEW.total_amount,
    'amount_paid', NEW.amount_paid,
    'outstanding', NEW.outstanding,
    'payment_mode', NEW.payment_mode,
    'notes', NEW.notes,
    'warehouse_id', NEW.warehouse_id,
    'recorded_by', NEW.recorded_by
  ) INTO v_sale_data;
  
  -- Get store info
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'phone', s.phone,
    'address', s.address,
    'credit_limit', s.credit_limit,
    'outstanding_balance', s.outstanding_balance
  ) INTO v_store_data
  FROM stores s
  WHERE s.id = NEW.store_id;
  
  -- Get sale items
  SELECT jsonb_agg(jsonb_build_object(
    'id', si.id,
    'product_id', si.product_id,
    'product_name', p.name,
    'quantity', si.quantity,
    'unit_price', si.unit_price,
    'amount', si.quantity * si.unit_price
  ))
  INTO v_items_data
  FROM sale_items si
  JOIN products p ON p.id = si.product_id
  WHERE si.sale_id = NEW.id;
  
  -- Insert receipt
  INSERT INTO receipts (
    sale_id,
    receipt_number,
    receipt_data,
    generated_by,
    warehouse_id
  ) VALUES (
    NEW.id,
    generate_receipt_number(),
    jsonb_build_object(
      'sale', v_sale_data,
      'store', v_store_data,
      'items', COALESCE(v_items_data, '[]'::jsonb),
      'generated_at', now(),
      'version', '1.0'
    ),
    NEW.recorded_by,
    COALESCE(NEW.warehouse_id, v_user_warehouse_id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-generation
DROP TRIGGER IF EXISTS auto_generate_receipt_trigger ON sales;
CREATE TRIGGER auto_generate_receipt_trigger
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_receipt();

-- Function to resend receipt (track resend history)
CREATE OR REPLACE FUNCTION resend_receipt(
  p_receipt_id UUID,
  p_recipient TEXT
) RETURNS void AS $$
BEGIN
  UPDATE receipts
  SET 
    sent_to = array_append(sent_to, p_recipient),
    resent_count = resent_count + 1,
    last_resent_at = now()
  WHERE id = p_receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE receipts IS 'Persistent receipt storage with PDF generation tracking';
COMMENT ON COLUMN receipts.receipt_data IS 'Complete JSON snapshot of sale, store, and items at time of generation';
COMMENT ON COLUMN receipts.sent_to IS 'Array of email/phone recipients who received this receipt';
