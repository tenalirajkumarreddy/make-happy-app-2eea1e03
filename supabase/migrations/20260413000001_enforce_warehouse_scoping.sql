-- Migration: Enforce Warehouse Scoping in RLS Policies
-- Phase 4: Scale & Polish - Issue #10
-- Created: 2026-04-13

-- Helper function to get user's accessible warehouses
CREATE OR REPLACE FUNCTION get_user_warehouses(p_user_id UUID)
RETURNS TABLE(warehouse_id UUID) AS $$
BEGIN
  -- Super admin can access all warehouses
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_user_id 
    AND role = 'super_admin'
  ) THEN
    RETURN QUERY SELECT w.id FROM warehouses w;
  ELSE
    -- Regular users only see their assigned warehouses
    RETURN QUERY 
    SELECT DISTINCT ur.warehouse_id 
    FROM user_roles ur 
    WHERE ur.user_id = p_user_id 
    AND ur.warehouse_id IS NOT NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user has access to specific warehouse
CREATE OR REPLACE FUNCTION user_has_warehouse_access(
  p_user_id UUID,
  p_warehouse_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin has access to all warehouses
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_user_id 
    AND role = 'super_admin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has access to this specific warehouse
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
    AND warehouse_id = p_warehouse_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function to check if user is staff (has any warehouse access)
CREATE OR REPLACE FUNCTION user_is_staff(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
    AND role IN ('super_admin', 'manager', 'agent', 'marketer', 'pos')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Comment on functions
COMMENT ON FUNCTION get_user_warehouses IS 'Returns all warehouses accessible to a user based on their role assignments';
COMMENT ON FUNCTION user_has_warehouse_access IS 'Checks if a user has access to a specific warehouse';
COMMENT ON FUNCTION user_is_staff IS 'Checks if a user has any staff role';
