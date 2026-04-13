# Inventory Enhancement Plan
## Restore Old Layout + Add New Features

---

## 🎯 Objective
Restore the existing Inventory layout and enhance it with:
1. Stock cards showing "who holds what" (hide 0 stock)
2. Flexible transfers (Warehouse↔Staff, Staff→Staff)
3. Single table for all stock movements
4. Admin stock source choice on sales
5. Return requests with discrepancy handling

---

## 📋 Requirements

### 1. Stock Cards Enhancement
```
┌─────────────────────────────────────────────────────────────┐
│ Product A                                                   │
│ Total Stock: 200                                            │
│                                                             │
│ Holdings:                                                   │
│   Warehouse: 100  (50%)                                    │
│   Agent John: 50    (25%)                                   │
│   Marketer Jane: 49 (24.5%)                                 │
│   ⚠️ Discrepancy: 1 unit unaccounted                        │
└─────────────────────────────────────────────────────────────┘
```
**Rules:**
- Hide persons with 0 stock
- Show warehouse first
- Show staff alphabetically
- Show discrepancy if sum ≠ total

### 2. Transfer Directions
| Who | Can Transfer | Direction |
|-----|--------------|-----------|
| **Admin** | Staff ↔ Warehouse | Both ways |
| **Admin** | Staff ↔ Staff | Both ways |
| **Manager** | Warehouse → Staff | Only outward |
| **Manager with adjust** | Staff → Warehouse | Inward (return) |

### 3. Single Stock Movements Table
All flows logged in `stock_movements`:
- `warehouse_to_staff` - Transfer out
- `staff_to_warehouse` - Return/Transfer back
- `staff_to_staff` - Direct transfer
- `sale_from_warehouse` - POS sale
- `sale_from_staff` - Agent sale
- `adjustment` - Any stock adjustment

### 4. Sales Stock Source
| Role | Default Source | Can Choose? |
|------|---------------|-------------|
| **Manager** | Warehouse | No (always warehouse) |
| **Admin** | Prompt | Yes (warehouse/staff/prompt) |
| **Agent** | Own stock | No (always own) |
| **POS** | Warehouse | No (always warehouse) |

### 5. Return Request Flow
```
Warehouse: 200
Agent takes: 100
Agent sells: 80
Agent should have: 20
Agent actually has: 19
Agent requests return: 20

Acceptor sees:
┌─────────────────────────────────────────────────────────┐
│ Requested: 20 units                                     │
│ Should have: 20                                         │
│ Actually has: 19                                       │
│ ⚠️ Discrepancy: 1 unit                                 │
│                                                         │
│ Accept Quantity: [ 19 ] ← editable                     │
│                                                         │
│ Discrepancy Handling:                                  │
│ (•) Keep with user  → Agent keeps 1, returns 19       │
│ ( ) Flag as error   → Agent returns 19, 1 flagged       │
│                                                         │
│ [ Accept ] [ Reject ]                                  │
└─────────────────────────────────────────────────────────┘
```

### 6. Discrepancy Logging
- **Keep with user**: Agent's holding = 1, no error logged
- **Flag as error**: Agent's holding = 0, 1 unit logged as error
- Errors appear in: Performance reports, Audit logs

---

## 🗄️ Database Schema Updates

### stock_movements table enhancements
```sql
-- Add movement subtypes
ALTER TYPE movement_type ADD VALUE 'staff_to_staff';
ALTER TYPE movement_type ADD VALUE 'sale_from_warehouse';
ALTER TYPE movement_type ADD VALUE 'sale_from_staff';
ALTER TYPE movement_type ADD VALUE 'return_with_discrepancy';

-- Add discrepancy tracking
ALTER TABLE stock_movements ADD COLUMN discrepancy_quantity NUMERIC DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN discrepancy_type TEXT CHECK (discrepancy_type IN ('none', 'keep_with_user', 'flag_error'));
ALTER TABLE stock_movements ADD COLUMN expected_quantity NUMERIC;
ALTER TABLE stock_movements ADD COLUMN actual_quantity NUMERIC;
```

### New table: stock_discrepancies
```sql
CREATE TABLE stock_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES auth.users(id),
  product_id UUID REFERENCES products(id),
  warehouse_id UUID REFERENCES warehouses(id),
  movement_id UUID REFERENCES stock_movements(id),
  
  expected_quantity NUMERIC NOT NULL,
  actual_quantity NUMERIC NOT NULL,
  discrepancy_quantity NUMERIC NOT NULL,
  
  resolution_type TEXT CHECK (resolution_type IN ('keep_with_user', 'flag_error')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  
  -- For flagged errors
  is_error BOOLEAN DEFAULT false,
  error_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📝 RPC Functions

### 1. get_product_stock_holdings
```sql
-- Returns total stock + breakdown of who holds what
-- Filters out 0 holdings
```

### 2. transfer_stock
```sql
-- Enhanced to handle all directions
-- warehouse_to_staff, staff_to_warehouse, staff_to_staff
-- Logs to stock_movements with proper direction
```

### 3. process_sale_with_source
```sql
-- Admin can specify source (warehouse/staff)
-- Auto-deduct from correct location
```

### 4. process_return_with_discrepancy
```sql
-- Handles partial returns
-- Logs discrepancy if any
-- Updates holdings based on resolution
```

---

## 🎨 UI Components

### Enhanced Stock Cards
- Show total prominently
- List holders (warehouse first, then staff)
- Show percentages
- Highlight discrepancies

### Transfer Modal
- Direction selector (3 options)
- From/To dropdowns based on permission
- Quantity validation
- Notes field

### Sale Recording
- Admin: Source selector (if multiple locations have stock)
- Others: Auto-select based on role

### Return Approval
- Request details
- Discrepancy detection
- Editable accept quantity
- Discrepancy resolution toggle

---

## 🚀 Implementation Steps

1. **Database**: Update stock_movements, create discrepancies table
2. **RPC**: Create new functions
3. **Hooks**: Update useStockTransfer, create useStockDiscrepancy
4. **Components**: 
   - Enhance InventorySummaryCards
   - Update StockTransferModal
   - Create DiscrepancyResolutionModal
5. **Sales**: Add source selector for admin
6. **Testing**: Test all transfer flows and discrepancy scenarios

---

## ✅ Success Criteria
- [ ] Stock cards show holdings breakdown
- [ ] Transfers work in all 3 directions
- [ ] All movements logged in single table
- [ ] Admin can choose sale source
- [ ] Return discrepancies detected and handled
- [ ] Discrepancies appear in reports
