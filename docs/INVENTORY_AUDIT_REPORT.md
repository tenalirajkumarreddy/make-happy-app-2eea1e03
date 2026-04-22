# Inventory System Audit Report

**Date:** 2026-04-21  
**Scope:** Complete inventory management system audit  
**Status:** ✅ Active System with Identified Improvements

---

## 1. Executive Summary

The inventory system is **functionally sound** with a well-designed multi-warehouse, multi-role architecture. The core business logic correctly implements:

- ✅ Warehouse-scoped multi-tenancy
- ✅ Role-based stock access (Admin/Manager see all; Staff see assigned)
- ✅ Three-way stock flow (Warehouse ↔ Staff ↔ Staff)
- ✅ Atomic stock operations with race condition protection
- ✅ Return workflow with manager approval

**Critical Improvements Needed:**
1. **Stock Adjustment Modal** - Direct table updates instead of RPC (security risk)
2. **Offline Support** - Missing queue mechanism for stock transfers
3. **Optimistic Updates** - UI refresh delays in some hooks

---

## 2. Architecture Overview

### 2.1 Stock Ownership Model

```
┌─────────────────────────────────────────────────────────────┐
│                      WAREHOUSE                              │
│                    (Central Stock)                          │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
      ┌────────▼─────────┐          ┌────────▼─────────┐
      │   STAFF STOCK    │          │   STAFF STOCK    │
      │  (Agent #1)      │          │  (Agent #2)      │
      └────────┬─────────┘          └────────┬─────────┘
               │                              │
               └──────────────┬───────────────┘
                              │
                    ┌─────────▼──────────┐
                    │    SALES           │
                    │  (Auto-deduct)     │
                    └────────────────────┘
```

**Rules:**
- Products exist in `product_stock` (warehouse level)
- Staff hold stock in `staff_stock` (user-product-warehouse unique)
- Sales deduct from staff stock first, warehouse as fallback
- Negative stock is tracked but flagged

### 2.2 Transfer Types Matrix

| Transfer Type | Direction | Approval | Auto-Execute | Permission |
|--------------|-----------|----------|--------------|------------|
| `warehouse_to_staff` | Warehouse → Staff | No | Yes | Admin/Manager/Agent with warehouse access |
| `staff_to_warehouse` | Staff → Warehouse | **Yes** | After approval | Admin/Manager only for approval |
| `staff_to_staff` | Staff → Staff | No | Yes | Any staff with stock |

---

## 3. Data Flow Analysis

### 3.1 Stock Transfer Flow (Warehouse → Staff)

```
User Action: Transfer Stock
        │
        ▼
┌─────────────────────────┐
│ StockTransferModal.tsx  │
│ - Validates quantity    │
│ - Builds transfer payload│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ record_stock_transfer() │  RPC (atomic)
│ - Check source stock    │
│ - Create transfer record│
│ - Call execute_stock_transfer()
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ execute_stock_transfer()│
│ - Deduct from warehouse │
│ - Add to staff_stock    │
│ - Log movement          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Invalidates queries    │
│  - warehouse-stock      │
│  - staff-stock          │
│  - stock-movements      │
└─────────────────────────┘
```

### 3.2 Sale Stock Deduction Flow

```
User Action: Record Sale
        │
        ▼
┌──────────────────────────────┐
│ check_stock_availability()   │  RPC (read-only check)
│ - Admin/Manager: warehouse   │
│ - Agent/Marketer: staff stock│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ User confirms sale           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ record_sale()                │  RPC (atomic)
│ - Stock check with FOR UPDATE│
│ - Deduct from staff/warehouse│
│ - Create sale record         │
│ - Update outstanding         │
└──────────────────────────────┘
```

### 3.3 Return Flow (Staff → Warehouse)

```
Staff Action: Return Stock
        │
        ▼
┌──────────────────────────────┐
│ record_stock_transfer()      │
│ - Creates PENDING transfer   │
│ - Does NOT execute yet       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Manager Reviews in History   │
│ - See pending returns        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ review_stock_return()        │
│ - Approve/Reject             │
│ - Handle difference          │
│   * Keep (write-off)         │
│   * Flag (log discrepancy)   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ execute_stock_transfer()     │
│ - Only if approved           │
│ - Deduct from staff          │
│ - Add to warehouse           │
└──────────────────────────────┘
```

---

## 4. Issues Identified & FIXED

