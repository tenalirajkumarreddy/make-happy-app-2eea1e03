# Product Requirements Document (PRD)
# Inventory Management System

**Version:** 1.0  
**Last Updated:** 2026-04-13  
**Status:** Implemented  
**Related Pages:** Products.tsx, Inventory.tsx

---

## 1. Executive Summary

The Inventory Management System provides a unified interface for managing stock across warehouses and staff members. It enables real-time tracking of stock movements, transfers between locations, return workflows with discrepancy handling, and comprehensive audit trails.

### Key Objectives
- Real-time visibility of stock across warehouse and staff holdings
- Unified stock adjustment interface (Purchase, Sale, Transfer)
- Streamlined return workflow with approval process
- Error tracking and staff performance monitoring
- Role-based access control for all operations

---

## 2. User Roles & Permissions

| Role | Warehouse View | Stock Transfer | Return Approval | Staff→Warehouse |
|------|---------------|----------------|-----------------|-----------------|
| **super_admin** | ✅ All | ✅ All types | ✅ Yes | ✅ Yes |
| **manager** | ✅ Own warehouse | ✅ W→S, S→S | ✅ Yes | ❌ No |
| **agent** | ❌ | ❌ | ❌ | ❌ |
| **marketer** | ❌ | ❌ | ❌ | ❌ |
| **pos** | ✅ Own warehouse | ✅ W→S only | ❌ | ❌ |

### Permission Definitions
- **inventory:manage** - Can adjust stock, view all
- **stock:transfer** - Can initiate transfers
- **stock:adjust** - Can record purchases/sales

---

## 3. Data Architecture

### 3.1 Stock Breakdown Model
```
Product
├── total_quantity (calculated)
├── warehouse_quantity (product_stock table)
└── staff_holdings[] (staff_stock table)
    ├── user_id
    ├── full_name
    ├── quantity
    └── role
```

### 3.2 Stock Flow Types
| Flow Type | Direction | Permission | Status |
|------------|-------------|------------|---------|
| **Purchase** | External → Warehouse | stock:adjust | completed |
| **Sale** | Warehouse → External | stock:adjust | completed |
| **Transfer W→S** | Warehouse → Staff | stock:transfer | completed |
| **Transfer S→W** | Staff → Warehouse | admin only | pending → approved/rejected |
| **Transfer S→S** | Staff → Staff | stock:transfer | completed |

### 3.3 Return Workflow States
```
Draft → Pending → Review → [Approved | Rejected | Partial]
                ↓
         [Flag Error | Keep with User]
                ↓
         staff_performance_logs
```

---

## 4. Feature Specifications

### 4.1 Product Cards with Stock Display

**Location:** Products Page - Desktop Grid View

**Card Layout:**
```
┌─────────────────────────────┐
│  [Product Image]     [Status]│
├─────────────────────────────┤
│ Product Name               │
│ SKU                        │
│ Category                   │
├─────────────────────────────┤
│ 📦 Stock Breakdown         │
│ ────────────────────────── │
│ Total Stock:     100      │
│ Warehouse:        40      │
│ ────────────────────────── │
│ With Staff:               │
│   Agent Name 1:   30      │
│   Agent Name 2:   20      │
│   Marketer 1:     10      │
├─────────────────────────────┤
│ Price: ₹XXX  Unit: Cases  │
├─────────────────────────────┤
│ [Edit] [Adjust Stock]      │
└─────────────────────────────┘
```

**Requirements:**
- Display total stock (warehouse + staff)
- Show warehouse quantity separately
- List staff holdings (only those with quantity > 0)
- Show staff name, role, and quantity
- Collapsible staff list if more than 3 holders

### 4.2 Adjust Stock Modal

**Trigger:** "Adjust Stock" button on product card

**Modal Sections:**

#### Operation Type Tabs
- **Purchase** - Add stock to warehouse (+)
- **Sale** - Remove stock from warehouse (-)
- **Transfer** - Move stock between locations

#### Transfer Direction (when Transfer selected)
```
From: [Warehouse ▼] → To: [Staff ▼]
       [Staff ▼]   →    [Warehouse ▼] (admin only)
       [Staff ▼]   →    [Staff ▼]
```

#### Form Fields
- Quantity (number input with unit display)
- Reason/Notes (textarea)
- Source staff dropdown (if S→W or S→S)
- Destination staff dropdown (if W→S or S→S)

**Current Stock Display:**
```
Current Stock: 100 Cases
In Warehouse:   40 Cases
With Staff:     60 Cases
```

**Validation:**
- Quantity must be > 0
- Cannot transfer more than available
- Staff→Warehouse requires admin permission
- Source and destination cannot be same

### 4.3 Pending Returns Section

**Location:** Products Page (bottom section, admin/manager only)

**Return Card:**
```
┌──────────────────────────────────────────┐
│ [Avatar] Return from John Doe             │
│ Product: Aqua Prime 1Ltr - 20 Cases      │
│ Requested: 12 Apr 2025 at 09:30          │
│ Note: "Customer returns, damaged 2 cases" │
│                              [Review]    │
└──────────────────────────────────────────┘
```

