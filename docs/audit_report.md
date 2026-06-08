# Comprehensive System Audit Report

**Project:** BizManager (NEWZ)
**Database:** Supabase Postgres (105+ tables, 160+ triggers, 330+ functions)
**Frontend:** React + Vite + TypeScript + shadcn/ui + Capacitor
**Audit Date:** 2026-06-08

---

## Executive Summary

The system is **functionally complete** — all core business domains are covered with mature implementations. However, there are **critical security vulnerabilities** and several **business logic issues** that must be resolved before production release. The most severe: **126 SECURITY DEFINER functions are callable by unauthenticated users**, and **5 tables have RLS disabled**.

Overall readiness: **NOT PRODUCTION-READY** — needs security fixes first.

---

## 1. CRITICAL SECURITY ISSUES

### 1.1 126 Functions Executable by Anonymous Users
**Severity: CRITICAL**
**Risk: Anyone can call any business RPC without authentication**

Functions like `record_sale`, `admin_cancel_sale`, `edit_handover`, `finalizer_daily_reset`, `approve_expense_claim`, `reconcile_outstanding`, `record_stock_transfer` are marked `SECURITY DEFINER` (run with owner privileges) **and** have `EXECUTE` granted to the `anon` role.

Anyone who discovers your API endpoint can:
- Record fake sales
- Cancel/void legitimate sales
- Edit handovers
- Approve their own expense claims
- Reset daily balances

**Root cause:** The `public` schema functions default to `SECURITY DEFINER` and Supabase auto-grants `EXECUTE` to `anon` for `public` schema functions.

**Recommended fix (priority order):**
1. `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;`
2. `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;`
3. Add explicit `SECURITY INVOKER` on functions that don't need elevated privileges
4. For functions that DO need elevated privileges, use `SET search_path = ''` and add explicit permission checks inside the function body

### 1.2 RLS Disabled on 5 Tables
**Severity: CRITICAL**

| Table | Risk |
|-------|------|
| `user_roles` | Role assignments exposed/modifiable via API |
| `fcm_tokens` | FCM device tokens exposed (PII) |
| `app_config` | Contains FCM service account JSON (credentials exposed!) |
| `sale_return_tracked_items` | Return data accessible |
| `wastage_entries` | Waste data accessible |

**`user_roles` RLS was disabled intentionally** (`20260520000002`) due to recursion when policies try to read `user_roles` to check roles. The `has_role()` function was introduced as a workaround.

**Immediate fixes:**
1. `app_config` currently stores the **entire Firebase FCM service account JSON** — migrate this to environment variables immediately
2. Enable RLS on `fcm_tokens` with user-scoped policies
3. Enable RLS on `user_roles` using `(SELECT auth.uid()) = user_id` for self-read, and restrict writes to super_admin

### 1.3 21 SECURITY DEFINER Views
**Severity: HIGH**
**Risk: Views bypass RLS entirely**

Views like `customer_outstanding_summary`, `low_stock_alerts`, `store_outstanding_summary`, `customer_ledger`, `vendor_balance_summary` show all data regardless of user permissions.

**Fix:** Convert to `SECURITY INVOKER` or add explicit permission checks in view definitions.

### 1.4 70 Functions with Mutable Search Path
**Severity: MEDIUM**
**Risk: Privilege escalation via search_path attacks**

**Fix:** Add `SET search_path = 'public'` to all functions.

---

## 2. BUSINESS LOGIC ISSUES

### 2.1 Dual `record_sale` Overloads — Outstanding Calculation Bug

There are **two overloads** of `record_sale`:

**First overload (older, potentially deprecated):**
```sql
-- BUG: adds total (cash+upi) to store outstanding
v_new_outstanding := GREATEST(v_store_outstanding + v_total, 0)
-- Where v_total = v_total_cash + v_total_upi
```

