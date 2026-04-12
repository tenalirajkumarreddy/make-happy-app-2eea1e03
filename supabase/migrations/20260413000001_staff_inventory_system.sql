-- Migration: Staff Inventory System
-- Date: 2026-04-13
-- Description: Complete staff inventory tracking with amount/value calculation

-- 1. Update staff_stock table to track amount/value
ALTER TABLE staff_stock 
ADD COLUMN IF NOT EXISTS amount_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_staff_stock_amount ON staff_stock(amount_value);
CREATE INDEX IF NOT EXISTS idx_staff_stock_timestamps ON staff_stock(last_received_at, last_sale_at);

-- 2. Create staff inventory summary view
CREATE OR REPLACE VIEW staff_inventory_summary AS
SELECT 
  ss.staff_id,
  ss.warehouse_id,
  w.name as warehouse_name,
  u.raw_user_meta_data->>'full_name' as staff_name,
  COUNT(DISTINCT ss.product_id) as total_products,
  COALESCE(SUM(ss.quantity), 0) as total_quantity,
  COALESCE(SUM(ss.amount_value), 0) as total_value,
  MAX(ss.updated_at) as last_updated
FROM staff_stock ss
LEFT JOIN warehouses w ON w.id = ss.warehouse_id
LEFT JOIN auth.users u ON u.id = ss.staff_id
GROUP BY ss.staff_id, ss.warehouse_id, w.name, u.raw_user_meta_data->>'full_name';

-- 3. Function to calculate staff inventory value
CREATE OR REPLACE FUNCTION calculate_staff_inventory_value(
  p_staff_id UUID,
  p_product_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
BEGIN
  -- Get current quantity
  SELECT quantity INTO v_quantity
  FROM staff_stock
  WHERE staff_id = p_staff_id AND product_id = p_product_id;
  
  -- Get product price
  SELECT base_price INTO v_unit_price
  FROM products
  WHERE id = p_product_id;
  
  RETURN COALESCE(v_quantity * v_unit_price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger function to update amount_value on staff_stock changes
CREATE OR REPLACE FUNCTION update_staff_stock_value()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_price NUMERIC;
BEGIN
  -- Get product price
  SELECT base_price INTO v_unit_price
  FROM products
  WHERE id = NEW.product_id;
  
  -- Calculate new amount
  NEW.amount_value := COALESCE(NEW.quantity * COALESCE(v_unit_price, 0), 0);
  
  -- Update timestamps based on operation
  IF TG_OP = 'INSERT' THEN
    NEW.last_received_at := NOW();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity > OLD.quantity THEN
      NEW.last_received_at := NOW();
    ELSIF NEW.quantity < OLD.quantity THEN
      NEW.last_sale_at := NOW();
    END IF;
  END IF;
  
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_staff_stock_value ON staff_stock;

-- Create trigger
CREATE TRIGGER trg_update_staff_stock_value
BEFORE INSERT OR UPDATE ON staff_stock
FOR EACH ROW
EXECUTE FUNCTION update_staff_stock_value();

-- 5. Function to get staff inventory summary
CREATE OR REPLACE FUNCTION get_staff_inventory_summary(p_staff_id UUID)
RETURNS TABLE(
  total_products BIGINT,
  total_quantity NUMERIC,
  total_value NUMERIC,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT product_id) as total_products,
    COALESCE(SUM(quantity), 0) as total_quantity,
    COALESCE(SUM(amount_value), 0) as total_value,
    MAX(updated_at) as last_updated
  FROM staff_stock
  WHERE staff_id = p_staff_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. Function to transfer stock from warehouse to staff
CREATE OR REPLACE FUNCTION transfer_stock_to_staff(
  p_warehouse_id UUID,
  p_staff_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_available NUMERIC;
  v_unit_price NUMERIC;
  v_movement_id UUID;
  v_result JSONB;
BEGIN
  -- Check warehouse stock availability
  SELECT COALESCE(quantity, 0) INTO v_available
  FROM product_stock
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
  
  IF v_available IS NULL OR v_available < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient stock in warehouse. Available: %s, Requested: %s', COALESCE(v_available, 0), p_quantity)
    );
  END IF;
  
  -- Get unit price
  SELECT base_price INTO v_unit_price
  FROM products WHERE id = p_product_id;
  
  -- Deduct from warehouse
  UPDATE product_stock
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
  
  -- Add to staff stock
  INSERT INTO staff_stock (staff_id, product_id, warehouse_id, quantity)
  VALUES (p_staff_id, p_product_id, p_warehouse_id, p_quantity)
  ON CONFLICT (staff_id, product_id, warehouse_id)
  DO UPDATE SET quantity = staff_stock.quantity + p_quantity,
                updated_at = NOW();
  
  -- Record movement
  INSERT INTO stock_movements (
    product_id, warehouse_id, staff_id, quantity,
    movement_type, reference_type, notes
  ) VALUES (
    p_product_id, p_warehouse_id, p_staff_id, p_quantity,
    'transfer_in', 'warehouse_to_staff', COALESCE(p_reason, 'Stock transfer to staff')
  )
  RETURNING id INTO v_movement_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'quantity_transferred', p_quantity,
    'unit_price', v_unit_price,
    'total_value', p_quantity * COALESCE(v_unit_price, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_staff_inventory_value TO authenticated;
GRANT EXECUTE ON FUNCTION get_staff_inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_stock_to_staff TO authenticated;

-- 7. RLS Policies for staff_stock
ALTER TABLE staff_stock ENABLE ROW LEVEL SECURITY;

-- Staff can view their own inventory
CREATE POLICY "Staff view own inventory" ON staff_stock
  FOR SELECT USING (staff_id = auth.uid());

-- Managers can view staff inventory for their warehouses
CREATE POLICY "Manager view staff inventory" ON staff_stock
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('manager', 'super_admin')
      AND ur.warehouse_id = staff_stock.warehouse_id
    )
  );

-- System can update staff_stock (via triggers)
CREATE POLICY "System update staff stock" ON staff_stock
  FOR ALL USING (true)
  WITH CHECK (true);

COMMENT ON TABLE staff_stock IS 'Tracks inventory held by individual staff members with automatic value calculation';
COMMENT ON VIEW staff_inventory_summary IS 'Provides summary statistics of staff inventory holdings';
