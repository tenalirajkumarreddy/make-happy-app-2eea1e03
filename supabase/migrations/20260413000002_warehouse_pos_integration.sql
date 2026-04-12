-- Migration: Warehouse POS Integration
-- Date: 2026-04-13
-- Description: POS stores linked to warehouses, stock flows from warehouse for POS sales

-- 1. Create POS stores table
CREATE TABLE IF NOT EXISTS pos_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  location TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on warehouse_id to ensure one POS per warehouse
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stores_warehouse ON pos_stores(warehouse_id);

-- 2. Add POS store reference to sales table
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS pos_store_id UUID REFERENCES pos_stores(id),
ADD COLUMN IF NOT EXISTS stock_source TEXT CHECK (stock_source IN ('staff', 'warehouse'));

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sales_pos_store ON sales(pos_store_id);
CREATE INDEX IF NOT EXISTS idx_sales_stock_source ON sales(stock_source);

-- 3. Create trigger to auto-create POS store for new warehouse
CREATE OR REPLACE FUNCTION create_pos_store_for_warehouse()
RETURNS TRIGGER AS $$
DECLARE
  v_pos_code TEXT;
BEGIN
  -- Generate POS code from warehouse code or ID
  v_pos_code := 'POS-' || COALESCE(NEW.code, SPLIT_PART(NEW.id::text, '-', 1));
  
  INSERT INTO pos_stores (
    warehouse_id, 
    name, 
    code,
    location,
    phone
  )
  VALUES (
    NEW.id,
    NEW.name || ' POS Store',
    v_pos_code,
    NEW.address,
    NEW.phone
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_create_pos_store ON warehouses;

-- Create trigger
CREATE TRIGGER trg_create_pos_store
AFTER INSERT ON warehouses
FOR EACH ROW
EXECUTE FUNCTION create_pos_store_for_warehouse();

-- 4. Create POS stores for existing warehouses (one-time fix)
INSERT INTO pos_stores (warehouse_id, name, code, location, phone)
SELECT 
  id,
  name || ' POS Store',
  'POS-' || COALESCE(code, SPLIT_PART(id::text, '-', 1)),
  address,
  phone
FROM warehouses w
WHERE NOT EXISTS (
  SELECT 1 FROM pos_stores ps WHERE ps.warehouse_id = w.id
)
ON CONFLICT (warehouse_id) DO NOTHING;

-- 5. Function to get stock source for sale
CREATE OR REPLACE FUNCTION get_sale_stock_source(
  p_recorded_by UUID,
  p_pos_store_id UUID
) RETURNS TEXT AS $$
BEGIN
  -- If POS store is specified, stock comes from warehouse
  IF p_pos_store_id IS NOT NULL THEN
    RETURN 'warehouse';
  END IF;
  
  -- Otherwise, check user role
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_recorded_by 
    AND role = 'pos'
  ) THEN
    RETURN 'warehouse';
  END IF;
  
  -- Default: staff personal stock
  RETURN 'staff';
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 6. Function to deduct stock based on sale
CREATE OR REPLACE FUNCTION deduct_sale_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_source TEXT;
  v_warehouse_id UUID;
  v_available NUMERIC;
  v_sale_item RECORD;