This means if a sale is 100 with 50 cash + 50 upi, the store outstanding increases by 100 (the full amount) even though the customer paid 100. The outstanding should increase by 0.

**Second overload (newer, correct):**
```sql
v_computed_outstanding := GREATEST(p_total_amount - cash - upi, 0);
v_new_outstanding := v_old_outstanding + v_computed_outstanding;
```

**Impact:** If the frontend is using the first overload (check `Sales.tsx` and `AgentRecordSale.tsx`), outstanding amounts will be incorrectly inflated.

**Fix:** Deprecate and remove the first overload. Verify the frontend uses only the second overload.

### 2.2 Handover Outstanding vs Income Tracking Gap

Handovers track cash/UPI turned in by staff. When a handover is confirmed:
- Staff cash accounts are adjusted
- An `income_entries` record is created (via trigger)
- But the **store outstanding is NOT updated**

This means: When a customer pays cash to an agent, the agent records a transaction → store outstanding decreases. But when the agent hands over that cash, there's no linkage back to the transaction — it's tracked as "income" instead of "payment for specific invoices."

**This isn't necessarily a bug** (handover is an internal process, not a customer-facing one), but it means the "income" numbers and "collection" numbers are double-counted if you try to reconcile them.

### 2.3 Product Stock Allows Negative Values in First `record_sale`

First overload of `record_sale` uses:
```sql
SET quantity = GREATEST(quantity - v_qty, 0)
```

This **silently allows overselling** — if stock is 5 and customer wants 10, it sells 10 and sets stock to 0. No error is raised.

The second overload correctly checks stock first and raises `insufficient_stock` exception.

**Fix:** Remove the first overload entirely.

### 2.4 `process_production_log` Wraps Errors in JSON Response

```sql
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
```

This swallows exceptions and returns a success=false object. The calling code may not check for this, leading to silent failures in the production workflow.

**Fix:** Re-raise exceptions instead of swallowing them. Let the caller handle errors.

### 2.5 Dual Income Tables

Both `income` and `income_entries` exist with overlapping purposes:
- `income` has `deprecated_at` column (legacy, being phased out)
- `income_entries` is the active table with richer schema

**Risk:** Confusion about which table to use for reporting. Some triggers may write to the wrong table.

### 2.6 Dual Audit Logs

Both `activity_logs` and `audit_log` serve similar purposes. `activity_logs` is the primary one (42 triggers write to it). `audit_log` has no visible triggers.

**Recommendation:** If `audit_log` is unused, drop it. If needed, align its schema and triggers with `activity_logs`.

### 2.7 Staff Cash Account Column Duplication

`staff_cash_accounts` has BOTH:
- `cash_balance` (older, may be unused)
- `cash_amount` + `upi_amount` (newer, actively used)

Migration `20260507043425` attempted to fix this. Verify that `cash_balance` is fully replaced and can be dropped.

### 2.8 `product_stock` CHECK Constraint vs Staff Stock

`product_stock.quantity` has `CHECK (quantity >= 0)`, but:
- `staff_stock` has `is_negative` column (allows negative)
- `product_stock` uses `GREATEST(quantity - qty, 0)` in the old overload (prevents negative but masks overselling)

**Inconsistency:** Staff can have negative stock but warehouse cannot. This may be intentional (staff get stock transferred and may temporarily have negative values).

---

## 3. DATA CONSISTENCY / INTEGRITY

### 3.1 Outstanding Recalculation Triggers — Heavy Overhead

The following triggers fire AFTER INSERT/UPDATE/DELETE and call `recalc_running_balances` or similar:
- `sales` (3 triggers: INSERT, UPDATE, DELETE)
- `transactions` (3)
- `sale_returns` (3)
- `payment_returns` (3)
- `balance_corrections` (3)
- `balance_adjustments` (3)

**Risk:** With high transaction volume, these triggers could cause performance degradation. Each trigger call recalculates ALL transactions and sales for that store.