**Return Review Modal:**
```
Product: Aqua Prime 1Ltr
Requested: 20 Cases
Expected in hand: 20 Cases

Actual Quantity Received: [___] Cases
                          19 entered
Difference: 1 Case

Handle Difference:
[○] Keep with User  [●] Flag as Error

Notes: [__________________________]

        [Cancel] [Reject] [Approve]
```

**Return Actions:**
1. **Approve** - Process return, update stock
2. **Reject** - Cancel return request
3. **Partial Approve** - Accept partial quantity

**Difference Handling:**
- **Keep with User** - Staff keeps remaining stock
- **Flag Error** - Log discrepancy, staff has 0 remaining

**Discrepancy Logging:**
- Recorded in `staff_performance_logs`
- Types: `stock_discrepancy`, `stock_return_variance`
- Tracked: expected vs actual, difference amount, reviewer notes

---

## 5. UI/UX Specifications

### 5.1 Visual Design
- Use existing `entity-card`, `entity-card-header`, `entity-card-content` classes
- Stock breakdown in muted background (bg-muted/50)
- Green text for positive stock, red for negative
- Staff holdings indented with left border

### 5.2 Responsive Behavior
**Desktop (>768px):**
- Grid layout: 3-4 cards per row
- Full stock breakdown visible
- "Adjust Stock" button always visible

**Mobile (≤768px):**
- Single column list
- Stock summary: "Stock: 100 (W: 40)"
- Tap to expand details
- Bottom sheet for Adjust Stock modal

### 5.3 Loading States
- Skeleton cards while loading products
- Disabled buttons during operations
- Toast notifications for success/error

### 5.4 Empty States
- "No products found" when search returns nothing
- "No pending returns" when all processed
- "No staff holdings" when warehouse holds all stock

---

## 6. Database Schema

### 6.1 Tables

#### stock_transfers
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| display_id | TEXT | Human-readable ID (STF-YYYYMMDD-XXXX) |
| transfer_type | TEXT | warehouse_to_staff, staff_to_warehouse, staff_to_staff |
| from_warehouse_id | UUID | Source warehouse |
| from_user_id | UUID | Source staff (null for warehouse) |
| to_warehouse_id | UUID | Destination warehouse |
| to_user_id | UUID | Destination staff (null for warehouse) |
| product_id | UUID | Product being transferred |
| quantity | NUMERIC | Amount transferred |
| status | TEXT | pending, approved, rejected, completed |
| actual_quantity | NUMERIC | Actual received (for returns) |
| difference | NUMERIC | Discrepancy amount |
| action_taken | TEXT | keep or flag |
| reviewed_by | UUID | Approver user ID |
| reviewed_at | TIMESTAMPTZ | Approval timestamp |
| description | TEXT | Notes/reason |
| created_by | UUID | User who created transfer |
| created_at | TIMESTAMPTZ | Timestamp |

#### staff_stock
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Staff member |
| warehouse_id | UUID | Associated warehouse |
| product_id | UUID | Product |
| quantity | NUMERIC | Current holding |
| is_negative | BOOLEAN | Negative stock flag |
| updated_at | TIMESTAMPTZ | Last update |

#### staff_performance_logs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Staff member |
| log_type | TEXT | stock_discrepancy, stock_return_variance |
| product_id | UUID | Related product |
| expected_quantity | NUMERIC | Expected amount |
| actual_quantity | NUMERIC | Actual amount |
| difference | NUMERIC | Variance |
| notes | TEXT | Reviewer notes |
| created_by | UUID | Reviewer |
| created_at | TIMESTAMPTZ | Timestamp |

### 6.2 Functions

#### record_stock_transfer(...)
Creates a new transfer record with validation.
- Validates stock availability
- Generates display_id
- Sets status based on transfer type
- Auto-executes non-pending transfers

#### execute_stock_transfer(transfer_id)
Executes the actual stock movement.
- Updates warehouse stock
- Updates staff_stock
- Creates stock_movement records
- Handles upserts for staff_stock

#### process_stock_return(...)
Processes return approval/rejection.
- Updates transfer status
- Executes transfer
- Logs discrepancies
- Handles difference actions

---

## 7. API Integration

### 7.1 React Query Hooks

```typescript
// Fetch products with stock
useQuery({
  queryKey: ["products-with-stock", warehouseId],
  queryFn: fetchProductsWithStock
});

// Fetch pending returns
useQuery({
  queryKey: ["pending-returns", warehouseId],
  queryFn: fetchPendingReturns
});

// Stock transfer mutation
useMutation({
  mutationFn: recordStockTransfer,
  onSuccess: invalidateQueries
});
```

### 7.2 RPC Calls