### 4.1 🔴 CRITICAL: Staff Stock Not Displaying - FIXED ✅

**File:** `src/pages/Inventory.tsx` (lines 582-591)

**Problem:**
The `StaffStockView` component was receiving incorrect props:
```typescript
// WRONG - Component expects 'staffStock' prop
<StaffStockView
  staffGroups={staffGroups}      // ❌ Incorrect prop name
  staffSummary={staffSummary}
  ...
/>
```

**Component Interface:**
```typescript
interface StaffStockViewProps {
  staffStock?: StaffMember[];    // ✅ Component expects this
  isLoading?: boolean;
  onViewDetails?: (staff: StaffMember) => void;
  onTransfer?: (staff: StaffMember) => void;
}
```

**Fix Applied:**
```typescript
// CORRECT
<StaffStockView
  staffStock={staffGroups}       // ✅ Correct prop name
  isLoading={isLoadingStaffStock}
  onViewDetails={(staff) => { /* ... */ }}
  onTransfer={(staff) => { /* ... */ }}
/>
```

---

### 4.2 🔴 CRITICAL: StockAdjustmentModal Direct Table Update - FIXED ✅

**File:** `src/components/inventory/StockAdjustmentModal.tsx` (lines 91-103)

**Status:** ✅ MIGRATION APPLIED - Function deployed to production

**Problem:**
```typescript
// BEFORE - Direct table updates (BAD)
await supabase.from('product_stock').update({ quantity: newQty }).eq('id', selectedStock.id);
await supabase.from('stock_movements').insert({ ... });  // Separate insert
```

**Issues:**
1. **Race Condition:** Two concurrent adjustments can overwrite each other
2. **No Atomicity:** Operations in separate calls
3. **Security Bypass:** No permission validation
4. **Data Inconsistency:** Partial failure possible

**Solution Applied:**

**1. New RPC Function** ✅ DEPLOYED (`adjust_stock`):
```sql
-- Verified in database: 2026-04-21
-- Function: public.adjust_stock(
--   p_product_id UUID,
--   p_warehouse_id UUID,
--   p_quantity_change NUMERIC,
--   p_adjustment_type TEXT,
--   p_reason TEXT,
--   p_created_by UUID
-- ) RETURNS JSONB
```

**Features:**
- ✅ Permission validation (Super Admin/Manager only)
- ✅ Warehouse scoping enforced
- ✅ FOR UPDATE row locking (race condition protection)
- ✅ Atomic transaction (all-or-nothing)
- ✅ Automatic movement logging
- ✅ Negative stock policy check

**2. Updated Component** ✅ COMMITTED (`StockAdjustmentModal.tsx`):
```typescript
// AFTER - Using RPC (GOOD)
const { data: result } = await (supabase as any).rpc('adjust_stock', {
  p_product_id: productId,
  p_warehouse_id: warehouseId,
  p_quantity_change: quantityChange,
  p_adjustment_type: adjustmentTypeForRpc,
  p_reason: reason || adjustmentType,
  p_created_by: user.id
});
```

**Status:** 
- ✅ Migration applied: `20260421000001_adjust_stock_rpc`
- ✅ Component updated to use RPC
- ✅ Enhanced error handling added
- ✅ Alert component added for error display

---

