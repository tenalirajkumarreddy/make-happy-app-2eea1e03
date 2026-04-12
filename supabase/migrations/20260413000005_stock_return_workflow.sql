-- Migration: Stock Return Workflow System
-- Date: 2026-04-13
-- Description: Complete return workflow with approval process

-- 1. Create stock_return_requests table
CREATE TABLE IF NOT EXISTS stock_return_requests (
  -- Primary
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT UNIQUE,
  
  -- Parties
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  reviewed_by UUID REFERENCES auth.users(id),
  
  -- Status & Tracking
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'pending', 'review', 'approved', 'partial', 'damaged', 'rejected', 'cancelled', 'completed')),
  
  -- Return Details
  return_reason TEXT NOT NULL CHECK (return_reason IN (
    'end_of_day', 'route_completed', 'unsold_stock', 'damaged_goods', 'expired', 'wrong_item', 'other'
  )),
  custom_reason TEXT,
  
  -- Quantities
  requested_items_count INTEGER NOT NULL DEFAULT 0,
  approved_items_count INTEGER DEFAULT 0,
  rejected_items_count INTEGER DEFAULT 0,
  damaged_items_count INTEGER DEFAULT 0,
  
  -- Values
  total_requested_value NUMERIC DEFAULT 0,
  total_approved_value NUMERIC DEFAULT 0,
  damaged_value NUMERIC DEFAULT 0,
  
  -- Damage Tracking
  damage_notes TEXT,
  
  -- Notes
  staff_notes TEXT,
  reviewer_notes TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_return_requests_staff ON stock_return_requests(staff_id);
CREATE INDEX idx_return_requests_warehouse ON stock_return_requests(warehouse_id);
CREATE INDEX idx_return_requests_status ON stock_return_requests(status);
CREATE INDEX idx_return_requests_display ON stock_return_requests(display_id);
CREATE INDEX idx_return_requests_dates ON stock_return_requests(created_at, submitted_at);

