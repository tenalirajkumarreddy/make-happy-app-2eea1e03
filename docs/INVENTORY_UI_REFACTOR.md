# INVENTORY PAGE - UI/UX REFACTORING PROPOSAL

## Current State Analysis

### Files in `src/components/inventory/`
| File | Status | Purpose |
|------|--------|----------|
| InventorySummaryCards.tsx | ✅ KEEP | Summary stats for managers |
| WarehouseStockView.tsx | ⚠️ MERGE | Shows products, stock flow, returns - has duplicate tabs |
| StaffStockView.tsx | ✅ KEEP | Staff holding cards |
| StockTransferModal.tsx | ✅ KEEP | Transfer between warehouse/staff |
| StockAdjustmentModal.tsx | ✅ KEEP | Manual stock adjustment |
| StockHistoryView.tsx | ✅ KEEP | Movement history |
| RawMaterialInventoryView.tsx | ✅ KEEP | Raw materials management |
| ReturnReviewModal.tsx | ❌ REMOVE | Duplicate - logic already in Inventory.tsx |
| PendingReturns.tsx | ❌ REMOVE | Duplicate - logic already in Inventory.tsx |
| StaffReturnForm.tsx | ❌ REMOVE | Duplicate - logic already in Inventory.tsx |
| ManagerReturnDashboard.tsx | ❌ REMOVE | Duplicate - logic already in Inventory.tsx |
| ReturnDetailView.tsx | ❌ REMOVE | Duplicate - logic already in Inventory.tsx |
| ProductInventoryCard.tsx | ✅ KEEP | Product card in list |
| ProductCard.tsx | ❌ REMOVE | Duplicate of ProductInventoryCard |
| AdjustStockModal.tsx | ❌ REMOVE | Duplicate of StockAdjustmentModal |
| RawMaterialForm.tsx | ⚠️ REVIEW | May be used in RawMaterials page |
| PurchaseOrderForm.tsx | ❌ REMOVE | Not inventory - belongs to Purchases |
| bom-columns.tsx | ❌ REMOVE | Belongs to BillOfMaterials page |
| raw-material-columns.tsx | ⚠️ REVIEW | May be used in RawMaterials page |
| purchase-order-columns.tsx | ❌ REMOVE | Belongs to Purchases page |
| vendor-columns.tsx | ⚠️ REVIEW | May be used in Vendors page |

### Files in `src/hooks/inventory/`
All hooks appear to be in use by Inventory.tsx or related pages.

---

## PROPOSED UI/UX WIREFRAME

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER: Inventory Management                              [Transfer] [+Adjust]
├─────────────────────────────────────────────────────────────────────────────┤
│  WAREHOUSE SELECTOR: [Dropdown - shows all for Admin, single for others]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ TOTAL       │ │ LOW STOCK   │ │ STAFF       │ │ PENDING     │           │
│  │ PRODUCTS    │ │ ALERTS      │ │ HOLDING     │ │ RETURNS     │           │
│  │   156       │ │     12      │ │   $45,000   │ │      3      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│  TABS: [Warehouse] [Products] [Raw Materials] [History]                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MAIN CONTENT AREA (varies by tab + role)                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Search: [________________] [Filter dropdown]                        │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ Product Name    │ SKU   │ Stock  │ Price  │ Value    │ Actions    │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ Aqua 1L        │ AQ001 │  500   │ ₹18    │ ₹9,000   │ [Adj][Tr] │  │
│  │ Aqua 500ml      │ AQ500 │  234   │ ₹12    │ ₹2,808   │ [Adj][Tr] │  │
│  │ ...             │       │        │        │          │            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  STAFF STOCK SECTION (Admin/Manager only)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Staff Member    │ Total Items │ Total Value │ Negative │ Actions    │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ John Doe        │      15     │   ₹23,450   │    2     │ [View]     │  │
│  │ Jane Smith      │      12     │   ₹18,200   │    0     │ [View]     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Role-Based UI Elements

#### SUPER ADMIN / MANAGER VIEW
```
┌──────────────────────────────────────────────────┐
│ ✅ Warehouse Selector (all warehouses dropdown)  │
│ ✅ Summary Cards (all 4 metrics)                  │
│ ✅ All Tabs: Warehouse, Products, Raw Materials, History
│ ✅ Transfer Stock Button                          │
│ ✅ Adjust Stock Button                            │
│ ✅ Staff Stock Section                           │
│ ✅ Pending Returns Section                       │
│ ✅ Actions: Adjust, Transfer on each product     │
└──────────────────────────────────────────────────┘
```

#### POS VIEW
```
┌──────────────────────────────────────────────────┐
│ ⚠️  Warehouse Selector (read-only, single)       │
│ ⚠️  Summary Cards (limited - no low stock)     │
│ ⚠️  Tabs: Warehouse, Products, History only    │
│ ✅ Transfer Stock Button (warehouse→staff only)  │
│ ❌ NO Adjust Stock Button                        │
│ ❌ NO Staff Stock Section                       │
│ ❌ NO Pending Returns Section                   │
│ ✅ Actions: Transfer only (no Adjust)           │
└──────────────────────────────────────────────────┘
```

