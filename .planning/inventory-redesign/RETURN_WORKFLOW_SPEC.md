# Stock Return Workflow System
## Comprehensive Specification for Robust Inventory Returns

---

## 🎯 Overview

When staff complete their sales activities, they often have **unsold stock remaining**. This system allows them to return stock to the warehouse with an approval workflow, ensuring accountability and accurate inventory tracking.

---

## 📊 Return Workflow States

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  DRAFT   │────▶│ PENDING  │────▶│ REVIEW   │────▶│ APPROVED │────▶│ COMPLETED│
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
      │                │                │                │
      ▼                ▼                ▼                ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ CANCELLED│     │ REJECTED │     │ DAMAGED  │     │ PARTIAL  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

| State | Description | Next States |
|-------|-------------|-------------|
| **DRAFT** | Staff creating return request | PENDING, CANCELLED |
| **PENDING** | Submitted, awaiting review | REVIEW, REJECTED |
| **REVIEW** | Manager reviewing details | APPROVED, DAMAGED, PARTIAL, REJECTED |
| **APPROVED** | Fully approved | COMPLETED |
| **PARTIAL** | Partially approved (some items accepted) | COMPLETED |
| **DAMAGED** | Some items marked as damaged | COMPLETED |
| **REJECTED** | Return rejected by manager | - |
| **CANCELLED** | Cancelled by staff | - |
| **COMPLETED** | Stock transferred, request closed | - |

---

## 🗄️ Database Schema

### Table: `stock_return_requests`