BEGIN
  -- Determine stock source
  v_source := get_sale_stock_source(NEW.recorded_by, NEW.pos_store_id);
  
  -- Get warehouse ID
  IF NEW.pos_store_id IS NOT NULL THEN
    SELECT warehouse_id INTO v_warehouse_id
    FROM pos_stores WHERE id = NEW.pos_store_id;
  ELSE
    SELECT warehouse_id INTO v_warehouse_id
    FROM user_roles
    WHERE user_id = NEW.recorded_by
    LIMIT 1;
  END IF;
  
  -- Process each sale item
  FOR v_sale_item IN 
    SELECT * FROM jsonb_array_elements(NEW.items::jsonb) AS item
  LOOP
    IF v_source = 'warehouse' THEN
      -- Deduct from warehouse stock
      SELECT quantity INTO v_available
      FROM product_stock
      WHERE warehouse_id = v_warehouse_id 
      AND product_id = (v_sale_item->>'product_id')::UUID;
      
      IF v_available IS NULL OR v_available < COALESCE((v_sale_item->>'quantity')::NUMERIC, 0) THEN
        RAISE EXCEPTION 'Insufficient warehouse stock for product %', v_sale_item->>'product_id';
      END IF;
      
      UPDATE product_stock
      SET quantity = quantity - (v_sale_item->>'quantity')::NUMERIC,
          updated_at = NOW()
      WHERE warehouse_id = v_warehouse_id 
      AND product_id = (v_sale_item->>'product_id')::UUID;
      
    ELSE
      -- Deduct from staff stock
      SELECT quantity INTO v_available
      FROM staff_stock
      WHERE staff_id = NEW.recorded_by
      AND product_id = (v_sale_item->>'product_id')::UUID
      AND warehouse_id = v_warehouse_id;
      
      IF v_available IS NULL OR v_available < COALESCE((v_sale_item->>'quantity')::NUMERIC, 0) THEN
        RAISE EXCEPTION 'Insufficient staff stock for product %', v_sale_item->>'product_id';
      END IF;
      
      UPDATE staff_stock
      SET quantity = quantity - (v_sale_item->>'quantity')::NUMERIC,
          updated_at = NOW()
      WHERE staff_id = NEW.recorded_by
      AND product_id = (v_sale_item->>'product_id')::UUID
      AND warehouse_id = v_warehouse_id;
    END IF;
    
    -- Record stock movement
    INSERT INTO stock_movements (
      product_id, warehouse_id, staff_id, quantity,
      movement_type, reference_type, reference_id
    ) VALUES (
      (v_sale_item->>'product_id')::UUID,
      v_warehouse_id,
      CASE WHEN v_source = 'staff' THEN NEW.recorded_by ELSE NULL END,
      -(v_sale_item->>'quantity')::NUMERIC,
      'sale',
      'sale',
      NEW.id
    );
  END LOOP;
  
  -- Set stock source on sale record
  NEW.stock_source := v_source;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_deduct_sale_stock ON sales;

-- Create trigger (BEFORE INSERT to modify the record)
CREATE TRIGGER trg_deduct_sale_stock
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION deduct_sale_stock();

-- 7. Function to validate POS sale (mandatory payment)
CREATE OR REPLACE FUNCTION validate_pos_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a POS sale, payment is mandatory
  IF NEW.pos_store_id IS NOT NULL OR NEW.stock_source = 'warehouse' THEN
    -- Check if payment was recorded
    IF COALESCE(NEW.cash_amount, 0) + COALESCE(NEW.upi_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'POS sales require immediate payment (Cash or UPI)';
    END IF;
    
    -- For POS, total payment must equal sale amount
    IF COALESCE(NEW.cash_amount, 0) + COALESCE(NEW.upi_amount, 0) != NEW.total_amount THEN
      RAISE EXCEPTION 'POS sales must be paid in full. Sale: %, Payment: %', 
        NEW.total_amount, 
        COALESCE(NEW.cash_amount, 0) + COALESCE(NEW.upi_amount, 0);
    END IF;
    
    -- No outstanding for POS sales
    NEW.outstanding_amount := 0;
    NEW.payment_status := 'paid';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_validate_pos_sale ON sales;

-- Create trigger
CREATE TRIGGER trg_validate_pos_sale
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION validate_pos_sale();

-- 8. RLS Policies for pos_stores
ALTER TABLE pos_stores ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view POS stores
CREATE POLICY "View POS stores" ON pos_stores
  FOR SELECT USING (true);

-- Only managers and super_admin can manage POS stores
CREATE POLICY "Manage POS stores" ON pos_stores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'super_admin')
    )
  );

-- 9. Grant permissions
GRANT EXECUTE ON FUNCTION get_sale_stock_source TO authenticated;

-- 10. Create view for POS sales reporting
CREATE OR REPLACE VIEW pos_sales_summary AS
SELECT 
  s.pos_store_id,
  ps.name as pos_store_name,
  ps.warehouse_id,
  w.name as warehouse_name,
  DATE(s.created_at) as sale_date,
  COUNT(*) as sale_count,
  SUM(s.total_amount) as total_sales,
  SUM(s.cash_amount) as total_cash,
  SUM(s.upi_amount) as total_upi
FROM sales s
JOIN pos_stores ps ON ps.id = s.pos_store_id
JOIN warehouses w ON w.id = ps.warehouse_id
WHERE s.stock_source = 'warehouse'
GROUP BY s.pos_store_id, ps.name, ps.warehouse_id, w.name, DATE(s.created_at);

COMMENT ON TABLE pos_stores IS 'POS stores linked to warehouses for counter sales';
COMMENT ON FUNCTION get_sale_stock_source IS 'Determines if sale stock should come from warehouse or staff inventory';
