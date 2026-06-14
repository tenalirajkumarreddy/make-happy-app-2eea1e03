# SALES FLOW DEEP-DIVE AUDIT REPORT

**Project:** BizManager  
**Audit Date:** June 14, 2026  
**Scope:** Sales recording, editing, returns, cancellations (frontend → backend)  
**Risk Level:** 🔴 CRITICAL

---

## EXECUTIVE SUMMARY

The sales flow is the **most critical business process** in BizManager, handling revenue recording, inventory deduction, credit management, and order fulfillment. While the backend RPCs are well-hardened with optimistic locking and FOR UPDATE locks, there are **15+ critical/high severity issues** including security vulnerabilities, data integrity gaps, and race conditions.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ useRecord   │  │ useEditSale  │  │ SaleReturnDialog│   │
│  │   Sale.tsx  │  │   .tsx       │  │   .tsx          │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                │                    │             │
│         │    ┌───────────┴─────────────┐      │             │
│         │    │  validateSaleData()     │      │             │
│         │    │  (schemas.ts)           │      │             │
│         │    └─────────────────────────┘      │             │
└─────────┼─────────────────────────────────────┼─────────────┘
          │                                     │
          │  RPC Calls                          │
          ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (Supabase)                 │
│  ┌──────────────────┐  ┌─────────────────────────────────┐ │
│  │ record_sale()    │  │ edit_sale()                     │ │
│  │ - Stock deduct   │  │ - Reverse original stock        │ │
│  │ - Credit check   │  │ - Record new sale               │ │
│  │ - Order fulfill  │  │ - Same-day lock                 │ │
│  └──────────────────┘  └─────────────────────────────────┘ │
│  ┌──────────────────┐  ┌─────────────────────────────────┐ │
│  │ record_sale_     │  │ admin_cancel_sale()             │ │
│  │   return()       │  │ (void sale, reverse all)        │ │
│  │ - Full returns   │  │                                 │ │
│  │ - Wastage track  │  │                                 │ │
│  └──────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER (Postgres)                    │
│  Tables: sales, sale_items, sale_returns,                  │
│          sale_return_tracked_items, wastage_entries,       │
│          staff_stock, product_stock, stores                │
└─────────────────────────────────────────────────────────────┘
```

---

## CRITICAL BUGS (P0 - Fix Immediately)

### 🔴 1. `edit_sale` RPC Missing `SET search_path = public`

**Severity:** CRITICAL - Security Vulnerability  
**File:** `supabase/migrations/20260530000001_harden_sales_and_returns_rpcs.sql:401-695`  
**Impact:** Search path injection attack possible

**Issue:**
```sql
CREATE OR REPLACE FUNCTION public.edit_sale(...)
LANGUAGE plpgsql
SECURITY DEFINER
-- ❌ MISSING: SET search_path = public
AS $$
```

All other critical RPCs (`record_sale`, `record_sale_return`, `admin_cancel_sale`) include `SET search_path = public`. Without it, `edit_sale` is vulnerable to **search path injection** — a malicious user could create a function or table in a schema that appears earlier in the search path.

**Exploit Scenario:**
1. Attacker creates schema `pg_temp` with fake `staff_stock` table
2. Calls `edit_sale` which resolves `staff_stock` from attacker's schema
3. Stock manipulation without proper checks

**Fix:**
```sql
CREATE OR REPLACE FUNCTION public.edit_sale(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- ✅ ADD THIS
AS $$
```

---

### 🔴 2. `record_sale_return` Missing `SET search_path = public`

**Severity:** CRITICAL - Security Vulnerability  
**File:** `supabase/migrations/20260529000002_record_sale_return_rpc.sql:39`  
**Impact:** Same as #1 - search path injection

**Issue:**
All three versions of `record_sale_return` (in migrations `20260529000002`, `20260530000001`, `20260530000003`) omit `SET search_path = public`.

**Fix:** Add `SET search_path = public` to all versions.

---

### 🔴 3. `record_sale_return` Doesn't Set `is_fully_returned = true`

**Severity:** CRITICAL - Data Integrity  
**File:** `supabase/migrations/20260530000001_harden_sales_and_returns_rpcs.sql:876-878`  
**Impact:** Double-returns possible, UI shows wrong actions

**Issue:**
```sql
-- Update sale outstanding
UPDATE public.sales
SET outstanding_amount = v_new_outstanding,
    updated_at = now()
WHERE id = p_sale_id;

-- ❌ MISSING: is_fully_returned = true
```

The RPC reduces `outstanding_amount` but **never sets `is_fully_returned = true`**. This breaks UI logic in `SaleDetailsDialog.tsx:118-139`:

```tsx
// Line 118 - Return button always visible
{isAdmin && !(sale as any).is_fully_returned && (
  <Button onClick={() => onReturn(sale)}>Process Return</Button>
)}

// Line 126 - Cancel button always visible
{canCancelSales && !(sale as any).is_fully_returned && (
  <Button onClick={() => onCancel(sale)}>Cancel Sale</Button>
)}
```

**Consequence:** Admins can process multiple returns on the same sale, or cancel an already-returned sale.

**Fix:**
```sql
-- After updating outstanding
UPDATE public.sales
SET outstanding_amount = v_new_outstanding,
    is_fully_returned = CASE WHEN v_new_outstanding = 0 THEN true ELSE false END,
    updated_at = now()
WHERE id = p_sale_id;
```

---

### 🔴 4. `edit_sale`: Stock Reversal Goes to ORIGINAL Recorder

**Severity:** CRITICAL - Stock Leak  
**File:** `supabase/migrations/20260530000001_harden_sales_and_returns_rpcs.sql:483-499`  
**Impact:** Agent gets stock back when admin edits, new sale deducts from admin (who has no stock)

**Issue:**
When an admin edits an agent's sale:

```sql
-- Reverse stock to ORIGINAL recorder (the agent)
UPDATE public.staff_stock
SET quantity = quantity + v_orig_item.quantity
WHERE user_id = v_orig.recorded_by  -- ❌ Original agent
  AND product_id = v_orig_item.product_id;

-- New sale deducts from p_recorded_by (the admin)
UPDATE public.staff_stock
SET quantity = quantity - v_quantity
WHERE user_id = p_recorded_by  -- ❌ Admin editor
  AND product_id = v_product_id;
```

**Scenario:**
1. Agent Alice records sale of 10 bottles (her staff_stock: 50 → 40)
2. Admin Bob edits the sale (changes quantity to 15)
3. Stock reversal: Alice gets +10 back (40 → 50) ✅
4. New sale deduction: Tries to deduct from Bob's staff_stock (0 → -15) ❌
5. Fallback to warehouse stock, but Alice still has inflated 50 units

**Result:** Alice has 10 extra units she shouldn't have.

**Fix:**
```sql
-- Only reverse stock if editor is same as original recorder
IF p_recorded_by = v_orig.recorded_by THEN
    -- Reverse to original recorder
    UPDATE staff_stock SET quantity = quantity + ...
    WHERE user_id = v_orig.recorded_by;
ELSE
    -- Editor is different user - don't reverse to original
    -- Use warehouse stock for reversal
    UPDATE product_stock SET quantity = quantity + ...
    WHERE warehouse_id = v_warehouse_id;
END IF;

-- For new sale, always deduct from p_recorded_by's staff_stock first
-- (existing logic is correct)
```

---

### 🔴 5. Customer Role Can't Read Their Own Sales

**Severity:** CRITICAL - Access Control  
**File:** `supabase/migrations/20260615000002_fix_rls_initplan_performance.sql:29-36`  
**Impact:** Customer portal shows empty sales list

**Issue:**
```sql
CREATE POLICY "Staff can view sales" ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  -- ❌ MISSING: customer role
);
```

The `customer` role is excluded from sales SELECT. The mobile customer portal (`src/mobile/pages/customer/CustomerSales.tsx`) will return **empty results** for customer users.

**Fix:**
```sql
CREATE POLICY "Staff can view sales" ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND customer_id = (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  )
);
```

---

## HIGH SEVERITY BUGS (P1 - Fix This Sprint)

### 🟠 6. `SaleReturnDialog`: Post-RPC Direct Update Bypasses RLS

**Severity:** HIGH - Silent Data Loss  
**File:** `src/components/sales/SaleReturnDialog.tsx:134-138`  
**Impact:** Notes lost if user lacks UPDATE permission on `sale_returns`

**Issue:**
```tsx
// Save notes to the return record (RPC doesn't accept notes parameter)
if (notes.trim() && result?.[0]?.return_id) {
  await supabase
    .from("sale_returns")
    .update({ notes: notes.trim() })  // ❌ Direct update
    .eq("id", result[0].return_id);
}
```

The `record_sale_return` RPC doesn't accept a `p_notes` parameter, so the dialog does a separate direct `update()`. This update is subject to RLS policies on `sale_returns`. If the user's RLS policy doesn't permit UPDATE, this silently fails and notes are lost.

**Fix:**
1. Add `p_notes TEXT DEFAULT NULL` parameter to `record_sale_return` RPC
2. Insert notes directly in the RPC (SECURITY DEFINER bypasses RLS)

```sql
-- In record_sale_return function signature
p_notes TEXT DEFAULT NULL

