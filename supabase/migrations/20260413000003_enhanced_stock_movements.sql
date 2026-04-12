-- Migration: Enhanced Stock Movements
-- Date: 2026-04-13
-- Description: Detailed location tracking and value recording for stock movements

-- 1. Add location tracking columns to stock_movements
ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS from_location_type TEXT CHECK (from_location_type IN ('warehouse', 'staff', 'pos', 'vendor', 'external')),
ADD COLUMN IF NOT EXISTS to_location_type TEXT CHECK (to_location_type IN ('warehouse', 'staff', 'pos', 'sale', 'adjustment', 'external')),
ADD COLUMN IF NOT EXISTS from_id UUID,
ADD COLUMN IF NOT EXISTS to_id UUID,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
ADD COLUMN IF NOT EXISTS total_value NUMERIC;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(from_location_type, to_location_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_value ON stock_movements(total_value) WHERE total_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_id ON stock_movements(from_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_id ON stock_movements(to_id);

-- 2. Function to record stock movement with full details
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_product_id UUID,
  p_from_type TEXT,
  p_from_id UUID,
  p_to_type TEXT,
  p_to_id UUID,
  p_quantity NUMERIC,
  p_movement_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_unit_price NUMERIC;
  v_movement_id UUID;
BEGIN
  -- Get unit price if not provided
  IF p_unit_price IS NULL THEN
    SELECT base_price INTO v_unit_price
    FROM products WHERE id = p_product_id;
  ELSE
    v_unit_price := p_unit_price;
  END IF;
  
  -- Insert movement with full tracking
  INSERT INTO stock_movements (
    product_id,
    from_location_type,
    from_id,
    to_location_type,
    to_id,
    quantity,
    movement_type,
    reference_id,
    reference_type,
    notes,
    unit_price,
    total_value
  ) VALUES (
    p_product_id,
    p_from_type,
    p_from_id,
    p_to_type,
    p_to_id,
    p_quantity,
    p_movement_type,
    p_reference_id,
    CASE p_movement_type
      WHEN 'sale' THEN 'sale'
      WHEN 'transfer_in' THEN 'transfer'
      WHEN 'transfer_out' THEN 'transfer'
      WHEN 'adjustment' THEN 'adjustment'
      ELSE 'manual'
    END,
    p_reason,
    v_unit_price,
    ABS(p_quantity) * COALESCE(v_unit_price, 0)
  )
  RETURNING id INTO v_movement_id;
  
  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to adjust stock with reason
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id UUID,
  p_location_type TEXT,
  p_location_id UUID,
  p_quantity_change NUMERIC, -- Positive for addition, negative for deduction
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_adjusted_by UUID DEFAULT auth.uid()
) RETURNS JSONB AS $$
DECLARE
  v_current_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_new_quantity NUMERIC;
  v_movement_id UUID;
  v_table_name TEXT;
  v_result JSONB;
BEGIN
  -- Get unit price
  SELECT base_price INTO v_unit_price
  FROM products WHERE id = p_product_id;
  
  -- Determine table and get current quantity
  IF p_location_type = 'warehouse' THEN
    v_table_name := 'product_stock';
    SELECT quantity INTO v_current_quantity
    FROM product_stock
    WHERE warehouse_id = p_location_id AND product_id = p_product_id;
  ELSIF p_location_type = 'staff' THEN
    v_table_name := 'staff_stock';
    SELECT quantity INTO v_current_quantity
    FROM staff_stock
    WHERE staff_id = p_location_id AND product_id = p_product_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid location type');
  END IF;
  
  v_current_quantity := COALESCE(v_current_quantity, 0);
  v_new_quantity := v_current_quantity + p_quantity_change;
  
  -- Validate: can't go negative
  IF v_new_quantity < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient stock. Current: %s, Change: %s, Result: %s', 
        v_current_quantity, p_quantity_change, v_new_quantity)
    );
  END IF;
  
  -- Update stock
  IF p_location_type = 'warehouse' THEN
    IF v_current_quantity = 0 AND p_quantity_change > 0 THEN
      -- Insert new record
      INSERT INTO product_stock (warehouse_id, product_id, quantity)
      VALUES (p_location_id, p_product_id, p_quantity_change);
    ELSE
      -- Update existing
      UPDATE product_stock
      SET quantity = v_new_quantity,
          updated_at = NOW()
      WHERE warehouse_id = p_location_id AND product_id = p_product_id;
    END IF;
  ELSIF p_location_type = 'staff' THEN
    -- Get warehouse_id for staff
    DECLARE
      v_warehouse_id UUID;
    BEGIN
      SELECT warehouse_id INTO v_warehouse_id
      FROM user_roles
      WHERE user_id = p_location_id
      LIMIT 1;
      
      IF v_current_quantity = 0 AND p_quantity_change > 0 THEN
        INSERT INTO staff_stock (staff_id, product_id, warehouse_id, quantity)
        VALUES (p_location_id, p_product_id, v_warehouse_id, p_quantity_change);
      ELSE
        UPDATE staff_stock
        SET quantity = v_new_quantity
        WHERE staff_id = p_location_id AND product_id = p_product_id;
      END IF;
    END;
  END IF;
  
  -- Record movement
  v_movement_id := record_stock_movement(
    p_product_id,
    p_location_type,
    p_location_id,
    CASE WHEN p_quantity_change > 0 THEN p_location_type ELSE 'adjustment' END,
    CASE WHEN p_quantity_change > 0 THEN p_location_id ELSE NULL END,
    p_quantity_change,
    'adjustment',
    NULL,
    p_reason,
    v_unit_price
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'previous_quantity', v_current_quantity,
    'quantity_change', p_quantity_change,
    'new_quantity', v_new_quantity,
    'unit_price', v_unit_price,
    'value_change', ABS(p_quantity_change) * COALESCE(v_unit_price, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to get stock history for a product
CREATE OR REPLACE FUNCTION get_stock_history(
  p_product_id UUID,
  p_location_type TEXT DEFAULT NULL,
  p_location_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE(
  id UUID,
  movement_type TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  total_value NUMERIC,
  from_location TEXT,
  to_location TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ,
  created_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sm.id,
    sm.movement_type,
    sm.quantity,
    sm.unit_price,
    sm.total_value,
    CASE 
      WHEN sm.from_location_type = 'warehouse' THEN w_from.name
      WHEN sm.from_location_type = 'staff' THEN COALESCE(u_from.raw_user_meta_data->>'full_name', 'Unknown')
      ELSE sm.from_location_type
    END as from_location,
    CASE 
      WHEN sm.to_location_type = 'warehouse' THEN w_to.name
      WHEN sm.to_location_type = 'staff' THEN COALESCE(u_to.raw_user_meta_data->>'full_name', 'Unknown')
      WHEN sm.to_location_type = 'sale' THEN 'Sale'
      ELSE sm.to_location_type
    END as to_location,
    sm.notes as reason,
    sm.created_at,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = sm.created_by),
      'System'
    ) as created_by
  FROM stock_movements sm
  LEFT JOIN warehouses w_from ON w_from.id = sm.from_id AND sm.from_location_type = 'warehouse'
  LEFT JOIN warehouses w_to ON w_to.id = sm.to_id AND sm.to_location_type = 'warehouse'
  LEFT JOIN auth.users u_from ON u_from.id = sm.from_id AND sm.from_location_type = 'staff'
  LEFT JOIN auth.users u_to ON u_to.id = sm.to_id AND sm.to_location_type = 'staff'
  WHERE sm.product_id = p_product_id
  AND (p_location_type IS NULL OR sm.from_location_type = p_location_type OR sm.to_location_type = p_location_type)
  AND (p_location_id IS NULL OR sm.from_id = p_location_id OR sm.to_id = p_location_id)
  AND (p_start_date IS NULL OR sm.created_at >= p_start_date)
  AND (p_end_date IS NULL OR sm.created_at <= p_end_date::timestamptz + interval '1 day')
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Function to get current stock levels
CREATE OR REPLACE FUNCTION get_current_stock(
  p_product_id UUID,
  p_location_type TEXT,
  p_location_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_quantity NUMERIC;
BEGIN
  IF p_location_type = 'warehouse' THEN
    SELECT quantity INTO v_quantity
    FROM product_stock
    WHERE warehouse_id = p_location_id AND product_id = p_product_id;
  ELSIF p_location_type = 'staff' THEN
    SELECT quantity INTO v_quantity
    FROM staff_stock
    WHERE staff_id = p_location_id AND product_id = p_product_id;
  END IF;
  
  RETURN COALESCE(v_quantity, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. View for stock movement summary
CREATE OR REPLACE VIEW stock_movement_summary AS
SELECT 
  sm.product_id,
  p.name as product_name,
  p.sku as product_sku,
  sm.from_location_type,
  sm.to_location_type,
  sm.movement_type,
  COUNT(*) as movement_count,
  SUM(ABS(sm.quantity)) as total_quantity,
  SUM(sm.total_value) as total_value,
  DATE(sm.created_at) as movement_date
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
GROUP BY sm.product_id, p.name, p.sku, sm.from_location_type, sm.to_location_type, sm.movement_type, DATE(sm.created_at);

-- Grant permissions
GRANT EXECUTE ON FUNCTION record_stock_movement TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock TO authenticated;
GRANT EXECUTE ON FUNCTION get_stock_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_stock TO authenticated;

COMMENT ON FUNCTION record_stock_movement IS 'Records detailed stock movement with location tracking';
COMMENT ON FUNCTION adjust_stock IS 'Adjusts stock at a location with reason tracking';
COMMENT ON FUNCTION get_stock_history IS 'Retrieves stock movement history for a product';
