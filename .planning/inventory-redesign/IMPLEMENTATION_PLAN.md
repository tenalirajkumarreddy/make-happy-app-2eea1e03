# Inventory Page - Complete Redesign Implementation Plan

## Overview
Transform the Inventory page into a comprehensive stock management system with staff inventory tracking, warehouse stock control, POS integration, products management, and raw materials with vendor integration.

---

## 🎯 Requirements Summary

### 1. Staff Inventory (Personal Stock)
- Each staff member maintains their own inventory
- Stock reduces automatically when recording sales
- Initial stock comes from warehouse transfers
- View current holding stock and amounts

### 2. Warehouse Stock
- Central warehouse inventory management
- Role-based access control (who can see/adjust)
- Transfer stock to staff (reduces warehouse stock)
- Adjust stock with reasons

### 3. POS Store Integration
- POS sales draw from warehouse stock (not personal)
- Mandatory payment (Cash or UPI only)
- Auto-created POS store per warehouse
- No outstanding tracking for POS

### 4. Products Management
- Add/edit products with full details
- Categories and pricing
- Image upload
- GST/HSN code support
- Bulk operations

### 5. Raw Materials
- Similar to products but for manufacturing
- Vendor association
- Purchase affects vendor balance
- Vendor payments reduce balance

### 6. UI/UX Improvements
- Responsive design for all screen sizes
- Consistent color scheme
- Better layout and spacing
- Improved navigation
- Loading states and error handling

---

## 📊 Data Model

### Tables Structure

```sql
-- Warehouse stock (central inventory)
warehouse_stock
├── id (uuid)
├── warehouse_id (uuid) → warehouses
├── product_id (uuid) → products
├── quantity (numeric)
├── last_updated (timestamptz)
└── updated_by (uuid)

-- Staff stock (personal inventory)
staff_stock
├── id (uuid)
├── staff_id (uuid) → auth.users
├── product_id (uuid) → products
├── warehouse_id (uuid) → warehouses
├── quantity (numeric)
├── amount_value (numeric) -- Total value of holding
├── last_sale_at (timestamptz)
├── last_received_at (timestamptz)
└── updated_at (timestamptz)

-- Stock movements (audit trail)
stock_movements
├── id (uuid)
├── product_id (uuid)
├── from_location (enum: 'warehouse', 'staff', 'pos')
├── to_location (enum: 'warehouse', 'staff', 'pos', 'sale')
├── from_id (uuid) -- warehouse_id or staff_id
├── to_id (uuid) -- warehouse_id or staff_id
├── quantity (numeric)
├── movement_type (enum)
├── reference_id (uuid)
├── reason (text)
└── created_at (timestamptz)

-- POS stores (auto-created per warehouse)
pos_stores
├── id (uuid)
├── warehouse_id (uuid) → warehouses
├── name (text)
├── is_active (boolean)
└── created_at (timestamptz)

-- Staff inventory holdings summary
staff_inventory_summary
├── id (uuid)
├── staff_id (uuid)
├── warehouse_id (uuid)
├── total_products (int)
├── total_quantity (numeric)
├── total_value (numeric)
└── last_updated (timestamptz)
```

---

## 🏗️ Architecture

### Stock Flow Diagrams

#### Flow 1: Warehouse to Staff Transfer
```
Warehouse Stock (200 units)
    │
    │ Transfer 50 units to Agent X
    │
    ▼
Warehouse Stock (150 units)
    │
    │ Insert movement record
    │
    ▼
Staff Stock - Agent X (50 units)
    │
    │ Amount calculated: 50 × unit_price
    │
    ▼
Update staff_inventory_summary
```

#### Flow 2: Staff Sale Recording
```
Staff Stock - Agent X (50 units)
    │
    │ Record sale: 10 units
    │
    ▼
Staff Stock - Agent X (40 units)
    │
    │ Deduct via trigger
    │
    ▼
Create movement record (sale)
    │
    │ Update amount_value
    │
    ▼
Update summary
```