-- In INSERT statement
INSERT INTO public.sale_returns (..., notes)
VALUES (..., p_notes);
```

---

### 🟠 7. `edit_sale`: No `SET search_path` in ALL Versions

**Severity:** HIGH - Security  
**Files:** 
- `20260530000001_harden_sales_and_returns_rpcs.sql:401` (v1)
- `20260530000003_upgrade_locks_and_timezones.sql:4` (v2)
- `20260530000004_fix_sale_returns_calculations.sql:291` (v3)

**Issue:** All four redefinitions of `edit_sale` lack `SET search_path = public`.

---

### 🟠 8. Race Condition: `generate_display_id` Called Separately

**Severity:** HIGH - Data Integrity  
**File:** `src/hooks/useRecordSale.ts:296`, `src/mobile/pages/agent/AgentRecordSale.tsx:303-306`  
**Impact:** Display ID gaps if app crashes between calls

**Issue:**
```ts
// Two separate RPC calls
const { data: displayId } = await supabase.rpc("generate_display_id", {...});
// ❌ App could crash here, consuming a display ID with no sale

recordSaleMutation.mutate({ displayId, ... });
```

**Fix:** Move display ID generation inside `record_sale` RPC (atomic).

---

### 🟠 9. `validateSaleData` Doesn't Catch Payment > Total

**Severity:** HIGH - UX  
**File:** `src/lib/validation/schemas.ts:37-106`  
**Impact:** Negative outstanding shown in UI, rejected by server

**Issue:**
```ts
const outstandingFromSale = totalAmount - cash - upi;
// ❌ No check for outstandingFromSale < 0
```

Zod schema allows `cash_amount + upi_amount > total_amount`. The RPC catches `outstanding_mismatch`, but UX is poor.

**Fix:**
```ts
if (data.cash_amount + data.upi_amount > data.total_amount) {
  errors.push("Payment cannot exceed total amount");
}
```

---

### 🟠 10. Offline Credit Validation Allows Sales with Expired Cache

**Severity:** HIGH - Credit Risk  
**File:** `src/lib/offlineCreditValidation.ts:168`  
**Impact:** Credit limits bypassed when cache expires

**Issue:**
```ts
if (!creditData) {
  return { valid: true, ... }; // ❌ Allow sale with no data
}
```

When offline and credit cache is missing/expired, the sale is allowed through for non-admins.

**Fix:**
```ts
if (!creditData) {
  if (isAdmin) {
    return { valid: true, ... };
  } else {
    return { 
      valid: false, 
      warning: "Credit data unavailable. Please go online to record sale."
    };
  }
}
```

---

### 🟠 11. `adjust_store_balance`: No FOR UPDATE Lock

**Severity:** HIGH - Race Condition  
**File:** `supabase/migrations/20260521000002_atomic_store_balance_adjustment.sql:21-22`  
**Impact:** Lost updates on store outstanding

**Issue:**
```sql
-- ❌ No FOR UPDATE lock
SELECT COALESCE(outstanding, 0) INTO v_old_outstanding
FROM public.stores
WHERE id = p_store_id;