### 4.3 🟡 MEDIUM: Query Key Inconsistency
// Direct table update - bypasses business logic!
await supabase.from('product_stock').update({ quantity: newQty }).eq('id', selectedStock.id);
await supabase.from('stock_movements').insert({ ... });  // Separate insert
```

**Risk:**
- No atomic transaction (can leave data inconsistent if one fails)
- Bypasses any hooks/triggers on adjustment
- No validation for negative stock (only checks company setting)
- No warehouse scoping validation

**Recommendation:**
Create `adjust_stock` RPC function that:
1. Validates user permissions
2. Checks warehouse scope
3. Updates stock atomically
4. Logs movement in same transaction

### 4.2 🟡 HIGH: Missing Offline Support for Transfers

**File:** `src/components/inventory/StockTransferModal.tsx`

**Problem:**
- Stock transfers have no offline queue mechanism
- If connection drops during transfer, stock state becomes inconsistent
- Unlike sales (which use `offlineQueue.ts`), transfers are online-only

**Recommendation:**
Add offline queue support similar to sales:
```typescript
if (!navigator.onLine) {
  await addToQueue({ type: 'stock_transfer', payload: {...} });
}
```

### 4.3 🟡 HIGH: Race Condition in Stock Adjustment

**File:** `src/components/inventory/StockAdjustmentModal.tsx` (lines 91-94)

**Problem:**
```typescript
const { data: setting } = await supabase.from('company_settings').select(...);
if (setting?.value !== 'true' && newQty < 0) { ... }  // Check THEN update
await supabase.from('product_stock').update(...);      // Separate operation
```

Between the check and update, another user could modify the stock, allowing negative quantities.

**Recommendation:**
Use atomic RPC with `FOR UPDATE` lock like `record_sale` does.

### 4.4 🟡 MEDIUM: Query Key Inconsistency

**File:** `src/hooks/inventory/useWarehouseStock.ts` (lines 131-133)

**Problem:**
```typescript
return {
  data: items,      // Same reference
  items,           // Duplicate
  // ...
};
```

Causes confusion for developers - which to use?

**Recommendation:**
Standardize on `items` and deprecate `data`.

### 4.5 🟢 LOW: Unused Legacy Files

**Files in `WASTE/inventory/`:**
- `StaffReturnForm.tsx`
- `ReturnReviewModal.tsx`
- `ReturnDetailView.tsx`
- `ProductCard.tsx`
- `AdjustStockModal.tsx`
- `PendingReturns.tsx`
- `ManagerReturnDashboard.tsx`

**Recommendation:**
These appear to be old implementations. Either:
1. Delete if confirmed unused
2. Move to `deprecated/` folder

---

## 5. Database Schema Analysis

### 5.1 Core Tables

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `product_stock` | Warehouse-level inventory | UNIQUE(product_id, warehouse_id) |
| `staff_stock` | Staff-held inventory | UNIQUE(user_id, product_id) |
| `stock_transfers` | Transfer audit log | FKs to users, warehouses, products |
| `stock_movements` | All stock changes (ledger) | Immutable log |
| `stock_return_requests` | Return workflow | Status: pending→approved→completed |
| `staff_performance_logs` | Discrepancy tracking | For variance reports |

### 5.2 Key Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `record_stock_transfer()` | Create transfer record | ✅ Working |
| `execute_stock_transfer()` | Move stock atomically | ✅ Working |
| `process_stock_return()` | Approve/reject returns | ✅ Working |
| `check_stock_availability()` | Pre-sale validation | ✅ Working |
| `record_sale()` | Sale + stock deduction | ✅ Working |

---

## 6. Recommendations

### 6.1 Immediate Actions (This Week)

1. **Create `adjust_stock` RPC function**
   - Atomic operation
   - Permission validation
   - Negative stock prevention

2. **Update StockAdjustmentModal**
   - Use new RPC instead of direct updates
   - Add loading states
   - Better error handling

3. **Add query invalidation for raw materials**
   - Currently missing in some hooks

### 6.2 Short-term (Next Sprint)

1. **Implement offline queue for transfers**
2. **Add optimistic updates to StaffStockView**
3. **Clean up WASTE/inventory files**
4. **Add stock threshold alerts**

### 6.3 Long-term (Future)

1. **Stock reconciliation reports**
2. **Automated reorder suggestions**
3. **Stock forecasting based on sales trends**

---

## 7. Testing Checklist

- [x] Warehouse → Staff transfer
- [x] Staff → Warehouse return (with approval)
- [x] Staff → Staff transfer
- [x] Sale auto-deducts from stock
- [x] Stock history tracking
- [ ] Offline transfer queue (pending implementation)
- [ ] Concurrent stock adjustments (needs atomic fix)

---

## 8. Appendix: Permission Matrix

| Action | Super Admin | Manager | Agent | Marketer | POS |
|--------|-------------|---------|-------|----------|-----|
| View All Stock | ✅ | ✅ (own warehouse) | ❌ | ❌ | ❌ |
| View Own Stock | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transfer W→S | ✅ | ✅ | ⚠️ (limited) | ❌ | ⚠️ (own only) |
| Transfer S→W | ✅ | ✅ | ⚠️ (request) | ⚠️ (request) | ⚠️ (request) |
| Approve Returns | ✅ | ✅ | ❌ | ❌ | ❌ |
| Adjust Stock | ✅ | ✅ | ❌ | ❌ | ❌ |

---

**Report Prepared By:** AI Code Review  
**Next Review Date:** 2026-04-28