#### OTHER ROLES (Agent, Marketer, Customer)
```
┌──────────────────────────────────────────────────┐
│ ❌ ACCESS DENIED - "No access to inventory"     │
└──────────────────────────────────────────────────┘
```

### Modal Designs

#### 1. STOCK TRANSFER MODAL
```
┌──────────────────────────────────────────────┐
│ Transfer Stock                               │
├──────────────────────────────────────────────┤
│ From: [Warehouse ▼]                          │
│ To:   [Staff Member ▼]                       │
│                                             │
│ Product: [Search/Select ▼]                  │
│ Quantity: [____] (Available: 500)           │
│                                             │
│ [Cancel]                    [Transfer]       │
└──────────────────────────────────────────────┘
```

#### 2. STOCK ADJUSTMENT MODAL (Admin/Manager only)
```
┌──────────────────────────────────────────────┐
│ Adjust Stock                                 │
├──────────────────────────────────────────────┤
│ Product: Aqua 1L (Current: 500)             │
│                                             │
│ Type: ( ) Add  ( ) Remove  ( ) Set Exact    │
│                                             │
│ Quantity: [____]                            │
│ Reason: [Dropdown: Stock Count, Damage,   │
│               Return, Other]                 │
│ Notes: [Text area]                          │
│                                             │
│ [Cancel]                    [Confirm]       │
└──────────────────────────────────────────────┘
```

#### 3. RETURN REVIEW MODAL (Manager only)
```
┌──────────────────────────────────────────────┐
│ Review Return Request                       │
├──────────────────────────────────────────────┤
│ ID: TRF-00123                                │
│ Product: Aqua 1L                            │
│ Requested Qty: 50                            │
│ Staff: John Doe                              │
│                                             │
│ Actual Received: [____]                      │
│                                             │
│ Difference: 5 (Keep with Staff / Flag Error)│
│                                             │
│ Notes: [____________]                       │
│                                             │
│ [Reject]              [Approve]             │
└──────────────────────────────────────────────┘
```

---

## RECOMMENDED FILE CLEANUP

### Files to REMOVE (12 files)
1. `src/components/inventory/ReturnReviewModal.tsx` - Logic in Inventory.tsx
2. `src/components/inventory/PendingReturns.tsx` - Logic in Inventory.tsx
3. `src/components/inventory/StaffReturnForm.tsx` - Logic in Inventory.tsx
4. `src/components/inventory/ManagerReturnDashboard.tsx` - Logic in Inventory.tsx
5. `src/components/inventory/ReturnDetailView.tsx` - Logic in Inventory.tsx
6. `src/components/inventory/ProductCard.tsx` - Duplicate
7. `src/components/inventory/AdjustStockModal.tsx` - Duplicate
8. `src/components/inventory/bom-columns.tsx` - Wrong module
9. `src/components/inventory/purchase-order-columns.tsx` - Wrong module
10. `src/components/inventory/PurchaseOrderForm.tsx` - Wrong module

### Files to KEEP (14 files)
1. `InventorySummaryCards.tsx`
2. `WarehouseStockView.tsx` - Simplify to just product list
3. `StaffStockView.tsx`
4. `StockTransferModal.tsx`
5. `StockAdjustmentModal.tsx`
6. `StockHistoryView.tsx`
7. `RawMaterialInventoryView.tsx`
8. `ProductInventoryCard.tsx`
9. `RawMaterialForm.tsx` - Review
10. `raw-material-columns.tsx` - Review
11. `vendor-columns.tsx` - Review
12. Index files

---

## PROPOSED SIMPLIFIED COMPONENT STRUCTURE

```
src/components/inventory/
├── index.ts                           # Exports all
├── InventorySummaryCards.tsx         # Stats for managers
├── WarehouseStockView.tsx            # Product list (simplified)
├── StaffStockView.tsx                 # Staff holding cards
├── StockTransferModal.tsx            # Transfer stock modal
├── StockAdjustmentModal.tsx          # Adjust stock modal  
├── StockHistoryView.tsx               # Movement history
├── RawMaterialInventoryView.tsx      # Raw materials
├── ProductInventoryCard.tsx          # Product row/card
├── raw-material-columns.tsx           # Table columns (keep for RawMaterials.tsx)
└── vendor-columns.tsx                # Table columns (keep for Vendors.tsx)
```

---

## DECISION POINTS FOR YOU

1. **Raw Materials tab**: Should be in Inventory page or separate page?
   - Current: In Inventory page (Manager/Admin only)
   - Alternative: Separate "Raw Materials" page

2. **Products Page**: Should Products.tsx be separate or integrated?
   - Current: Separate Products.tsx page
   - Proposal: Use Inventory page's "Products" tab

3. **Staff Stock Section**: Show in Inventory or separate page?
   - Current: In Inventory page
   - Alternative: Keep in Inventory (only Admin/Manager see it)

4. **History tab**: Merge into main view or keep separate?
   - Current: Separate "History" tab
   - Proposal: Keep as is for clean data view

Please confirm which approach you'd like me to implement, or suggest modifications to this wireframe.