#### Flow 3: POS Sale (from Warehouse)
```
POS Store (linked to Warehouse)
    │
    │ Record POS sale
    │
    ▼
Warehouse Stock reduced
    │
    │ Mandatory payment collected
    │
    ▼
No outstanding created
```

#### Flow 4: Raw Material Purchase
```
Vendor Balance: ₹10,000
    │
    │ Purchase Raw Material: ₹2,000
    │
    ▼
Vendor Balance: ₹12,000 (increased)
    │
    │ Raw Material Stock increased
    │
    ▼
Create purchase record
```

#### Flow 5: Vendor Payment
```
Vendor Balance: ₹12,000
    │
    │ Record Payment: ₹5,000
    │
    ▼
Vendor Balance: ₹7,000 (reduced)
    │
    │ Create payment transaction
    │
    ▼
Update vendor ledger
```

---

## 📱 UI Structure

### Inventory Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Inventory Management                    [+ Add]    │
├─────────────────────────────────────────────────────────────┤
│ TABS: [My Stock] [Warehouse] [Products] [Raw Materials]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ TAB: My Stock (for agents/marketers)                       │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Summary Cards:                                         ││
│ │ [Total Products: 15] [Total Qty: 250] [Value: ₹45,000] ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Filters: [Search] [Category] [Sort]                    ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Product List:                                          ││
│ │ [Image] Product A - Qty: 50 - Value: ₹5,000 [Action] ││
│ │ [Image] Product B - Qty: 30 - Value: ₹3,000 [Action] ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ TAB: Warehouse (manager/super_admin)                       │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Warehouse Selector: [Dropdown]                        ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Stock Table:                                           ││
│ │ Product | SKU | Stock | Allocated to Staff | Actions   ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Actions: [Transfer to Staff] [Adjust Stock] [History] ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ TAB: Products                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [Same as existing Products page - integrated]         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ TAB: Raw Materials                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [Enhanced Raw Materials with vendor integration]        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Modals

#### 1. Transfer Stock to Staff
```
┌─────────────────────────────────────┐
│ Transfer Stock                      │
├─────────────────────────────────────┤
│ From: Warehouse A                   │
│ Product: Product A                  │
│ Available: 200 units              │
├─────────────────────────────────────┤
│ To Staff: [Dropdown] *              │
│ Quantity: [Input] *                │
│ Unit Price: [Auto/Editable]         │
│ Total Value: [Auto-calculated]      │
│ Notes: [Textarea]                   │
├─────────────────────────────────────┤
│ [Cancel]              [Transfer]   │
└─────────────────────────────────────┘
```

#### 2. Adjust Stock
```
┌─────────────────────────────────────┐
│ Adjust Stock                        │
├─────────────────────────────────────┤
│ Location: [Warehouse/Staff] *      │
│ Product: Product A                  │
│ Current Stock: 200 units           │
├─────────────────────────────────────┤
│ Adjustment Type:                    │
│ (•) Addition    ( ) Deduction     │
│                                     │
│ Quantity: [Input] *                │
│ Reason: [Dropdown/Other] *         │
│ Notes: [Textarea]                  │
├─────────────────────────────────────┤
│ [Cancel]               [Confirm]    │
└─────────────────────────────────────┘
```

#### 3. Stock History
```
┌─────────────────────────────────────┐
│ Stock Movement History              │
├─────────────────────────────────────┤
│ Product: Product A                │
│ Current Stock: 200 units           │
├─────────────────────────────────────┤
│ Filters: [Type] [Date Range]        │
├─────────────────────────────────────┤
│ Date       | Type      | Qty | By  │
│ 2026-04-12 | Transfer  | -50| Mgr │
│ 2026-04-11 | Sale      | -10| Agt │
│ 2026-04-10 | Purchase  | +100| Sys │
├─────────────────────────────────────┤
│ [Export]                 [Close]    │
└─────────────────────────────────────┘
```

---

## 🔐 Permissions Matrix