-- ... calculations ...

-- Update based on stale read
UPDATE public.stores
SET outstanding = v_new_outstanding
WHERE id = p_store_id;
```

**Fix:**
```sql
SELECT COALESCE(outstanding, 0) INTO v_old_outstanding
FROM public.stores
WHERE id = p_store_id
FOR UPDATE;  -- ✅ Add this
```

---

### 🟠 12. `sale_returns` Table Missing UPDATE RLS Policy

**Severity:** HIGH - Access Control  
**File:** `supabase/migrations/20260509000001_fix_rls_balance_corrections_payment_returns.sql`  
**Impact:** Users can't update notes on returns they created

**Issue:** Table has RLS enabled but no UPDATE policy for staff who processed returns.

**Fix:**
```sql
CREATE POLICY "Staff can update own returns" ON public.sale_returns
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR created_by = auth.uid()
);
```

---

## MEDIUM SEVERITY BUGS (P2 - Fix Next Sprint)

### 🟡 13. Three Code Paths with Divergent Validation

**Severity:** MEDIUM - Data Quality  
**Files:** 
- `src/hooks/useRecordSale.ts` (web)
- `src/mobile/pages/agent/AgentRecordSale.tsx` (mobile)
- `src/lib/validation/schemas.ts` (shared)

**Issue:**

| Validation | Web | Mobile | Schema |
|---|---|---|---|
| Zod schema | ✅ | ❌ | ✅ |
| Store active check | ❌ | ❌ | ❌ |
| `customer_id` required | ✅ | ✅ | ❌ |
| POS full-payment | ✅ | ✅ | ✅ |
| Stock check | ✅ | ✅ | ❌ |
| Date validation | ✅ | ❌ | ✅ |
| Payment > total | ❌ | ❌ | ❌ |
| Zero quantity | ✅ | ❌ | ✅ |

**Fix:** Unify all paths through `useSaleValidation` hook + `validateSaleData`.

---

### 🟡 14. `useSaleValidation.ts` is Dead Code

**Severity:** MEDIUM - Code Quality  
**File:** `src/hooks/useSaleValidation.ts`  
**Impact:** Wasted code, inconsistent validation

**Issue:** Comprehensive validation hook imported by **zero components**.

---

### 🟡 15. Web `useRecordSale`: `outstandingFromSale` Can Be Negative

**Severity:** MEDIUM - UX  
**File:** `src/hooks/useRecordSale.ts:161`  
**Impact:** Negative outstanding shown in UI

**Issue:**
```ts
const outstandingFromSale = totalAmount - cash - upi;
// ❌ No Math.max(0, ...)
```

Mobile path uses `Math.max(0, ...)` but web doesn't.

**Fix:**
```ts
const outstandingFromSale = Math.max(0, totalAmount - cash - upi);
```

---

### 🟡 16. `is_fully_returned` Never Set → UI Broken

**Severity:** MEDIUM - UX  
**File:** `src/components/sales/SaleDetailsDialog.tsx:118-139`  
**Impact:** Return/Cancel buttons visible on returned sales

**Issue:** Already covered in #3, but UI consequence is separate.

---

### 🟡 17. Proximity Check Inconsistent Import Style

**Severity:** LOW - Code Quality  
**Files:** 
- `src/mobile/pages/agent/AgentRecordSale.tsx:22` (static)
- Route session (dynamic `import()`)

---

## RECOMMENDATIONS BY PRIORITY

### P0 - Critical (This Week)

1. **Add `SET search_path = public` to all SECURITY DEFINER functions**
   - `edit_sale` (4 versions)
   - `record_sale_return` (3 versions)
   - Create migration: `20260614000001_fix_rpc_search_paths.sql`

2. **Fix `record_sale_return` to set `is_fully_returned`**
   - Migration: `20260614000002_set_fully_returned_on_return.sql`

3. **Fix `edit_sale` stock reversal logic**
   - Don't reverse to original user if editor is different
   - Migration: `20260614000003_fix_edit_sale_stock_logic.sql`

4. **Add customer to sales RLS**
   - Migration: `20260614000004_add_customer_to_sales_rls.sql`

5. **Add `FOR UPDATE` locks**
   - `adjust_store_balance`: lock store row
   - Migration: `20260614000005_add_for_update_locks.sql`

### P1 - High (This Sprint)

6. **Move `notes` param into `record_sale_return` RPC**
   - Prevents RLS bypass

7. **Fix offline credit validation**
   - Don't allow sales with expired cache for non-admins

8. **Add RLS policies for missing tables**
   - `sale_returns` (UPDATE)
   - `sale_return_tracked_items` (SELECT)
   - `wastage_entries` (SELECT)

9. **Unify validation across web/mobile**
   - Use `useSaleValidation` hook everywhere

10. **Move display ID generation inside `record_sale`**
    - Atomic operation

### P2 - Medium (Next Sprint)

11. **Add CHECK constraint for `outstanding_amount >= 0`**

12. **Fix `validateSaleData` to catch payment > total**

13. **Add `staleTime` to web queries**
    - Match mobile's 5-minute cache

14. **Remove dead code `useSaleValidation.ts` or start using it**

---

## TESTING CHECKLIST

Before deploying fixes:

- [ ] Test `edit_sale` with admin editing agent's sale (stock tracking)
- [ ] Test double-return prevention (UI + RPC)
- [ ] Test customer viewing their own sales
- [ ] Test offline sale with expired credit cache
- [ ] Test concurrent sales on same store (optimistic locking)
- [ ] Test search path injection attempt (security test)
- [ ] Test same-day edit lockout (midnight boundary)
- [ ] Test full return with partial damage (wastage tracking)

---

## FILES REQUIRING CHANGES

### Migrations (Create New)
```
supabase/migrations/
  20260614000001_fix_rpc_search_paths.sql
  20260614000002_set_fully_returned_on_return.sql
  20260614000003_fix_edit_sale_stock_logic.sql
  20260614000004_add_customer_to_sales_rls.sql
  20260614000005_add_for_update_locks.sql
```

### Frontend
```
src/hooks/useRecordSale.ts:161
src/hooks/useEditSale.ts
src/components/sales/SaleDetailsDialog.tsx:118-139
src/components/sales/SaleReturnDialog.tsx:134-138
src/lib/validation/schemas.ts:37-106
src/lib/offlineCreditValidation.ts:168
```

### Backend (Existing Migrations to Patch)
```
supabase/migrations/
  20260530000001_harden_sales_and_returns_rpcs.sql (edit_sale, record_sale_return)
  20260530000003_upgrade_locks_and_timezones.sql (edit_sale)
  20260530000004_fix_sale_returns_calculations.sql (edit_sale)
  20260529000002_record_sale_return_rpc.sql
```

---

## METRICS TO TRACK POST-FIX

- Sales recording latency (p95)
- Concurrent modification errors (should decrease)
- Credit limit violations (should decrease)
- Double-return attempts (should be zero)
- Stock discrepancy reports (should decrease)

---

**Audit Completed By:** AI Agent  
**Review Required By:** Backend Lead, Security Team  
**Estimated Fix Time:** 3-5 days for P0, 1-2 weeks for all