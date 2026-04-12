-- Migration: Bulk Operations Support
-- Phase 4: Scale & Polish - Issue #14
-- Created: 2026-04-17

-- Create bulk_operations audit table
CREATE TABLE IF NOT EXISTS bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL, -- price_update, store_assignment, credit_limit, archive
  record_count INTEGER NOT NULL,
  affected_ids UUID[] NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  details JSONB NOT NULL, -- {parameters: {...}, results: {...}, before_values: {...}}
  status TEXT DEFAULT 'completed', -- pending, completed, failed, partial
  error_message TEXT,
  warehouse_id UUID REFERENCES warehouses(id),
  completed_at TIMESTAMPTZ,
  execution_time_ms INTEGER -- execution time in milliseconds
);

-- Create indexes
CREATE INDEX idx_bulk_operations_type ON bulk_operations(operation_type);
CREATE INDEX idx_bulk_operations_performed_by ON bulk_operations(performed_by);
CREATE INDEX idx_bulk_operations_performed_at ON bulk_operations(performed_at);
CREATE INDEX idx_bulk_operations_warehouse ON bulk_operations(warehouse_id);

-- RLS policies for bulk_operations
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view bulk operations from their warehouses
CREATE POLICY "Users can view bulk operations"
ON bulk_operations FOR SELECT
TO authenticated
USING (
  performed_by = auth.uid()
  OR
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
);

-- Policy: Users can insert their own bulk operations
CREATE POLICY "Users can insert bulk operations"
ON bulk_operations FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
);

-- ============================================
-- BULK UPDATE PRICES
-- ============================================
CREATE OR REPLACE FUNCTION bulk_update_prices(
  p_product_ids UUID[],
  p_price_change NUMERIC,
  p_is_percentage BOOLEAN DEFAULT FALSE,
  p_round_to DECIMAL DEFAULT 0.01 -- rounding precision
) RETURNS JSONB AS $$
DECLARE
  v_affected_count INTEGER := 0;
  v_before_values JSONB := '[]'::jsonb;
  v_operation_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_warehouse_id UUID;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get user's warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Capture before values for audit
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'old_price', price
  ))
  INTO v_before_values
  FROM products
  WHERE id = ANY(p_product_ids);
  
  -- Perform bulk update
  IF p_is_percentage THEN
    UPDATE products
    SET 
      price = ROUND((price * (1 + p_price_change / 100))::numeric / p_round_to) * p_round_to,
      updated_at = now()
    WHERE id = ANY(p_product_ids)
    AND (
      -- Super admin can update any
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
      )
      OR
      -- Manager can update in their warehouses
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'manager')
        AND (
          -- Product is in user's warehouse
          EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = products.id
            AND (
              -- Check if product has no warehouse restriction
              NOT EXISTS (
                SELECT 1 FROM product_warehouses pw
                WHERE pw.product_id = p.id
              )
              OR
              -- Check if product is in user's warehouse
              EXISTS (
                SELECT 1 FROM product_warehouses pw
                WHERE pw.product_id = p.id
                AND pw.warehouse_id = v_warehouse_id
              )
            )
          )
        )
      )
    );
  ELSE
    UPDATE products
    SET 
      price = ROUND((price + p_price_change)::numeric / p_round_to) * p_round_to,
      updated_at = now()
    WHERE id = ANY(p_product_ids)
    AND (
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'manager')
      )
    );
  END IF;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  v_end_time := clock_timestamp();
  
  -- Log bulk operation
  INSERT INTO bulk_operations (
    operation_type,
    record_count,
    affected_ids,
    performed_by,
    details,
    warehouse_id,
    completed_at,
    execution_time_ms
  ) VALUES (
    'price_update',
    v_affected_count,
    p_product_ids,
    auth.uid(),
    jsonb_build_object(
      'parameters', jsonb_build_object(
        'price_change', p_price_change,
        'is_percentage', p_is_percentage,
        'round_to', p_round_to
      ),
      'before_values', v_before_values,
      'results', jsonb_build_object('affected_count', v_affected_count)
    ),
    v_warehouse_id,
    now(),
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER
  )
  RETURNING id INTO v_operation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'affected_count', v_affected_count,
    'operation_id', v_operation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BULK ASSIGN STORES TO AGENT
-- ============================================
CREATE OR REPLACE FUNCTION bulk_assign_stores(
  p_store_ids UUID[],
  p_agent_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_affected_count INTEGER := 0;
  v_before_values JSONB := '[]'::jsonb;
  v_operation_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_warehouse_id UUID;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get user's warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Capture before values
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'old_assigned_to', assigned_to
  ))
  INTO v_before_values
  FROM stores
  WHERE id = ANY(p_store_ids);
  
  -- Verify agent exists and has proper role
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_agent_id
    AND role IN ('agent', 'marketer')
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Agent not found or invalid role'
    );
  END IF;
  
  -- Perform bulk assignment with warehouse scoping
  UPDATE stores
  SET 
    assigned_to = p_agent_id,
    updated_at = now()
  WHERE id = ANY(p_store_ids)
  AND (
    -- Super admin can assign any store
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    -- Manager can assign stores in their warehouses
    (
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'manager'
      )
      AND (
        warehouse_id IS NULL
        OR warehouse_id = v_warehouse_id
      )
    )
  );
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  v_end_time := clock_timestamp();
  
  -- Log bulk operation
  INSERT INTO bulk_operations (
    operation_type,
    record_count,
    affected_ids,
    performed_by,
    details,
    warehouse_id,
    completed_at,
    execution_time_ms
  ) VALUES (
    'store_assignment',
    v_affected_count,
    p_store_ids,
    auth.uid(),
    jsonb_build_object(
      'parameters', jsonb_build_object(
        'agent_id', p_agent_id
      ),
      'before_values', v_before_values,
      'results', jsonb_build_object('affected_count', v_affected_count)
    ),
    v_warehouse_id,
    now(),
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER
  )
  RETURNING id INTO v_operation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'affected_count', v_affected_count,
    'operation_id', v_operation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BULK UPDATE CREDIT LIMITS
