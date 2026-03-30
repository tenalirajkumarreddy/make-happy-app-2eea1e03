-- Purchase Management System Migration
-- Creates tables for vendor management, purchases, and vendor payments

-- =====================================================
-- 1. VENDORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text UNIQUE NOT NULL,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  gstin text, -- GST Identification Number
  pan text, -- PAN number
  payment_terms text DEFAULT 'Net 30 days',
  credit_limit numeric DEFAULT 0,
  total_debit numeric DEFAULT 0, -- Total amount owed to vendor (purchases)
  total_credit numeric DEFAULT 0, -- Total amount paid to vendor (payments)
  outstanding numeric GENERATED ALWAYS AS (total_debit - total_credit) STORED,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_vendors_outstanding ON vendors(outstanding DESC);
CREATE INDEX idx_vendors_active ON vendors(is_active) WHERE is_active = true;
CREATE INDEX idx_vendors_name ON vendors(name);

-- =====================================================
-- 2. PURCHASES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text UNIQUE NOT NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT NOT NULL,
  warehouse_id uuid REFERENCES warehouses(id),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  bill_number text, -- Vendor's invoice number
  bill_amount numeric NOT NULL CHECK (bill_amount >= 0),
  tax_amount numeric DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount numeric DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric GENERATED ALWAYS AS (bill_amount + tax_amount - discount_amount) STORED,
  notes text,
  status text DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_purchases_vendor ON purchases(vendor_id);
CREATE INDEX idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX idx_purchases_status ON purchases(status);

-- =====================================================
-- 3. PURCHASE ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES purchases(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  total_cost numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  batch_number text,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);

-- =====================================================
-- 4. VENDOR PAYMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text UNIQUE NOT NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text CHECK (payment_method IN ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other')),
  payment_reference text, -- Cheque number, UPI ref, transaction ID
  notes text,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX idx_vendor_payments_date ON vendor_payments(payment_date DESC);
CREATE INDEX idx_vendor_payments_status ON vendor_payments(status);

-- =====================================================
-- 5. TRIGGERS & FUNCTIONS
-- =====================================================

-- Function: Update vendor debit when purchase is created/updated/deleted
CREATE OR REPLACE FUNCTION update_vendor_debit_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    -- Add to vendor debit
    UPDATE vendors 
    SET total_debit = total_debit + NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.vendor_id;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      -- Purchase no longer completed, reverse debit
      UPDATE vendors 
      SET total_debit = total_debit - OLD.total_amount,
          updated_at = now()
      WHERE id = OLD.vendor_id;
    ELSIF OLD.status != 'completed' AND NEW.status = 'completed' THEN
      -- Purchase newly completed, add debit
      UPDATE vendors 
      SET total_debit = total_debit + NEW.total_amount,
          updated_at = now()
      WHERE id = NEW.vendor_id;
    ELSIF OLD.status = 'completed' AND NEW.status = 'completed' THEN
      -- Amount changed, adjust debit
      UPDATE vendors 
      SET total_debit = total_debit - OLD.total_amount + NEW.total_amount,
          updated_at = now()
      WHERE id = NEW.vendor_id;
    END IF;
    
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    -- Remove from vendor debit
    UPDATE vendors 
    SET total_debit = total_debit - OLD.total_amount,
        updated_at = now()
    WHERE id = OLD.vendor_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_vendor_debit
AFTER INSERT OR UPDATE OR DELETE ON purchases
FOR EACH ROW
EXECUTE FUNCTION update_vendor_debit_on_purchase();

-- Function: Update product stock when purchase items are added/modified/deleted
CREATE OR REPLACE FUNCTION update_stock_on_purchase_item()
RETURNS TRIGGER AS $$
DECLARE
  purchase_status text;
  warehouse_id_val uuid;
BEGIN
  -- Get purchase status and warehouse
  SELECT status, warehouse_id INTO purchase_status, warehouse_id_val
  FROM purchases 
  WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);
  
  -- Only update stock if purchase is completed
  IF purchase_status = 'completed' THEN
    IF TG_OP = 'INSERT' THEN
      -- Increase stock
      UPDATE product_stock
      SET quantity_available = quantity_available + NEW.quantity,
          updated_at = now()
      WHERE product_id = NEW.product_id AND warehouse_id = warehouse_id_val;
      
      -- Create stock record if doesn't exist
      IF NOT FOUND THEN
        INSERT INTO product_stock (product_id, warehouse_id, quantity_available)
        VALUES (NEW.product_id, warehouse_id_val, NEW.quantity);
      END IF;
      
    ELSIF TG_OP = 'UPDATE' THEN
      -- Adjust stock (remove old, add new)
      UPDATE product_stock
      SET quantity_available = quantity_available - OLD.quantity + NEW.quantity,
          updated_at = now()
      WHERE product_id = NEW.product_id AND warehouse_id = warehouse_id_val;
      
    ELSIF TG_OP = 'DELETE' THEN
      -- Decrease stock
      UPDATE product_stock
      SET quantity_available = quantity_available - OLD.quantity,
          updated_at = now()
      WHERE product_id = OLD.product_id AND warehouse_id = warehouse_id_val;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_stock_on_purchase_item