| Action | super_admin | manager | agent | marketer | pos |
|--------|-------------|---------|-------|----------|-----|
| **View My Stock** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **View All Staff Stock** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Warehouse Stock** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Transfer Stock to Staff** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Adjust Warehouse Stock** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Adjust Own Stock** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **View Stock History** | ✅ | ✅ | Own only | Own only | ❌ |
| **Manage Products** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Raw Materials** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Record POS Sale** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **View Vendor Balance** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Record Vendor Payment** | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🗄️ Database Changes

### Migration 1: Staff Stock Table
```sql
-- Migration: 20260413000001_staff_inventory_system.sql

-- 1. Update staff_stock table to track amount/value
ALTER TABLE staff_stock 
ADD COLUMN IF NOT EXISTS amount_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ;

-- 2. Create staff inventory summary view
CREATE OR REPLACE VIEW staff_inventory_summary AS
SELECT 
  staff_id,
  warehouse_id,
  COUNT(DISTINCT product_id) as total_products,
  COALESCE(SUM(quantity), 0) as total_quantity,
  COALESCE(SUM(amount_value), 0) as total_value,
  MAX(updated_at) as last_updated
FROM staff_stock
GROUP BY staff_id, warehouse_id;

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

-- 4. Trigger to update amount_value on staff_stock changes
CREATE OR REPLACE FUNCTION update_staff_stock_value()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate new amount based on current product price
  NEW.amount_value := (
    SELECT NEW.quantity * COALESCE(p.base_price, 0)
    FROM products p
    WHERE p.id = NEW.product_id
  );
  
  -- Update timestamps
  IF TG_OP = 'INSERT' OR NEW.quantity > OLD.quantity THEN
    NEW.last_received_at = NOW();
  ELSIF NEW.quantity < OLD.quantity THEN
    NEW.last_sale_at = NOW();
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_staff_stock_value ON staff_stock;
CREATE TRIGGER trg_update_staff_stock_value
BEFORE INSERT OR UPDATE ON staff_stock
FOR EACH ROW
EXECUTE FUNCTION update_staff_stock_value();
```

### Migration 2: Warehouse POS Integration
```sql
-- Migration: 20260413000002_warehouse_pos_integration.sql

-- 1. Create POS stores table
CREATE TABLE IF NOT EXISTS pos_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create trigger to auto-create POS store for new warehouse
CREATE OR REPLACE FUNCTION create_pos_store_for_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pos_stores (warehouse_id, name, code)
  VALUES (
    NEW.id,
    NEW.name || ' POS',
    'POS-' || COALESCE(NEW.code, NEW.id::text)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_pos_store ON warehouses;
CREATE TRIGGER trg_create_pos_store
AFTER INSERT ON warehouses
FOR EACH ROW
EXECUTE FUNCTION create_pos_store_for_warehouse();

-- 3. Add pos_store_id to sales table
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS pos_store_id UUID REFERENCES pos_stores(id);

-- 4. Function to get stock source for sale
CREATE OR REPLACE FUNCTION get_sale_stock_source(
  p_recorded_by UUID,
  p_pos_store_id UUID
) RETURNS TEXT AS $$
BEGIN
  IF p_pos_store_id IS NOT NULL THEN
    RETURN 'warehouse'; -- POS sales come from warehouse
  ELSE
    RETURN 'staff'; -- Regular sales come from staff stock
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Migration 3: Enhanced Stock Movements
```sql
-- Migration: 20260413000003_enhanced_stock_movements.sql

-- 1. Update stock_movements with detailed location tracking
ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS from_location_type TEXT CHECK (from_location_type IN ('warehouse', 'staff', 'pos', 'vendor')),
ADD COLUMN IF NOT EXISTS to_location_type TEXT CHECK (to_location_type IN ('warehouse', 'staff', 'pos', 'sale', 'adjustment')),
ADD COLUMN IF NOT EXISTS from_id UUID,
ADD COLUMN IF NOT EXISTS to_id UUID,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
ADD COLUMN IF NOT EXISTS total_value NUMERIC;