```typescript
// Record stock movement
supabase.rpc("record_stock_movement", {
  p_product_id: string,
  p_warehouse_id: string,
  p_quantity: number,
  p_type: "purchase" | "sale" | "adjustment",
  p_reason: string,
  p_user_id: string
});

// Record transfer
supabase.rpc("record_stock_transfer", {
  p_transfer_type: string,
  p_from_warehouse_id: string,
  p_from_user_id: string | null,
  p_to_warehouse_id: string,
  p_to_user_id: string | null,
  p_product_id: string,
  p_quantity: number,
  p_reason: string,
  p_created_by: string
});

// Process return
supabase.rpc("process_stock_return", {
  p_transfer_id: string,
  p_actual_quantity: number,
  p_difference: number,
  p_action: "keep" | "flag",
  p_notes: string,
  p_reviewed_by: string,
  p_approved: boolean
});
```

---

## 8. Workflows

### 8.1 Stock Purchase Flow
```
1. User clicks "Adjust Stock" on product
2. Selects "Purchase" tab
3. Enters quantity and reason
4. Clicks "Record Purchase"
5. System:
   - Calls record_stock_movement(type: 'purchase')
   - Increases warehouse stock
   - Creates stock_movement record
6. Shows success toast
7. Refreshes product card with new stock
```

### 8.2 Transfer Warehouse→Staff Flow
```
1. User clicks "Adjust Stock" on product
2. Selects "Transfer" tab
3. Direction: Warehouse → Staff
4. Selects destination staff
5. Enters quantity and reason
6. Clicks "Transfer"
7. System:
   - Calls record_stock_transfer(type: 'warehouse_to_staff')
   - Validates warehouse stock
   - Decrements warehouse stock
   - Increments staff_stock
   - Creates stock_movement
8. Shows success toast
9. Updates both warehouse and staff stock display
```

### 8.3 Staff Return Flow
```
1. Staff initiates return (future: via mobile)
2. Creates transfer with status: 'pending'
3. Manager sees in "Pending Returns" section
4. Manager clicks "Review"
5. Enters actual quantity received
6. System calculates difference
7. Manager selects action: "Keep with User" or "Flag Error"
8. Manager clicks "Approve"
9. System:
   - Updates transfer status to 'approved'
   - Decrements staff_stock
   - Increments warehouse stock
   - If difference > 0 and flag: logs to performance_logs
10. Shows success toast
```

### 8.4 Discrepancy Handling Flow
```
Scenario: Staff returns 20, but only 19 physically present

1. Manager enters actual_quantity: 19
2. System calculates difference: 1
3. Manager selects "Flag Error"
4. Manager approves
5. System:
   - Processes 19 units to warehouse
   - Sets staff stock: 0 (all returned)
   - Logs discrepancy:
     - expected: 20
     - actual: 19
     - difference: 1
     - action: flag
6. Report available in staff performance
```

---

## 9. Edge Cases & Error Handling

### 9.1 Insufficient Stock
**Error:** "Insufficient stock in warehouse. Available: X"  
**Handling:** Block transfer, show inline validation error

### 9.2 Staff Has No Stock
**Error:** "Staff member has no stock for this product"  
**Handling:** Disable staff in dropdown, show tooltip

### 9.3 Concurrent Transfers
**Scenario:** Two managers transfer same stock simultaneously  
**Handling:** Row-level locking in PostgreSQL, second transaction waits

### 9.4 Negative Stock
**Scenario:** Stock adjustment results in negative  
**Handling:** Set is_negative flag, show warning badge, allow with reason

### 9.5 Missing Warehouse
**Scenario:** User has no warehouse assigned  
**Handling:** Show "Select Warehouse" dropdown in header

### 9.6 Return Review Timeout
**Scenario:** Staff stock changed between request and review  
**Handling:** Re-fetch current stock before approval, show warning if changed

---

## 10. Reporting & Analytics

### 10.1 Staff Performance Logs
Access via: Reports → Staff Performance

**Columns:**
- Staff Name
- Log Type (Discrepancy, Variance)
- Product
- Expected vs Actual
- Difference
- Reviewer Notes
- Date

### 10.2 Stock Movement History
Access via: Products → Stock Flow tab

**Filters:**
- Date range
- Product
- Movement type
- Staff member

---

## 11. Future Enhancements

### 11.1 Planned Features
- [ ] Barcode scanning for stock adjustments
- [ ] Bulk stock imports via CSV
- [ ] Stock alerts (low stock notifications)
- [ ] Physical count reconciliation
- [ ] Multi-warehouse transfers
- [ ] Stock valuation reports
- [ ] FIFO/LIFO cost tracking

### 11.2 Mobile Support
- [ ] Staff can view own stock
- [ ] Staff can initiate returns from mobile
- [ ] Offline stock adjustments with sync

---

## 12. Appendix

### 12.1 Glossary
- **Stock Transfer** - Movement of inventory between locations
- **Discrepancy** - Difference between expected and actual quantity
- **Return** - Staff returning unsold stock to warehouse
- **W→S** - Warehouse to Staff
- **S→W** - Staff to Warehouse
- **S→S** - Staff to Staff

### 12.2 Related Documents
- Database Schema: `supabase/migrations/20260413000007_fix_stock_functions.sql`
- Implementation: `src/pages/Products.tsx`
- Components: `src/components/inventory/`

### 12.3 Change Log
| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial PRD based on implementation |

---

**End of Document**