**Recommendation:** Monitor performance. Consider replacing with incremental balance updates instead of full recalculations.

### 3.2 Holding Balance Triggers — 9 Triggers on Sales/Transactions/Handovers

Holding balance is synced via triggers on:
- `sales`: INSERT, UPDATE, DELETE triggers
- `transactions`: INSERT, UPDATE, DELETE triggers  
- `handovers`: INSERT, UPDATE, DELETE triggers

**Risk:** Trigger interactions could cause race conditions or unexpected balance calculations under concurrent writes. Migration `20260530054249` fixed some gaps, but the complexity is high.

### 3.3 Missing Audit on Stock Movements

Stock movements are critical for traceability but **no audit trigger exists** on `stock_movements`. If someone deletes or modifies stock movement records, there's no trail.

---

## 4. PERFORMANCE ISSUES

### 4.1 249 `auth_rls_initplan` Warnings

All RLS policies call `auth.uid()` directly instead of wrapping in a subquery `(SELECT auth.uid())`. This causes the function to be re-evaluated per row.

**Fix:** Replace all `auth.uid()` calls with `(SELECT auth.uid())` in RLS policies. This is a one-line change per policy but affects 90+ tables.

### 4.2 170 Unindexed Foreign Keys

Foreign key columns on 70+ tables lack covering indexes — will cause sequential scans as data grows.

**Critical missing indexes:**
- `sales(created_by, assigned_to, updated_by)`
- `transactions(created_by, assigned_to)`
- `stock_movements(created_by, agent_id)`
- `handovers(handover_request_id, deleted_by)`
- `orders(assigned_to, confirmed_by, updated_by)`
- `sale_items(warehouse_id, deleted_by)`

### 4.3 177 Unused Indexes

Indexes on `activity_logs`, `audit_log`, `customers`, `stores`, `sales`, etc. exist but are never used by any query. They consume storage and write overhead.

### 4.4 Duplicate Index on `orders`

`idx_orders_single_active_per_store` and `idx_orders_unique_active_per_store` are identical. Drop one.

### 4.5 126 Multiple Permissive RLS Policies

Multiple permissive policies for the same role+action on a table (e.g., `user_roles` has 5 policies for SELECT). PostgreSQL OR's them all together, slowing queries.

---

## 5. ROLE & PERMISSION DESIGN

### 5.1 Role Architecture

6 roles: `super_admin`, `manager`, `agent`, `marketer`, `operator`, `customer`

| Role | Access Scope |
|------|-------------|
| `super_admin` | Everything |
| `manager` | Everything except system admin |
| `agent` | Sales, payments, routes, own stock, own handovers |
| `marketer` | Orders, stores, customers |
| `operator` | POS store only (warehouse-scoped) |
| `customer` | Own portal only |

**Strength:** Clean separation with well-defined scope.
**Weakness:** Role enforcement relies on SECURITY DEFINER functions rather than RLS for all business logic. If the SECURITY DEFINER grant to `anon` is revoked (which it should be), many functions will need `auth.uid()` checks inside them — which they already have for the most part.

### 5.2 `pos` → `operator` Migration

The `pos` role was renamed to `operator`. Migration `20260526044359` normalizes this. Verify that no legacy `pos` references remain in the frontend code.

---

## 6. FRONTEND HEALTH

### 6.1 42 RPC Calls from Frontend

The frontend explicitly calls 42 unique RPC functions, indicating good separation between UI and data layers.

### 6.2 Offline Queue

The offline queue in `src/lib/offlineQueue.ts` supports 7 action types with:
- IndexedDB persistence (500 item capacity)
- Exponential backoff (3 retries)
- Semantic deduplication
- Conflict detection context

This is a **mature, production-grade implementation**.

### 6.3 Realtime Sync

`useRealtimeSync` subscribes to 74 tables with role-based filtering and exponential backoff reconnection. **Well-designed.**