-- 2. Function to record stock movement
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_product_id UUID,
  p_from_type TEXT,
  p_from_id UUID,
  p_to_type TEXT,
  p_to_id UUID,
  p_quantity NUMERIC,
  p_movement_type TEXT,
  p_reference_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_unit_price NUMERIC;
  v_movement_id UUID;
BEGIN
  -- Get unit price
  SELECT base_price INTO v_unit_price
  FROM products WHERE id = p_product_id;
  
  -- Insert movement
  INSERT INTO stock_movements (
    product_id, from_location_type, from_id, to_location_type, to_id,
    quantity, movement_type, reference_id, reason, unit_price, total_value
  ) VALUES (
    p_product_id, p_from_type, p_from_id, p_to_type, p_to_id,
    p_quantity, p_movement_type, p_reference_id, p_reason, v_unit_price, ABS(p_quantity) * v_unit_price
  )
  RETURNING id INTO v_movement_id;
  
  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Migration 4: Vendor Integration for Raw Materials
```sql
-- Migration: 20260413000004_vendor_balance_tracking.sql

-- 1. Add balance tracking to vendors
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_purchases NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_payments NUMERIC DEFAULT 0;

-- 2. Create vendor transactions table
CREATE TABLE IF NOT EXISTS vendor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'adjustment', 'return')),
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_id UUID, -- purchase_id or payment_id
  reference_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Function to update vendor balance
CREATE OR REPLACE FUNCTION update_vendor_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update vendor totals
  UPDATE vendors
  SET 
    current_balance = CASE 
      WHEN NEW.transaction_type IN ('purchase', 'adjustment') THEN current_balance + NEW.amount
      WHEN NEW.transaction_type IN ('payment', 'return') THEN current_balance - NEW.amount
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
    updated_at = NOW()
  WHERE id = NEW.vendor_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_vendor_balance ON vendor_transactions;
CREATE TRIGGER trg_update_vendor_balance
AFTER INSERT ON vendor_transactions
FOR EACH ROW
EXECUTE FUNCTION update_vendor_balance();

-- 4. Function to record vendor purchase
CREATE OR REPLACE FUNCTION record_vendor_purchase(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_reference_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_current_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  -- Get current balance
  SELECT current_balance INTO v_current_balance
  FROM vendors WHERE id = p_vendor_id;
  
  -- Create transaction
  INSERT INTO vendor_transactions (
    vendor_id, transaction_type, amount, balance_before, balance_after,
    reference_id, reference_type, notes
  ) VALUES (
    p_vendor_id, 'purchase', p_amount, v_current_balance, v_current_balance + p_amount,
    p_reference_id, 'raw_material_purchase', p_notes
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to record vendor payment
CREATE OR REPLACE FUNCTION record_vendor_payment(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_current_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  -- Get current balance
  SELECT current_balance INTO v_current_balance
  FROM vendors WHERE id = p_vendor_id;
  
  -- Validate payment doesn't exceed balance
  IF p_amount > v_current_balance THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds vendor balance (%)', p_amount, v_current_balance;
  END IF;
  
  -- Create transaction
  INSERT INTO vendor_transactions (
    vendor_id, transaction_type, amount, balance_before, balance_after,
    reference_type, notes
  ) VALUES (
    p_vendor_id, 'payment', p_amount, v_current_balance, v_current_balance - p_amount,
    'vendor_payment', p_notes
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🎨 UI/UX Implementation

### Color Scheme (Consistent)
```css
/* Primary Colors */
--primary: #3b82f6;          /* Blue - Actions */
--primary-foreground: #ffffff;

/* Status Colors */
--success: #22c55e;          /* Green - Success, Active */
--warning: #f59e0b;          /* Amber - Warning, Pending */
--danger: #ef4444;           /* Red - Error, Low Stock */
--info: #06b6d4;             /* Cyan - Info */

/* Background */
--background: #ffffff;
--foreground: #0f172a;
--muted: #f1f5f9;
--muted-foreground: #64748b;
--border: #e2e8f0;