AFTER INSERT OR UPDATE OR DELETE ON purchase_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_purchase_item();

-- Function: Update vendor credit when payment is created/updated/deleted
CREATE OR REPLACE FUNCTION update_vendor_credit_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    -- Add to vendor credit
    UPDATE vendors 
    SET total_credit = total_credit + NEW.amount,
        updated_at = now()
    WHERE id = NEW.vendor_id;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      -- Payment no longer completed, reverse credit
      UPDATE vendors 
      SET total_credit = total_credit - OLD.amount,
          updated_at = now()
      WHERE id = OLD.vendor_id;
    ELSIF OLD.status != 'completed' AND NEW.status = 'completed' THEN
      -- Payment newly completed, add credit
      UPDATE vendors 
      SET total_credit = total_credit + NEW.amount,
          updated_at = now()
      WHERE id = NEW.vendor_id;
    ELSIF OLD.status = 'completed' AND NEW.status = 'completed' THEN
      -- Amount changed, adjust credit
      UPDATE vendors 
      SET total_credit = total_credit - OLD.amount + NEW.amount,
          updated_at = now()
      WHERE id = NEW.vendor_id;
    END IF;
    
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    -- Remove from vendor credit
    UPDATE vendors 
    SET total_credit = total_credit - OLD.amount,
        updated_at = now()
    WHERE id = OLD.vendor_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_vendor_credit
AFTER INSERT OR UPDATE OR DELETE ON vendor_payments
FOR EACH ROW
EXECUTE FUNCTION update_vendor_credit_on_payment();

-- =====================================================
-- 6. RLS POLICIES
-- =====================================================

-- Vendors policies
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and managers can view vendors"
ON vendors FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

CREATE POLICY "Admin and managers can insert vendors"
ON vendors FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

CREATE POLICY "Admin and managers can update vendors"
ON vendors FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

CREATE POLICY "Only super_admin can delete vendors"
ON vendors FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Purchases policies
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and managers can manage purchases"
ON purchases FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- Purchase items policies
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and managers can manage purchase items"
ON purchase_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- Vendor payments policies
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and managers can manage vendor payments"
ON vendor_payments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE vendors IS 'Vendors/suppliers from whom we purchase inventory';
COMMENT ON COLUMN vendors.total_debit IS 'Total amount we owe to the vendor (sum of completed purchases)';
COMMENT ON COLUMN vendors.total_credit IS 'Total amount we have paid to the vendor';
COMMENT ON COLUMN vendors.outstanding IS 'Calculated field: total_debit - total_credit';

COMMENT ON TABLE purchases IS 'Purchase orders/bills from vendors';
COMMENT ON COLUMN purchases.bill_amount IS 'Base bill amount before tax and discount';
COMMENT ON COLUMN purchases.total_amount IS 'Calculated: bill_amount + tax_amount - discount_amount';

COMMENT ON TABLE purchase_items IS 'Line items in each purchase order';
COMMENT ON TABLE vendor_payments IS 'Payments made to vendors';