-- ============================================
CREATE OR REPLACE FUNCTION bulk_update_credit_limits(
  p_store_ids UUID[],
  p_new_limit NUMERIC,
  p_update_type TEXT DEFAULT 'set' -- 'set', 'increase', 'decrease'
) RETURNS JSONB AS $$
DECLARE
  v_affected_count INTEGER := 0;
  v_before_values JSONB := '[]'::jsonb;
  v_operation_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_warehouse_id UUID;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get user's warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Capture before values
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'old_credit_limit', credit_limit
  ))
  INTO v_before_values
  FROM stores
  WHERE id = ANY(p_store_ids);
  
  -- Perform bulk update based on type
  CASE p_update_type
    WHEN 'set' THEN
      UPDATE stores
      SET 
        credit_limit = p_new_limit,
        updated_at = now()
      WHERE id = ANY(p_store_ids)
      AND (
        EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_id = auth.uid() 
          AND role IN ('super_admin', 'manager')
        )
        OR
        (
          warehouse_id IS NULL
          OR warehouse_id = v_warehouse_id
        )
      );
    WHEN 'increase' THEN
      UPDATE stores
      SET 
        credit_limit = credit_limit + p_new_limit,
        updated_at = now()
      WHERE id = ANY(p_store_ids)
      AND (
        EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_id = auth.uid() 
          AND role IN ('super_admin', 'manager')
        )
        OR
        (
          warehouse_id IS NULL
          OR warehouse_id = v_warehouse_id
        )
      );
    WHEN 'decrease' THEN
      UPDATE stores
      SET 
        credit_limit = GREATEST(0, credit_limit - p_new_limit),
        updated_at = now()
      WHERE id = ANY(p_store_ids)
      AND (
        EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_id = auth.uid() 
          AND role IN ('super_admin', 'manager')
        )
        OR
        (
          warehouse_id IS NULL
          OR warehouse_id = v_warehouse_id
        )
      );
  END CASE;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  v_end_time := clock_timestamp();
  
  -- Log bulk operation
  INSERT INTO bulk_operations (
    operation_type,
    record_count,
    affected_ids,
    performed_by,
    details,
    warehouse_id,
    completed_at,
    execution_time_ms
  ) VALUES (
    'credit_limit',
    v_affected_count,
    p_store_ids,
    auth.uid(),
    jsonb_build_object(
      'parameters', jsonb_build_object(
        'new_limit', p_new_limit,
        'update_type', p_update_type
      ),
      'before_values', v_before_values,
      'results', jsonb_build_object('affected_count', v_affected_count)
    ),
    v_warehouse_id,
    now(),
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER
  )
  RETURNING id INTO v_operation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'affected_count', v_affected_count,
    'operation_id', v_operation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BULK ARCHIVE STORES
-- ============================================
CREATE OR REPLACE FUNCTION bulk_archive_stores(
  p_store_ids UUID[]
) RETURNS JSONB AS $$
DECLARE
  v_affected_count INTEGER := 0;
  v_before_values JSONB := '[]'::jsonb;
  v_operation_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_warehouse_id UUID;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get user's warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Capture before values
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'old_is_active', is_active
  ))
  INTO v_before_values
  FROM stores
  WHERE id = ANY(p_store_ids);
  
  -- Perform bulk archive
  UPDATE stores
  SET 
    is_active = FALSE,
    updated_at = now()
  WHERE id = ANY(p_store_ids)
  AND (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
    OR
    (
      warehouse_id IS NULL
      OR warehouse_id = v_warehouse_id
    )
  );
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  v_end_time := clock_timestamp();
  
  -- Log bulk operation
  INSERT INTO bulk_operations (
    operation_type,
    record_count,
    affected_ids,
    performed_by,
    details,
    warehouse_id,
    completed_at,
    execution_time_ms
  ) VALUES (
    'archive',
    v_affected_count,
    p_store_ids,
    auth.uid(),
    jsonb_build_object(
      'parameters', jsonb_build_object(
        'action', 'archive'
      ),
      'before_values', v_before_values,
      'results', jsonb_build_object('affected_count', v_affected_count)
    ),
    v_warehouse_id,
    now(),
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER
  )
  RETURNING id INTO v_operation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'affected_count', v_affected_count,
    'operation_id', v_operation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE bulk_operations IS 'Audit log for bulk data operations';
COMMENT ON FUNCTION bulk_update_prices IS 'Bulk update product prices with percentage or flat amount';
COMMENT ON FUNCTION bulk_assign_stores IS 'Bulk assign stores to an agent';
COMMENT ON FUNCTION bulk_update_credit_limits IS 'Bulk update store credit limits';
COMMENT ON FUNCTION bulk_archive_stores IS 'Bulk archive (deactivate) stores';
