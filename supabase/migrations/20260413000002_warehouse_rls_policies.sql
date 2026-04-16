-- Migration: Warehouse-Scoped RLS Policies
-- Phase 4: Scale & Polish - Issue #10
-- Created: 2026-04-13
-- Depends on: 20260413000001_enforce_warehouse_scoping.sql

-- ============================================
-- SALES TABLE - Warehouse Scoping
-- ============================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view sales in their warehouses" ON sales;
DROP POLICY IF EXISTS "Users can insert sales in their warehouses" ON sales;
DROP POLICY IF EXISTS "Users can update sales in their warehouses" ON sales;

-- Policy: Users can view sales from warehouses they have access to
CREATE POLICY "Users can view sales in their warehouses"
ON sales FOR SELECT
TO authenticated
USING (
  -- Staff users: check warehouse access
  (
    user_is_staff(auth.uid()) 
    AND (
      -- Super admin sees all
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
      )
      OR
      -- Others need warehouse access
      (
        warehouse_id IS NOT NULL 
        AND user_has_warehouse_access(auth.uid(), warehouse_id)
      )
      OR
      -- Legacy: no warehouse_id (for backward compatibility during transition)
      warehouse_id IS NULL
    )
  )
  OR
  -- Customers: can see their own sales (cross-warehouse, customer-scoped)
  (
    EXISTS (
      SELECT 1 FROM customers c
      JOIN stores s ON s.id = sales.store_id
      WHERE c.user_id = auth.uid()
      AND s.id = sales.store_id
    )
  )
);

-- Policy: Users can insert sales in their assigned warehouses
CREATE POLICY "Users can insert sales in their warehouses"
ON sales FOR INSERT
TO authenticated
WITH CHECK (
  -- Must have warehouse access or be creating for assigned store
  (
    user_is_staff(auth.uid())
    AND (
      -- Super admin can insert anywhere
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
      )
      OR
      -- Must have warehouse access for this sale
      (
        warehouse_id IS NOT NULL 
        AND user_has_warehouse_access(auth.uid(), warehouse_id)
      )
      OR
      -- OR store is assigned to this user
      EXISTS (
        SELECT 1 FROM stores
        WHERE id = store_id
        AND assigned_to = auth.uid()
      )
    )
  )
  OR
  -- Customers can create sales for their stores
  (
    EXISTS (
      SELECT 1 FROM stores s
      JOIN customers c ON c.store_id = s.id
      WHERE s.id = store_id
      AND c.user_id = auth.uid()
    )
  )
);

-- Policy: Users can update sales in their warehouses
CREATE POLICY "Users can update sales in their warehouses"
ON sales FOR UPDATE
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

-- ============================================
-- TRANSACTIONS TABLE - Warehouse Scoping
-- ============================================

DROP POLICY IF EXISTS "Users can view transactions in their warehouses" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their warehouses" ON transactions;

-- Policy: Users can view transactions from their warehouses
CREATE POLICY "Users can view transactions in their warehouses"
ON transactions FOR SELECT
TO authenticated
USING (
  -- Staff users
  (
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
  )
  OR
  -- Customers: their store's transactions
  (
    EXISTS (
      SELECT 1 FROM stores s
      JOIN customers c ON c.store_id = s.id
      WHERE s.id = transactions.store_id
      AND c.user_id = auth.uid()
    )
  )
);

-- Policy: Users can insert transactions in their warehouses
CREATE POLICY "Users can insert transactions in their warehouses"
ON transactions FOR INSERT
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
    OR
    EXISTS (
      SELECT 1 FROM stores
      WHERE id = store_id
      AND assigned_to = auth.uid()
    )
  )
);

-- ============================================
-- STORES TABLE - Warehouse Scoping
-- ============================================

DROP POLICY IF EXISTS "Users can view stores in their warehouses" ON stores;
DROP POLICY IF EXISTS "Users can update stores in their warehouses" ON stores;

-- Policy: Users can view stores from their warehouses
CREATE POLICY "Users can view stores in their warehouses"
ON stores FOR SELECT
TO authenticated
USING (
  -- Staff users
  (
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
  )
  OR
  -- Public stores (customer portal)
  is_active = true
);

-- Policy: Staff can update stores in their warehouses
CREATE POLICY "Users can update stores in their warehouses"
ON stores FOR UPDATE
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

-- ============================================
-- STAFF_STOCK TABLE - Warehouse Scoping
-- ============================================

DROP POLICY IF EXISTS "Users can view staff stock in their warehouses" ON staff_stock;
DROP POLICY IF EXISTS "Users can update staff stock in their warehouses" ON staff_stock;

-- Policy: Users can view staff stock from their warehouses
CREATE POLICY "Users can view staff stock in their warehouses"
ON staff_stock FOR SELECT
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
    user_id = auth.uid()  -- Can always see own stock
  )
);

-- Policy: Users can update staff stock in their warehouses
CREATE POLICY "Users can update staff stock in their warehouses"
ON staff_stock FOR UPDATE
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
    user_id = auth.uid()  -- Can always update own stock
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
    OR
    user_id = auth.uid()
  )
);

-- ============================================
-- STOCK_MOVEMENTS TABLE - Warehouse Scoping
-- ============================================

DROP POLICY IF EXISTS "Users can view stock movements in their warehouses" ON stock_movements;
DROP POLICY IF EXISTS "Users can insert stock movements in their warehouses" ON stock_movements;

-- Policy: Users can view stock movements from their warehouses
CREATE POLICY "Users can view stock movements in their warehouses"
ON stock_movements FOR SELECT
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
  )
);

-- Policy: Users can insert stock movements in their warehouses
CREATE POLICY "Users can insert stock movements in their warehouses"
ON stock_movements FOR INSERT
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

-- ============================================
-- ORDERS TABLE - Warehouse Scoping
-- ============================================

DROP POLICY IF EXISTS "Users can view orders in their warehouses" ON orders;
DROP POLICY IF EXISTS "Users can insert orders in their warehouses" ON orders;
DROP POLICY IF EXISTS "Users can update orders in their warehouses" ON orders;

-- Policy: Users can view orders from their warehouses
CREATE POLICY "Users can view orders in their warehouses"
ON orders FOR SELECT
TO authenticated
USING (
  -- Staff users
  (
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
  )
  OR
  -- Customers: their own orders
  (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  )
);

-- Policy: Users can insert orders in their warehouses
CREATE POLICY "Users can insert orders in their warehouses"
ON orders FOR INSERT
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

-- Policy: Users can update orders in their warehouses
CREATE POLICY "Users can update orders in their warehouses"
ON orders FOR UPDATE
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

-- Add comments
COMMENT ON POLICY "Users can view sales in their warehouses" ON sales IS 'Warehouse-scoped sales viewing policy';
COMMENT ON POLICY "Users can insert sales in their warehouses" ON sales IS 'Warehouse-scoped sales insertion policy';
COMMENT ON POLICY "Users can view transactions in their warehouses" ON transactions IS 'Warehouse-scoped transaction viewing policy';
COMMENT ON POLICY "Users can view stores in their warehouses" ON stores IS 'Warehouse-scoped store viewing policy';