/* Stock Status */
--in-stock: #22c55e;
--low-stock: #f59e0b;
--out-of-stock: #ef4444;
```

### Responsive Breakpoints
```
Mobile: < 640px
Tablet: 640px - 1024px
Desktop: > 1024px
```

### Layout Standards
```
Container: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
Card Padding: p-4 sm:p-6
Grid Gap: gap-4 sm:gap-6
Font Size: sm (mobile) / base (desktop)
```

---

## 📋 Implementation Tasks

### Phase 1: Database Schema (Day 1)
- [ ] Run migration 1: Staff inventory system
- [ ] Run migration 2: Warehouse POS integration
- [ ] Run migration 3: Enhanced stock movements
- [ ] Run migration 4: Vendor balance tracking
- [ ] Test all functions
- [ ] Verify triggers

### Phase 2: API Layer (Day 1-2)
- [ ] Create staff stock hooks
- [ ] Create warehouse stock hooks
- [ ] Create stock transfer API
- [ ] Create adjustment API
- [ ] Create history query hooks
- [ ] Create vendor balance hooks

### Phase 3: UI Components (Day 2-3)
- [ ] StaffStockCard component
- [ ] WarehouseStockTable component
- [ ] StockTransferModal component
- [ ] StockAdjustmentModal component
- [ ] StockHistoryModal component
- [ ] InventorySummaryCards component
- [ ] ProductInventoryView component
- [ ] RawMaterialsInventoryView component

### Phase 4: Inventory Page Redesign (Day 3-4)
- [ ] Main Inventory page with tabs
- [ ] My Stock tab implementation
- [ ] Warehouse tab implementation
- [ ] Products tab integration
- [ ] Raw Materials tab enhancement
- [ ] Permission-based view switching

### Phase 5: POS Integration (Day 4)
- [ ] Update sales recording for POS
- [ ] Warehouse stock deduction for POS
- [ ] Mandatory payment validation
- [ ] POS store auto-creation

### Phase 6: Raw Materials Enhancement (Day 5)
- [ ] Vendor linking UI
- [ ] Purchase recording
- [ ] Vendor balance display
- [ ] Vendor payment recording
- [ ] Purchase history

### Phase 7: Testing & Polish (Day 5-6)
- [ ] Test all stock flows
- [ ] Test permissions
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Error handling
- [ ] Loading states

### Phase 8: Documentation Update (Day 6)
- [ ] Update PAGE_ACTIONS_AUDIT.md
- [ ] Update DETAILED_ACTIONS_CHECKLIST.md
- [ ] Update PAGE_INTERACTION_FLOWS.md
- [ ] Update QUICK_REFERENCE.md

---

## 🧪 Testing Scenarios

### Stock Flow Tests
1. **Warehouse to Staff Transfer**
   - Warehouse: 200 → Transfer 50 → Warehouse: 150
   - Staff: 0 → Receive 50 → Staff: 50
   - Amount calculated correctly

2. **Staff Sale**
   - Staff: 50 → Sale 10 → Staff: 40
   - Amount updated: 40 × price
   - Movement recorded

3. **POS Sale**
   - Warehouse: 100 → POS Sale 5 → Warehouse: 95
   - Payment mandatory
   - No outstanding

4. **Raw Material Purchase**
   - Vendor: ₹10,000 → Purchase ₹2,000 → Vendor: ₹12,000
   - Stock increased

5. **Vendor Payment**
   - Vendor: ₹12,000 → Payment ₹5,000 → Vendor: ₹7,000

### Permission Tests
- Agent sees only My Stock
- Manager sees Warehouse + My Stock
- Super Admin sees everything
- POS user can only record sales

---

## 🚀 Deployment Checklist

- [ ] All migrations applied
- [ ] RLS policies updated
- [ ] Functions tested
- [ ] UI components built
- [ ] Integration testing complete
- [ ] Mobile responsiveness verified
- [ ] Documentation updated
- [ ] Rollback plan ready

---

*Plan created: 2026-04-12*
*Estimated Duration: 6 days*
*Owner: Development Team*