### 6.4 Missing Features (Frontend)

Based on backend tables that exist but have no (or minimal) frontend:
- `purchase_orders` — table exists, no frontend found
- `purchase_returns` — table exists, no frontend found
- `payrolls` + `payroll_items` — limited frontend
- `delivery_trips` — table exists, no frontend
- `balance_corrections` — table exists, no frontend
- `handover_snapshots` — table exists, no frontend
- `receivables snapshots` — table exists, no frontend

---

## 7. MIGRATION HEALTH

### 7.1 Total Migration Count: 220+ migrations

The system has 220+ SQL migrations. This is a double-edged sword:
- **Positive:** Demonstrates iterative development and comprehensive change tracking
- **Negative:** Indicates many rounds of bug fixes — suggests the initial design had significant issues

### 7.2 Duplicate Migration Names

`20260510000015_enhance_soft_delete_trigger` appears TWICE (same name, different content).
`20260530000010_fix_edit_sale_reversal_stock_target` also appears twice.

These should be merged or one dropped.

### 7.3 Migrations That Match Production

Several tables exist in production but have no CREATE TABLE migration in the codebase:
- `vehicles`, `delivery_trips`, `audit_log`, `data_quality_issues`
- `sms_jobs`, `banner_store_types`, `app_config`

These were likely created via Supabase dashboard or external scripts. **This is a schema documentation gap.**

---

## 8. RECOMMENDED ACTION PLAN

### Phase 1 — Immediate (Before Production)
1. **Revoke EXECUTE from anon on ALL public functions** — this is the single biggest risk
2. **Move FCM service account JSON** from `app_config` table to environment variables
3. **Enable RLS on `user_roles`** (use `has_role()` to prevent recursion)
4. **Enable RLS on `fcm_tokens`** and `app_config`
5. **Remove the first overload of `record_sale`** (the one with the outstanding calculation bug)

### Phase 2 — Short-term (Week 1-2)
6. Convert 21 SECURITY DEFINER views to SECURITY INVOKER
7. Add explicit search_path to 70 functions
8. Drop unused indexes (177 candidates)
9. Add missing foreign key indexes (170 candidates)
10. Consolidate overlapping RLS policies (126 candidates)

### Phase 3 — Medium-term (Week 3-4)
11. Fix `auth_rls_initplan` in all RLS policies (replace `auth.uid()` with `(SELECT auth.uid())`)
12. Merge duplicate migration files
13. Create migration scripts for undocumented production tables
14. Drop `income` table if `income_entries` is the successor
15. Drop `audit_log` if `activity_logs` is the primary audit trail

### Phase 4 — Long-term
16. Add audit triggers to `stock_movements`
17. Build frontend for `purchase_orders`, `purchase_returns`, `balance_corrections`
18. Implement receivables aging dashboard
19. Monitor trigger performance under load; consider incremental balance updates

---

## 9. CONCLUSION

The system architecture is **well-thought-out** with proper separation of concerns:
- ✅ Sales → Transactions → Outstanding → Receivables cycle is complete
- ✅ Inventory → Stock Movements → Production → BOM cycle is complete
- ✅ Vendors → Purchases → Payments → Outstanding cycle is complete
- ✅ Workers → Attendance → Shift → Payroll cycle is complete
- ✅ Handovers → Staff Cash → Expense Claims → Holding Balance cycle is complete
- ✅ Orders → Fulfillment → Invoices → Proforma cycle is complete
- ✅ Offline queue for field operations
- ✅ Realtime sync for multi-device consistency
- ✅ Soft delete pattern across all tables
- ✅ Comprehensive audit trail

The **primary blocker** is the security posture — SECURITY DEFINER functions exposed to anonymous users makes the system vulnerable to complete data compromise regardless of business logic correctness.

Once security is fixed, the **second overload of `record_sale`** (with correct outstanding calculation) needs to be verified as the one the frontend actually calls.