-- 2. Create stock_return_items table
CREATE TABLE IF NOT EXISTS stock_return_items (
  -- Primary
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES stock_return_requests(id) ON DELETE CASCADE,
  
  -- Product
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- Quantities
  requested_quantity NUMERIC NOT NULL CHECK (requested_quantity > 0),
  approved_quantity NUMERIC CHECK (approved_quantity >= 0),
  received_quantity NUMERIC CHECK (received_quantity >= 0),
  damaged_quantity NUMERIC DEFAULT 0 CHECK (damaged_quantity >= 0),
  
  -- Unit & Value
  unit_price NUMERIC NOT NULL,
  requested_value NUMERIC GENERATED ALWAYS AS (requested_quantity * unit_price) STORED,
  approved_value NUMERIC GENERATED ALWAYS AS (COALESCE(approved_quantity, 0) * unit_price) STORED,
  
  -- Status per item
  item_status TEXT DEFAULT 'pending' 
    CHECK (item_status IN ('pending', 'approved', 'partial', 'damaged', 'rejected')),
  
  -- Notes
  staff_notes TEXT,
  reviewer_notes TEXT,
  damage_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_return_items_request ON stock_return_items(return_request_id);
CREATE INDEX idx_return_items_product ON stock_return_items(product_id);
CREATE INDEX idx_return_items_status ON stock_return_items(item_status);

-- 3. Create stock_return_approvals table (Audit Trail)
CREATE TABLE IF NOT EXISTS stock_return_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES stock_return_requests(id) ON DELETE CASCADE,
  
  -- Who
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  approver_role TEXT NOT NULL,
  
  -- What
  approval_action TEXT NOT NULL CHECK (approval_action IN (
    'submit', 'review_start', 'approve', 'approve_partial', 'mark_damaged', 'reject', 'complete', 'cancel'
  )),
  
  -- Details
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  notes TEXT,
  
  -- Snapshot
  items_approved INTEGER DEFAULT 0,
  items_rejected INTEGER DEFAULT 0,
  items_damaged INTEGER DEFAULT 0,
  value_approved NUMERIC DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_return_approvals_request ON stock_return_approvals(return_request_id);

-- 4. Function to generate display ID
CREATE OR REPLACE FUNCTION generate_return_display_id()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_sequence INTEGER;
  v_display_id TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(display_id FROM 'RET-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO v_sequence
  FROM stock_return_requests
  WHERE display_id LIKE 'RET-' || v_year || '-%';
  
  NEW.display_id := 'RET-' || v_year || '-' || LPAD(v_sequence::TEXT, 4, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_generate_return_display_id ON stock_return_requests;

-- Create trigger
CREATE TRIGGER trg_generate_return_display_id
BEFORE INSERT ON stock_return_requests
FOR EACH ROW
WHEN (NEW.display_id IS NULL)
EXECUTE FUNCTION generate_return_display_id();

-- 5. Function to submit stock return
CREATE OR REPLACE FUNCTION submit_stock_return(
  p_staff_id UUID,
  p_warehouse_id UUID,
  p_return_reason TEXT,
  p_custom_reason TEXT DEFAULT NULL,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_return_id UUID;
  v_total_value NUMERIC := 0;
  v_item_count INTEGER := 0;
  v_item RECORD;
  v_product RECORD;
  v_available_qty NUMERIC;
  v_unit_price NUMERIC;
  v_return_item_id UUID;
BEGIN
  -- Validate items array
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one item required');
  END IF;
  
  -- Validate all items exist in staff stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT quantity INTO v_available_qty
    FROM staff_stock
    WHERE staff_id = p_staff_id
    AND product_id = (v_item->>'product_id')::UUID
    AND warehouse_id = p_warehouse_id;
    
    IF v_available_qty IS NULL OR v_available_qty < COALESCE((v_item->>'quantity')::NUMERIC, 0) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Insufficient stock for product %s. Available: %s, Requested: %s',
          v_item->>'product_id',
          COALESCE(v_available_qty, 0),
          COALESCE((v_item->>'quantity')::NUMERIC, 0)
        )
      );
    END IF;
  END LOOP;
  
  -- Create return request
  INSERT INTO stock_return_requests (
    staff_id, warehouse_id, status, return_reason, custom_reason
  ) VALUES (
    p_staff_id, p_warehouse_id, 'pending', p_return_reason, p_custom_reason
  )
  RETURNING id INTO v_return_id;
  
  -- Insert return items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Get product price
    SELECT base_price INTO v_unit_price
    FROM products WHERE id = (v_item->>'product_id')::UUID;
    
    INSERT INTO stock_return_items (
      return_request_id, product_id, requested_quantity, unit_price, staff_notes
    ) VALUES (
      v_return_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::NUMERIC,
      COALESCE(v_unit_price, 0),
      v_item->>'notes'
    );
    
    v_total_value := v_total_value + ((v_item->>'quantity')::NUMERIC * COALESCE(v_unit_price, 0));
    v_item_count := v_item_count + 1;
  END LOOP;
  
  -- Update totals
  UPDATE stock_return_requests
  SET 
    requested_items_count = v_item_count,
    total_requested_value = v_total_value,
    submitted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_return_id;
  
  -- Log approval
  INSERT INTO stock_return_approvals (
    return_request_id, approver_id, approver_role, approval_action,
    previous_status, new_status, notes
  ) VALUES (
    v_return_id, p_staff_id, 'staff', 'submit',
    'draft', 'pending', 'Submitted for approval'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'display_id', (SELECT display_id FROM stock_return_requests WHERE id = v_return_id),
    'item_count', v_item_count,
    'total_value', v_total_value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to review/approve return
CREATE OR REPLACE FUNCTION review_stock_return(
  p_return_id UUID,
  p_reviewer_id UUID,
  p_action TEXT,
  p_item_decisions JSONB,
  p_overall_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_decision RECORD;
  v_new_status TEXT;
  v_total_approved INTEGER := 0;
  v_total_damaged INTEGER := 0;
  v_total_rejected INTEGER := 0;
  v_approved_value NUMERIC := 0;
  v_damaged_value NUMERIC := 0;
  v_previous_status TEXT;
  v_staff_id UUID;
  v_warehouse_id UUID;
  v_product_id UUID;
  v_approved_qty NUMERIC;
  v_damaged_qty NUMERIC;
BEGIN
  -- Get return details
  SELECT * INTO v_return
  FROM stock_return_requests
  WHERE id = p_return_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return request not found');
  END IF;
  
  v_previous_status := v_return.status;
  v_staff_id := v_return.staff_id;
  v_warehouse_id := v_return.warehouse_id;
  
  -- Determine new status
  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'approve_partial' THEN 'partial'
    WHEN 'mark_damaged' THEN 'damaged'
    WHEN 'reject' THEN 'rejected'
    WHEN 'complete' THEN 'completed'
    ELSE v_return.status
  END;
  
  -- Process each item decision
  FOR v_decision IN SELECT * FROM jsonb_array_elements(p_item_decisions) LOOP
    SELECT * INTO v_item
    FROM stock_return_items
    WHERE id = (v_decision->>'item_id')::UUID
    AND return_request_id = p_return_id;
    
    IF FOUND THEN
      v_approved_qty := COALESCE((v_decision->>'approved_quantity')::NUMERIC, 0);
      v_damaged_qty := COALESCE((v_decision->>'damaged_quantity')::NUMERIC, 0);
      v_product_id := v_item.product_id;
      
      -- Update item
      UPDATE stock_return_items
      SET 
        approved_quantity = v_approved_qty,
        damaged_quantity = v_damaged_qty,
        item_status = v_decision->>'decision',
        reviewer_notes = v_decision->>'notes',
        updated_at = NOW()
      WHERE id = v_item.id;
      
      -- Track totals
      IF v_decision->>'decision' = 'approved' THEN
        v_total_approved := v_total_approved + 1;
        v_approved_value := v_approved_value + (v_approved_qty * v_item.unit_price);
        
        -- Transfer approved stock back to warehouse
        UPDATE product_stock
        SET quantity = quantity + v_approved_qty,
            updated_at = NOW()
        WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
        
        -- Deduct from staff
        UPDATE staff_stock
        SET quantity = quantity - v_approved_qty,
            updated_at = NOW()
        WHERE staff_id = v_staff_id 
        AND product_id = v_product_id 
        AND warehouse_id = v_warehouse_id;
        
        -- Log movement
        INSERT INTO stock_movements (
          product_id, warehouse_id, staff_id, quantity,
          movement_type, reference_type, reference_id, notes
        ) VALUES (
          v_product_id, v_warehouse_id, v_staff_id, v_approved_qty,
          'transfer_in', 'return', p_return_id,
          format('Returned from staff %s', v_staff_id)
        );
        
      ELSIF v_decision->>'decision' = 'damaged' THEN
        v_total_damaged := v_total_damaged + 1;
        v_damaged_value := v_damaged_value + (v_damaged_qty * v_item.unit_price);
        
        -- For damaged goods, still return but mark separately
        UPDATE product_stock
        SET quantity = quantity + v_approved_qty, -- Add good quantity
            updated_at = NOW()
        WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
        
        -- Deduct from staff
        UPDATE staff_stock
        SET quantity = quantity - v_approved_qty - v_damaged_qty,
            updated_at = NOW()
        WHERE staff_id = v_staff_id 
        AND product_id = v_product_id 
        AND warehouse_id = v_warehouse_id;
        
      ELSIF v_decision->>'decision' = 'rejected' THEN
        v_total_rejected := v_total_rejected + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Update return request
  UPDATE stock_return_requests
  SET 
    status = v_new_status,
    reviewed_by = p_reviewer_id,
    approved_items_count = v_total_approved,
    damaged_items_count = v_total_damaged,
    rejected_items_count = v_total_rejected,
    total_approved_value = v_approved_value,
    damaged_value = v_damaged_value,
    reviewer_notes = p_overall_notes,
    reviewed_at = CASE WHEN v_new_status IN ('approved', 'partial', 'damaged', 'rejected') THEN NOW() ELSE reviewed_at END,
    completed_at = CASE WHEN v_new_status = 'completed' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = p_return_id;
  
  -- Log approval
  INSERT INTO stock_return_approvals (
    return_request_id, approver_id, approver_role, approval_action,
    previous_status, new_status, notes,
    items_approved, items_rejected, items_damaged, value_approved
  ) VALUES (
    p_return_id, p_reviewer_id, 
    (SELECT role FROM user_roles WHERE user_id = p_reviewer_id LIMIT 1),
    p_action, v_previous_status, v_new_status, p_overall_notes,
    v_total_approved, v_total_rejected, v_total_damaged, v_approved_value
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'new_status', v_new_status,
    'approved_items', v_total_approved,
    'damaged_items', v_total_damaged,
    'rejected_items', v_total_rejected,
    'approved_value', v_approved_value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get pending returns
CREATE OR REPLACE FUNCTION get_pending_returns(
  p_warehouse_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  display_id TEXT,
  staff_id UUID,
  staff_name TEXT,
  warehouse_id UUID,
  warehouse_name TEXT,
  status TEXT,
  return_reason TEXT,
  requested_items_count INTEGER,
  total_requested_value NUMERIC,
  submitted_at TIMESTAMPTZ,
  submitted_hours_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.display_id,
    r.staff_id,
    COALESCE(u.raw_user_meta_data->>'full_name', 'Unknown') as staff_name,
    r.warehouse_id,
    w.name as warehouse_name,
    r.status,
    r.return_reason,
    r.requested_items_count,
    r.total_requested_value,
    r.submitted_at,
    EXTRACT(HOUR FROM (NOW() - r.submitted_at))::INTEGER as submitted_hours_ago
  FROM stock_return_requests r
  JOIN warehouses w ON w.id = r.warehouse_id
  LEFT JOIN auth.users u ON u.id = r.staff_id
  WHERE r.status IN ('pending', 'review')
  AND (p_warehouse_id IS NULL OR r.warehouse_id = p_warehouse_id)
  ORDER BY r.submitted_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 8. Function to get my return requests (for staff)
CREATE OR REPLACE FUNCTION get_my_return_requests(
  p_staff_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  display_id TEXT,
  status TEXT,
  return_reason TEXT,
  requested_items_count INTEGER,
  approved_items_count INTEGER,
  total_requested_value NUMERIC,
  total_approved_value NUMERIC,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.display_id,
    r.status,
    r.return_reason,
    r.requested_items_count,
    r.approved_items_count,
    r.total_requested_value,
    r.total_approved_value,
    r.submitted_at,
    r.reviewed_at,
    r.completed_at
  FROM stock_return_requests r
  WHERE r.staff_id = p_staff_id
  AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9. Function to cancel return request
CREATE OR REPLACE FUNCTION cancel_stock_return(
  p_return_id UUID,
  p_staff_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_return RECORD;
BEGIN
  SELECT * INTO v_return
  FROM stock_return_requests
  WHERE id = p_return_id AND staff_id = p_staff_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return request not found');
  END IF;
  
  IF v_return.status NOT IN ('draft', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel draft or pending requests');
  END IF;
  
  UPDATE stock_return_requests
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_return_id;
  
  INSERT INTO stock_return_approvals (
    return_request_id, approver_id, approver_role, approval_action,
    previous_status, new_status, notes
  ) VALUES (
    p_return_id, p_staff_id, 'staff', 'cancel',
    v_return.status, 'cancelled', 'Cancelled by staff'
  );
  
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RLS Policies
ALTER TABLE stock_return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_return_approvals ENABLE ROW LEVEL SECURITY;

-- Staff can view own returns
CREATE POLICY "Staff view own returns" ON stock_return_requests
  FOR SELECT USING (staff_id = auth.uid());

-- Managers can view all returns for their warehouses
CREATE POLICY "Manager view warehouse returns" ON stock_return_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('manager', 'super_admin')
      AND ur.warehouse_id = stock_return_requests.warehouse_id
    )
  );

-- Staff can create returns
CREATE POLICY "Staff create returns" ON stock_return_requests
  FOR INSERT WITH CHECK (staff_id = auth.uid());

-- Staff can update own draft returns
CREATE POLICY "Staff update own returns" ON stock_return_requests
  FOR UPDATE USING (staff_id = auth.uid() AND status IN ('draft', 'pending'));

-- Managers can update all
CREATE POLICY "Manager update returns" ON stock_return_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('manager', 'super_admin')
    )
  );

-- Item policies
CREATE POLICY "Staff view own return items" ON stock_return_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stock_return_requests r
      WHERE r.id = stock_return_items.return_request_id
      AND r.staff_id = auth.uid()
    )
  );

CREATE POLICY "Manager view return items" ON stock_return_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM stock_return_requests r
      JOIN user_roles ur ON ur.warehouse_id = r.warehouse_id
      WHERE r.id = stock_return_items.return_request_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('manager', 'super_admin')
    )
  );

-- Approval policies
CREATE POLICY "View return approvals" ON stock_return_approvals
  FOR SELECT USING (true);

-- Grant permissions
GRANT EXECUTE ON FUNCTION submit_stock_return TO authenticated;
GRANT EXECUTE ON FUNCTION review_stock_return TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_returns TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_return_requests TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_stock_return TO authenticated;

COMMENT ON TABLE stock_return_requests IS 'Tracks stock return requests from staff to warehouse with approval workflow';
COMMENT ON TABLE stock_return_items IS 'Individual items within a return request';
COMMENT ON TABLE stock_return_approvals IS 'Audit trail of all return approvals and status changes';