```sql
CREATE TABLE stock_return_requests (
  -- Primary
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT UNIQUE, -- RET-2026-001
  
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
  
  -- Values
  total_requested_value NUMERIC DEFAULT 0,
  total_approved_value NUMERIC DEFAULT 0,
  
  -- Damage Tracking
  damaged_items_count INTEGER DEFAULT 0,
  damaged_value NUMERIC DEFAULT 0,
  damage_notes TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `stock_return_items`

```sql
CREATE TABLE stock_return_items (
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
```

### Table: `stock_return_approvals` (Audit Trail)

```sql
CREATE TABLE stock_return_approvals (
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
```

---

## 🔌 RPC Functions

### 1. Submit Return Request

```sql
CREATE OR REPLACE FUNCTION submit_stock_return(
  p_staff_id UUID,
  p_warehouse_id UUID,
  p_return_reason TEXT,
  p_custom_reason TEXT DEFAULT NULL,
  p_items JSONB -- [{"product_id": "...", "quantity": 5, "notes": "..."}, ...]
) RETURNS JSONB AS $$
DECLARE
  v_return_id UUID;
  v_display_id TEXT;
  v_total_value NUMERIC := 0;
  v_item_count INTEGER := 0;
  v_item RECORD;
  v_product_price NUMERIC;
BEGIN
  -- Validate staff has stock
  -- Generate display ID
  -- Create return request
  -- Insert return items
  -- Validate all items exist in staff_stock
  -- Update status to pending
  -- Create notifications
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Review Return Request

```sql
CREATE OR REPLACE FUNCTION review_stock_return(
  p_return_id UUID,
  p_reviewer_id UUID,
  p_action TEXT, -- 'approve', 'approve_partial', 'mark_damaged', 'reject'
  p_item_decisions JSONB, -- [{"item_id": "...", "decision": "approved", "approved_qty": 5, "notes": "..."}, ...]
  p_overall_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  -- Validate reviewer has permission
  -- Update each item status
  -- Calculate totals
  -- Update request status
  -- If approved/complete: transfer stock
  -- Create notifications
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. Get Return Requests

```sql
-- For staff: Get my return requests
CREATE OR REPLACE FUNCTION get_my_return_requests(
  p_staff_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE(...)

-- For managers: Get all pending returns
CREATE OR REPLACE FUNCTION get_pending_returns(
  p_warehouse_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE(...)
```

---

## 📱 UI Components

### 1. Staff Return Request Form

```
┌─────────────────────────────────────────────┐
│ Return Stock to Warehouse                    │
├─────────────────────────────────────────────┤
│                                              │
│ Reason for Return *                          │
│ [End of Day ▼]                               │
│                                              │
│ Select Products to Return:                   │
│ ┌─────────────────────────────────────────┐ │
│ │ [✓] Product A - Qty: 10 - Value: ₹500   │ │
│ │     Return: [  5  ] units              │ │
│ │     Notes: [_________]                 │ │
│ ├─────────────────────────────────────────┤ │
│ │ [✓] Product B - Qty: 20 - Value: ₹1000│ │
│ │     Return: [ 15  ] units              │ │
│ │     Notes: [_________]                 │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Total Return Value: ₹2,500                   │
│                                              │
│ [Save Draft]      [Submit for Approval]      │
└─────────────────────────────────────────────┘
```

### 2. Manager Return Approval Dashboard

```
┌─────────────────────────────────────────────┐
│ Pending Return Requests (5)                  │
├─────────────────────────────────────────────┤
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ RET-2026-001                          │ │
│ │ Agent: John Doe                        │ │
│ │ Warehouse: Main                        │ │
│ │ Items: 5 products, 45 units            │ │
│ │ Value: ₹12,500                         │ │
│ │ Submitted: 2 hours ago                 │ │
│ │                                        │ │
│ │ [Review Now]                           │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ RET-2026-002                          │ │
│ │ Agent: Jane Smith                      │ │
│ │ Warehouse: Branch A                    │ │
│ │ Items: 3 products, 20 units            │ │
│ │ Value: ₹5,000                          │ │
│ │ Submitted: 30 min ago                  │ │
│ │                                        │ │
│ │ [Review Now]                           │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 3. Return Review Detail View

```
┌─────────────────────────────────────────────┐
│ Review Return Request RET-2026-001          │
├─────────────────────────────────────────────┤
│                                              │
│ From: John Doe (Agent)                     │
│ Reason: End of Day                         │
│ Submitted: Apr 13, 2026 at 6:00 PM         │
│                                              │
│ Items to Review:                            │
│ ┌─────────────────────────────────────────┐ │
│ │ Product A (SKU: PROD001)                │ │
│ │ Requested: 10 units (₹500)            │ │
│ │ Staff Notes: "Unsold today"             │ │
│ │                                         │ │
│ │ Decision:                               │ │
│ │ (•) Accept All   ( ) Partial            │ │
│ │                    ( ) Reject           │ │
│ │                    (•) Damaged          │ │
│ │                                         │ │
│ │ Approve Qty: [  8  ] units              │ │
│ │ Damaged:     [  2  ] units              │ │
│ │ Damage Notes: [Package torn________]    │ │
│ │                                         │ │
│ │ Reviewer Notes: [____________________]  │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ [Reject All]    [Approve All]              │
│                                              │
│ Overall Notes:                               │
│ [____________________________________]       │
│                                              │
│ [Cancel]              [Confirm Decisions]    │
└─────────────────────────────────────────────┘
```

---

## 🔔 Notifications

| Event | Recipients | Content |
|-------|------------|---------|
| Return Submitted | Manager | "John Doe submitted return request RET-001 for 45 units" |
| Return Approved | Staff | "Your return RET-001 was approved. 43 units accepted, 2 damaged" |
| Return Rejected | Staff | "Your return RET-001 was rejected. Contact manager for details" |
| Return Completed | Both | "Return RET-001 completed. Stock transferred to warehouse" |
| Pending Review (24h) | Manager (reminder) | "Return RET-001 pending review for 24 hours" |

---

## 📊 Reports & Analytics

### Return Analytics Dashboard

| Metric | Description |
|--------|-------------|
| Return Rate | % of stock transferred that gets returned |
| Avg Return Time | Time between submission and approval |
| Damaged Rate | % of returned items marked as damaged |
| Top Returned Products | Products with highest return frequency |
| Staff Return Patterns | Which staff return most/least |

### Return Summary Report

```
Return Summary - April 2026
═══════════════════════════════════════════

Total Returns: 45
Total Units Returned: 1,250
Total Value Returned: ₹125,000

By Status:
  Approved: 40 (₹110,000)
  Partial: 3 (₹10,000)
  Damaged: 1 (₹4,000)
  Rejected: 1 (₹1,000)

By Reason:
  End of Day: 35 (78%)
  Route Completed: 8 (18%)
  Unsold Stock: 2 (4%)

Top Returned Products:
  1. Product A - 150 units
  2. Product B - 120 units
  3. Product C - 95 units

Staff with Most Returns:
  1. John Doe - 12 returns
  2. Jane Smith - 10 returns
```

---

## 🛡️ Validation Rules

### Submission Validations

1. **Stock Verification**
   - Staff must actually have the requested quantity
   - Cannot return more than currently held

2. **Minimum Return**
   - At least 1 item required
   - At least 1 unit per item

3. **Duplicate Prevention**
   - Cannot have multiple pending returns for same day
   - Previous return must be completed/rejected

### Approval Validations

1. **Quantity Checks**
   - Approved qty ≤ Requested qty
   - Approved qty + Damaged qty = Requested qty

2. **Value Limits**
   - Manager approval limit based on role
   - >₹50,000 may require admin approval

3. **Time Limits**
   - Returns must be processed within 48 hours
   - Auto-escalation if pending >24 hours

---

## 🔄 Stock Flow on Return

### Scenario: Staff Returns Unsold Stock

```
BEFORE RETURN:
┌─────────────────┐     ┌─────────────────┐
│  Warehouse      │     │  Staff (John)   │
│  Product A: 100 │     │  Product A: 20 │
│  Product B: 200 │     │  Product B: 15 │
└─────────────────┘     └─────────────────┘

STAFF SUBMITS RETURN:
- Product A: 10 units
- Product B: 5 units

STATUS: PENDING → APPROVED

AFTER RETURN:
┌─────────────────┐     ┌─────────────────┐
│  Warehouse      │     │  Staff (John)   │
│  Product A: 110 │     │  Product A: 10  │
│  Product B: 205 │     │  Product B: 10  │
└─────────────────┘     └─────────────────┘

MOVEMENTS LOGGED:
- Warehouse: +10 Product A (Return from John)
- Warehouse: +5 Product B (Return from John)
- Staff: -10 Product A (Returned)
- Staff: -5 Product B (Returned)
```

---

## 📋 Implementation Checklist

### Phase 1: Database (Day 1)
- [ ] Create stock_return_requests table
- [ ] Create stock_return_items table
- [ ] Create stock_return_approvals table
- [ ] Add triggers for auto-updates
- [ ] Create indexes for performance

### Phase 2: RPC Functions (Day 1-2)
- [ ] submit_stock_return function
- [ ] review_stock_return function
- [ ] get_my_return_requests function
- [ ] get_pending_returns function
- [ ] get_return_details function
- [ ] cancel_return_request function

### Phase 3: UI Components (Day 2-3)
- [ ] StaffReturnForm component
- [ ] StaffReturnList component
- [ ] ManagerReturnDashboard component
- [ ] ReturnReviewModal component
- [ ] ReturnHistoryView component
- [ ] ReturnStatusBadge component

### Phase 4: Hooks (Day 3)
- [ ] useStockReturns hook
- [ ] useSubmitReturn hook
- [ ] useReviewReturn hook
- [ ] useReturnHistory hook
- [ ] usePendingReturns hook

### Phase 5: Integration (Day 3-4)
- [ ] Add to Inventory page (My Stock tab)
- [ ] Add to Inventory page (Warehouse tab)
- [ ] Add notifications
- [ ] Real-time updates

### Phase 6: Testing (Day 4)
- [ ] Test full return flow
- [ ] Test partial returns
- [ ] Test damaged goods
- [ ] Test rejections
- [ ] Test edge cases

---

**Status:** Ready for Implementation
**Priority:** High
**Estimated:** 4 days
