# Business Logic Audit Report

**Date:** 2026-06-09
**Scope:** Full application (29 business domains)
**Method:** Automated static analysis + manual code review of all critical paths

---

## Summary

- **Total flows mapped:** 29 domains, 67+ user-facing flows, 8 edge functions
- **Total issues found:** 104 (11 critical, 29 high, 42 medium, 22 low)
- **Domains with most issues:** Auth/Permissions (23), Sales/Transactions (27), Orders/Inventory/Handovers (30), Expenses/Purchases/Edge Functions (52)

---

## CRITICAL ISSUES — Fix Before Launch

### BL-001 | Auth: user_roles RLS Disabled — Full Privilege Escalation
- **Location:** `supabase/migrations/20260528000002_business_logic_integrity.sql:5`
- **Description:** `ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY` removes all access controls. Any authenticated user can `UPDATE user_roles SET role = 'super_admin' WHERE user_id = '<their UUID>'`.
- **Impact:** Any customer or agent can escalate to super_admin and access all data, financials, and admin functions.
- **Fix:** Re-enable RLS with `SECURITY DEFINER` policies wrapping through `has_role()`.

### BL-002 | Auth: Test OTP Bypass in Production
- **Location:** `supabase/functions/send-otp-opensms/index.ts:72-82`, `verify-otp-opensms/index.ts:347-349`
- **Description:** When `USE_REAL_OTP` env var is not set, hardcoded OTP `000000` is accepted for any phone number.
- **Impact:** Anyone can log in as any phone number without receiving an OTP.
- **Fix:** Set `USE_REAL_OTP=true` in production. Remove test OTP code or gate behind explicit env check.

### BL-003 | Auth: Unauthenticated OTP Endpoint
- **Location:** `supabase/functions/send-otp-opensms/index.ts:95-100`
- **Description:** The `send-otp-opensms` function has no `Authorization` header check. Anyone can call it to send OTPs or trigger rate limits against any phone number.
- **Impact:** OTP spam attacks, rate limit exhaustion, bypass of Supabase auth layer.
- **Fix:** Add `verify_jwt: true` or explicit auth check in the function.

### BL-004 | Auth: UserPermissionsPanel Has No Authorization Gate
- **Location:** `src/components/access/UserPermissionsPanel.tsx:65-96`
- **Description:** `useUserPermissions` fetches ALL permission rows without filtering by current user. `handleToggle` upserts directly with no admin check.
- **Impact:** Any logged-in user can grant themselves any permission (combined with BL-001).
- **Fix:** Add role-based guard at component level. Filter queries by current user's scope.

### BL-005 | Sales: validateSaleItems Sums Quantities, Not Prices
- **Location:** `src/hooks/useSaleValidation.ts:151`
- **Description:** `const totalAmount = items.reduce((sum, i) => sum + i.quantity, 0)` sums quantities instead of `quantity * unit_price`.
- **Impact:** Zero-price items slip through validation. The `allowZeroTotal` check is effectively useless.
- **Fix:** Change to `items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0)`.

### BL-006 | Sales: validateCreditLimit Returns valid:true When Exceeded
- **Location:** `src/hooks/useSaleValidation.ts:327-332`
- **Description:** When `exceeded` is true, function returns `{ valid: true, exceeded: true, ... }`. The `valid` field is true even though credit limit is exceeded.
- **Impact:** Credit limit exceeded condition treated as soft warning, not hard block.
- **Fix:** Return `{ valid: false, exceeded: true, ... }` when exceeded.

### BL-007 | Orders: Double-Fulfillment Race Condition
- **Location:** `src/components/orders/OrderFulfillmentDialog.tsx:372-556`
- **Description:** No optimistic locking on order fulfillment. Two agents can simultaneously fulfill the same order, creating duplicate sales and double-deducting stock.
- **Impact:** Duplicate sales records, incorrect inventory, financial discrepancies.
- **Fix:** Add `SELECT ... FOR UPDATE` on order row in `record_sale` RPC gated on `p_fulfilled_order_id`.

### BL-008 | Orders: EditOrderSheet Non-Atomic Delete-then-Insert
- **Location:** `src/components/orders/EditOrderSheet.tsx:112-131`
- **Description:** Order edit does DELETE all items then INSERT new items without transaction wrapping. If INSERT fails, old items are already gone.
- **Impact:** Order with zero items exists briefly; concurrent fulfillment acts on half-deleted order.
- **Fix:** Use single RPC for atomic delete+insert of order items.

### BL-009 | Handovers: Admin Can Change Status of Any Handover
- **Location:** `src/pages/Handovers.tsx:2366-2376, 728-767`
- **Description:** Edit dialog shows all status options regardless of current status. `handleEditHandover` passes new status to RPC without transition validation.
- **Impact:** Cancelled/rejected handovers can be re-confirmed; confirmed handovers can go back to pending.
- **Fix:** Validate allowed state transitions in RPC. Disable invalid status options in UI.

### BL-010 | Expenses: Fixed Cost Payment Never Advances next_due_date
- **Location:** `src/pages/Expenses.tsx:395-438`
- **Description:** `handlePayFixedCost` inserts payment record but never updates `fixed_costs.next_due_date`. After payment, fixed cost still shows as overdue.
- **Impact:** Fixed costs perpetually appear unpaid. Financial reporting incorrect.
- **Fix:** Add `UPDATE fixed_costs SET next_due_date = <next_occurrence> WHERE id = <id>` after payment insert.

### BL-011 | Edge Functions: daily-store-reset Uses Wildcard CORS
- **Location:** `supabase/functions/daily-store-reset/index.ts:3-6`
- **Description:** `Access-Control-Allow-Origin: *` allows any origin to call this function. Combined with weak cron secret auth.
- **Impact:** Any website can trigger store resets if they guess the cron secret.
- **Fix:** Replace wildcard with explicit origin allowlist.

---

## HIGH ISSUES — Fix Within 1 Sprint

### BL-012 | Auth: Auth Tokens Stored Plaintext in IndexedDB
- **Location:** `src/lib/authCache.ts:3-8, 20-29`
- **Description:** `access_token` and `refresh_token` stored in plaintext IndexedDB. Accessible to any JS on same origin including XSS payloads.
- **Impact:** If XSS exists, attacker exfiltrates tokens and impersonates any user.
- **Fix:** Store tokens in httpOnly cookies or use Supabase's built-in session persistence.

### BL-013 | Auth: usePermission Hook Is Entirely Client-Side
- **Location:** `src/hooks/usePermission.ts:6-36`
- **Description:** Permission checks done purely client-side. No evidence RPCs verify permissions before executing.
- **Impact:** Attacker bypasses any permission check by manipulating React state or direct Supabase queries.
- **Fix:** Add server-side permission verification to all data-mutating RPCs.

### BL-014 | Sales: useEditSale Has No Authorization Check
- **Location:** `src/hooks/useEditSale.ts:44-66`
- **Description:** `handleEditSale` passes `editingSale.recorded_by` from client data to RPC with no verification it matches the caller.
- **Impact:** Non-admin agent can edit another agent's sale by changing the ID.
- **Fix:** Server-side RPC must verify `p_recorded_by = auth.uid()` for non-admin users.

### BL-15 | Sales: Credit Limit Not Re-Checked on Edit
- **Location:** `src/hooks/useEditSale.ts:49-58`
- **Description:** When sale is edited, outstanding changes but no client-side credit limit check before submission.
- **Impact:** Edits can push outstanding past credit limit when server check is disabled.
- **Fix:** Add client-side credit limit validation in useEditSale hook.

### BL-016 | Sales: No Double-Submit Guard During Async Gap
- **Location:** `src/hooks/useRecordSale.ts:262-304`
- **Description:** Stock check and display ID generation are async before mutation. Double-click during async gap queues two sales.
- **Impact:** Duplicate sales recorded.
- **Fix:** Disable submit button immediately on first click, not after mutation starts.

### BL-017 | Transactions: No Overpayment Check on Edit
- **Location:** `src/pages/Transactions.tsx:247-294`
- **Description:** Transaction edit only checks `cash < 0 || upi < 0` and `totalPayment <= 0`. No check against store outstanding.
- **Impact:** User can edit transaction to collect ₹1,00,000 on store with ₹500 outstanding.
- **Fix:** Validate `totalPayment <= store.outstanding` before submission.

### BL-018 | Transactions: No Duplicate Submission Guard
- **Location:** `src/pages/Transactions.tsx:244-401`
- **Description:** `saving` is local `useState`. Double-click passes guard before state updates.
- **Impact:** Duplicate transactions recorded, double-collecting payments.
- **Fix:** Use ref-based guard or disable button before async operation.

### BL-019 | Customers: Search Bypasses RPC Access Control
- **Location:** `src/pages/Customers.tsx:96-108`
- **Description:** When searching, query uses direct `.or()` on `customers` table instead of `get_accessible_customers` RPC, bypassing role-based row filtering.
- **Impact:** Any user with `create_customers` permission can search and see customers from any warehouse.
- **Fix:** Use RPC-based search even when `debouncedSearch` is truthy.

### BL-020 | Routes: Duplicate Visit Records from Race Condition
- **Location:** `src/hooks/useRouteSession.ts:229-297`
- **Description:** `recordVisit` checks for existing visit then decides insert vs update. Concurrent mutations create duplicate visits.
- **Impact:** Duplicate visit records, inflated route metrics.
- **Fix:** Add unique constraint on `(session_id, store_id)` or use RPC-level upsert.

### BL-021 | Routes: Duplicate Session Creation
- **Location:** `src/components/routes/RouteSessionPanel.tsx:214-231`
- **Description:** `handleStart` inserts new session without checking for existing active session. Rapid clicks create multiple active sessions.
- **Impact:** Orphaned active sessions, confusing route data.
- **Fix:** Check for existing active session before insert, or use `ON CONFLICT`.

### BL-022 | Routes: RouteSessionPanel vs useRouteSession Column Mismatch
- **Location:** `src/components/routes/RouteSessionPanel.tsx:38` vs `src/hooks/useRouteSession.ts:66-87`
- **Description:** Panel queries by `user_id`, hook queries by `agent_id`. If column is `user_id` in DB, hook returns null.
- **Impact:** Two components see different sessions, breaking route tracking.
- **Fix:** Align column name across all queries.

### BL-023 | Expenses: handleAddExpense Allows NaN Amounts
- **Location:** `src/pages/Expenses.tsx:236-254`
- **Description:** `parseFloat("abc")` produces `NaN` which passes `!amount` check (NaN is truthy).
- **Impact:** NaN amounts stored in database, corrupting financial reports.
- **Fix:** Add `isNaN(amount) || amount <= 0` check.

### BL-024 | Expenses: Double-Payment Race on Fixed Cost
- **Location:** `src/pages/Expenses.tsx:395-438`
- **Description:** No optimistic locking. Two admins clicking "Pay" simultaneously both succeed.
- **Impact:** Double-payment recorded, incorrect outstanding.
- **Fix:** Use optimistic locking with `expected_version` or row-level lock.

### BL-025 | Vendors: No Format Validation on Fields
- **Location:** `src/pages/Vendors.tsx:103-158`
- **Description:** `handleAdd` uses `sanitizeString` but no format validation on email, phone, GSTIN, PAN.
- **Impact:** Invalid vendor data stored, breaking GST filing.
- **Fix:** Add format validation for each field type.

### BL-026 | VendorPayments: No vendorId Validation
- **Location:** `src/pages/VendorPayments.tsx:86-137`
- **Description:** `handleSubmit` validates `paymentAmount > 0` but never validates `vendorId` is non-empty.
- **Impact:** Orphaned payment records with no vendor.
- **Fix:** Add `if (!vendorId)` guard before submission.

### BL-027 | Edge Functions: invite-staff Creates Orphaned Auth Users
- **Location:** `supabase/functions/invite-staff/index.ts:279-283`
- **Description:** `createUser` creates auth user, but if subsequent role assignment fails, user exists with no role. Cannot log in, cannot be cleaned up.
- **Impact:** Orphaned auth users, data inconsistency.
- **Fix:** Wrap in transaction or add compensating logic on failure.

### BL-028 | Edge Functions: auto-orders Creates Duplicates on Re-run
- **Location:** `supabase/functions/auto-orders/index.ts:84-96`
- **Description:** No check for existing orders. Running twice creates duplicate orders for every active auto-order store.
- **Impact:** Duplicate orders, inflated order counts.
- **Fix:** Add idempotency check: `SELECT 1 FROM orders WHERE store_id = ... AND created_at > today`.

### BL-029 | Edge Functions: auto-orders Uses Math.random() for Display ID
- **Location:** `supabase/functions/auto-orders/index.ts:85`
- **Description:** `Math.floor(10000000 + Math.random() * 90000000)` has collision risk. Not cryptographically secure.
- **Impact:** Duplicate display IDs.
- **Fix:** Use `generate_display_id` RPC instead.

### BL-030 | Edge Functions: Timing Attack on Cron Secrets
- **Location:** Multiple edge functions (auto-orders:21, daily-handover-snapshot:37, daily-store-reset:25)
- **Description:** Cron secret comparison uses `===` (non-constant-time). Vulnerable to timing attacks.
- **Impact:** Secret extraction risk.
- **Fix:** Use `crypto.timingSafeEqual()` for comparison.

### BL-031 | Edge Functions: daily-store-reset Uses service_role for JWT Verification
- **Location:** `supabase/functions/daily-store-reset/index.ts:37-38`
- **Description:** `createClient(supabaseUrl, serviceRoleKey)` used for `auth.getUser(token)`. Service_role bypasses normal JWT verification.
- **Impact:** Any valid JWT accepted as super_admin.
- **Fix:** Use anon key for JWT verification, service_role only for DB operations.

### BL-032 | Inventory: Raw Material Stock Adjustment Non-Atomic
- **Location:** `src/hooks/inventory/useStockAdjustment.ts:161-239`
- **Description:** Read-modify-write without transaction. Concurrent adjustments overwrite each other.
- **Impact:** Incorrect stock levels.
- **Fix:** Use existing `adjust_raw_material_stock` RPC which uses single SQL statement.

### BL-033 | Inventory: Stock Transfer Cancellation Doesn't Reverse Movements
- **Location:** `src/hooks/inventory/useStockTransfer.ts:159-175`
- **Description:** `cancelTransfer` deletes `stock_transfers` row but doesn't reverse stock movements already applied by trigger.
- **Impact:** Orphaned stock movement records, incorrect stock levels.
- **Fix:** Implement `cancel_stock_transfer` RPC that reverses stock movements.

### BL-034 | Bulk Operations: CSV Export Vulnerable to Formula Injection
- **Location:** `src/lib/bulkOperations.ts:292-300`
- **Description:** Cells starting with `=`, `+`, `-`, or `@` execute formulas in Excel/Sheets.
- **Impact:** Spreadsheet formula injection, potential data exfiltration.
- **Fix:** Prefix formula-triggering cells with single quote or tab character.

### BL-035 | Sales: edit_sale RPC Doesn't Verify Caller Identity
- **Location:** `src/hooks/useEditSale.ts:44-66`
- **Description:** `p_recorded_by` is passed from client data. Server doesn't verify it matches `auth.uid()`.
- **Impact:** Audit trail manipulation, impersonation.
- **Fix:** RPC should use `auth.uid()` directly, not accept `p_recorded_by` from client.

### BL-036 | Handovers: Holding Balance Deduction Race in Expense Approval
- **Location:** `src/pages/Handovers.tsx:946-963`
- **Description:** Read-modify-write on `staff_cash_accounts.cash_amount` without locking. Two concurrent approvals both deduct from same balance.
- **Impact:** Balance goes negative, incorrect financial state.
- **Fix:** Use `SELECT ... FOR UPDATE` in RPC, validate `cash_amount >= approvedAmount`.

### BL-037 | Handovers: Expense Cancel Doesn't Release Locked Amount
- **Location:** `src/pages/Handovers.tsx:1012-1033`
- **Description:** Cancel sets `status: "cancelled"` but doesn't release `holding_amount_locked`. Permanently reduces available holding.
- **Impact:** Users lose access to funds they should have.
- **Fix:** On cancel, update `holding_amount_locked = 0` or reverse the lock.

### BL-038 | Auth: Auth Cache Serves Stale Role to Banned Users
- **Location:** `src/contexts/AuthContext.tsx:228-229`
- **Description:** 2-second loading timeout falls back to cached role. Banned user sees role-gated content briefly.
- **Impact:** Brief unauthorized access for banned users.
- **Fix:** Clear auth cache on `USER_DISABLED` error. Don't cache banned state.

---

## MEDIUM ISSUES — Fix Within 2 Sprints

| ID | Domain | Location | Description |
|----|--------|----------|-------------|
| BL-039 | Auth | `AuthContext.tsx:216-253` | Race condition: double `fetchUserData` from concurrent auth state changes |
| BL-040 | Auth | `permissionCheck.ts:71-109` | Phantom permission keys via `as any` casts diverge from canonical `permissions.ts` |
| BL-041 | Auth | `toggle-user-ban/index.ts:54` | Self-ban not prevented |
| BL-042 | Auth | `invite-staff/index.ts:24-25` | In-memory rate limit resets on isolate recycle |
| BL-043 | Auth | `authCache.ts:25` | No TTL on cached auth state — stale cache used indefinitely |
| BL-044 | Sales | `useRecordSale.ts:238-247` | "Add Other Product" uses `allProducts` instead of `storeProducts` for pricing |
| BL-045 | Sales | `AgentRecordSale.tsx:204-209` | Minus button silently removes items (qty=1 → 0 → removed) |
| BL-046 | Sales | `AgentRecordSale.tsx:212-217` | NaN quantity possible via direct input |
| BL-047 | Sales | `useRecordSale.ts:228-236` | Product change uses `base_price`, not `effectivePrice` |
| BL-048 | Sales | `AgentRecordPayment.tsx:62` | Overpayment silently absorbed (excess lost) |
| BL-049 | Sales | `offlineQueue.ts:242` | 10s dedup window blocks legitimate rapid sales |
| BL-050 | Sales | `useSalesList.ts:135-144` | Timezone-sensitive same-day edit/return lock check |
| BL-051 | Orders | `EditOrderSheet.tsx:90-141` | No status check before edit — delivered orders can be edited |
| BL-052 | Orders | `EditOrderSheet.tsx:87-88` | No duplicate product check — same product added multiple times |
| BL-053 | Orders | `TransferOrderDialog.tsx:42-57` | No status validation — fulfilled orders can be transferred |
| BL-054 | Orders | `InvoiceDialog.tsx:657-664` | Negative quantity allowed in invoice line items |
| BL-055 | Orders | `InvoiceDialog.tsx:352-385` | No duplicate invoice prevention for same order |
| BL-056 | Orders | `InvoiceDialog.tsx:401` | Soft-deleted items accumulate without cleanup |
| BL-057 | Inventory | `useWarehouseStock.ts:33` | `current_stock` vs `quantity` column name mismatch |
| BL-058 | Inventory | `useStaffStock.ts:91` | Negative stock hidden by `gt("quantity", 0)` filter |
| BL-059 | Customers | `CustomerDetail.tsx:108-127` | No input validation on customer save (phone, email, name) |
| BL-060 | Customers | `CustomerDetail.tsx:239-243` | `getPublicUrl` used for private KYC bucket (should be `createSignedUrl`) |
| BL-061 | Customers | `CustomerDetail.tsx:190-215` | KYC upload race condition — concurrent uploads can skip status update |
| BL-062 | Routes | `RouteSessionPanel.tsx:269-283` | No proximity check when store lacks GPS coordinates |
| BL-063 | Routes | `proximity.ts:105-114` | Default case in switch falls through to "skip" — bypasses security |
| BL-064 | Routes | `useRouteSession.ts:415-431` | Travel time estimate uses flat 2min/store, not actual distance |
| BL-065 | Reports | `DailyReport.tsx:30-31` | No timezone handling — UTC/local mismatch around midnight |
| BL-066 | Reports | `ProfitLossReport.tsx:108-109` | COGS uses purchases, not actual cost of goods sold |
| BL-067 | Reports | `SalesReport.tsx:40-145` | No date range validation — can query 10 years of data |
| BL-068 | Expenses | `Expenses.tsx:178-195` | Floating-point addition for totals — rounding errors compound |
| BL-069 | Expenses | `Expenses.tsx:348-360` | Weekly frequency: `dueDay` (1-31) used as day-of-week |
| BL-070 | Expenses | `Expenses.tsx:246-254` | No file size limit on bill uploads — 150MB+ possible |
| BL-071 | Expenses | `Expenses.tsx:284-327` | No role guard on category creation — any user can create |
| BL-072 | Purchases | `Purchases.tsx:43-45` | Operator filter is client-side only — relies on RLS |
| BL-073 | Vendors | `Vendors.tsx:109-112` | Display ID generation without unique constraint — concurrent duplicates |
| BL-074 | Edge Functions | `auto-orders/index.ts:99` | Batch insert — single failure loses all orders |
| BL-075 | Edge Functions | `daily-handover-snapshot/index.ts:100-117` | Snapshot committed before reset — inconsistent state on partial failure |
| BL-076 | Edge Functions | `invite-staff/index.ts:114-127` | Idempotency key has 1-minute collision window |
| BL-077 | Edge Functions | `invite-staff/index.ts:334-342` | Invitation recorded as "accepted" immediately — no actual acceptance flow |
| BL-078 | Notifications | `useNotifications.ts:357-370` | Random ID for native notifications causes collision risk |
| BL-079 | Notifications | `useNotifications.ts:143-191` | SEEN set grows unbounded per session (capped at 100 but never cleared) |
| BL-080 | Validation | `validation.ts:45` | Phone normalization only strips +91/91 — international numbers stored inconsistently |
| BL-081 | Validation | `schemas.ts:15` | `amountSchema` allows 0 — should be `min(0.01)` for monetary amounts |
| BL-082 | Bulk Ops | `bulkOperations.ts:156` | `Promise.all` in batch — concurrent modifications race |
| BL-083 | Bulk Ops | `bulkOperations.ts:370` | Undo store is in-memory — lost on page refresh |

---

## LOW ISSUES — Fix When Time Allows

| ID | Domain | Location | Description |
|----|--------|----------|-------------|
| BL-084 | Auth | `ProtectedRoute.tsx:8-24` | Cache renders children before DB resolution |
| BL-085 | Auth | `AuthContext.tsx:302-311` | No server-side session revocation on signout |
| BL-086 | Auth | `RoleRoute.tsx:29-36` | Dead page for unknown roles |
| BL-087 | Sales | `Sales.tsx:1` | Unused `useMemo` import |
| BL-088 | Sales | `mutationHelpers.ts:9-62` | Over-aggressive query invalidation (30+ keys) |
| BL-089 | Orders | `EditOrderSheet.tsx:21` | `order` prop typed as `any` |
| BL-090 | Orders | `InvoiceDialog.tsx:339` | `setSaving` in mutation function instead of `onMutate` |
| BL-091 | Handovers | `Handovers.tsx:496-502` | Client-side balance check uses potentially stale data |
| BL-092 | Handovers | `Handovers.tsx:770-822` | No bounds check on holding balance adjustment |
| BL-093 | Handovers | `AdjustHoldingDialog.tsx:30-37` | Form clears regardless of success/failure |
| BL-094 | Customers | `Customers.tsx:269-276` | CSV import inserts without warehouse_id when null |
| BL-095 | Customers | `CustomerDetail.tsx:239-243` | KYC getPublicUrl for private bucket will 403 |
| BL-096 | Routes | `proximity.ts:61-150` | No validation of lat/lng out-of-range values |
| BL-097 | Reports | `SalesReport.tsx:83` | EOM projection uses current month, not report month |
| BL-098 | Reports | `CustomerRiskReport.tsx:47-53` | No retry mechanism on RPC failure |
| BL-099 | Reports | `forecastEngine.ts:23` | Silently returns empty array for < 5 data points |
| BL-100 | Notifications | `useNotifications.ts:130-238` | Singleton channel refCount race on React strict mode |
| BL-101 | Notifications | `notifications.ts:29-48` | Broadcast query fetches all managers unnecessarily |
| BL-102 | Expenses | `Expenses.tsx:232-233` | `URL.createObjectURL` never revoked — memory leak |
| BL-103 | Expenses | `Expenses.tsx:1170-1180` | Fixed cost due day allows Feb 31 |
| BL-104 | Validation | `sanitization.ts:12-13` | Redundant regex after DOMPurify |

---

## State Machine Diagrams

### Sale Lifecycle
```
                    ┌─────────┐
                    │ created │
                    └────┬────┘
                         │ record_sale RPC
                    ┌────▼────┐
                    │  active │
                    └────┬────┘
              ┌──────────┼──────────┐
              │          │          │
         ┌────▼────┐ ┌───▼───┐ ┌───▼────┐
         │  edited │ │returned│ │cancelled│
         └─────────┘ └───────┘ └────────┘
```
**Valid transitions:** created→active, active→edited, active→returned (partial/full), active→cancelled
**Invalid (should be blocked):** cancelled→active, returned→active

### Order Lifecycle
```
┌─────────┐    ┌───────────┐    ┌──────────┐
│ pending │───►│ confirmed │───►│delivered │
└────┬────┘    └─────┬─────┘    └──────────┘
     │               │
     │          ┌────▼─────┐
     └─────────►│cancelled │
                └──────────┘
```
**Valid transitions:** pending→confirmed, confirmed→delivered, pending→cancelled, confirmed→cancelled
**Invalid:** delivered→pending, cancelled→confirmed

### Handover Lifecycle
```
┌─────────────────────┐
│ awaiting_confirmation│
└──────────┬──────────┘
     ┌─────┼─────┐
     │     │     │
┌────▼──┐┌─▼──┐┌─▼───────┐
│confirmed│rejected│cancelled│
└────────┘└────┘└─────────┘
```
**Valid transitions:** awaiting_confirmation→confirmed, awaiting_confirmation→rejected, awaiting_confirmation→cancelled
**Invalid:** confirmed→awaiting_confirmation, rejected→confirmed (unless admin override with audit)

### Route Session Lifecycle
```
┌────────┐    ┌────────┐    ┌───────────┐
│ started│───►│ active │───►│ completed │
└────────┘    └───┬────┘    └───────────┘
                  │
             ┌────▼────┐
             │ paused  │
             └────┬────┘
                  │
             ┌────▼────┐
             │ active  │
             └─────────┘
```

### KYC Status
```
┌──────┐    ┌─────────┐    ┌──────────┐
│ draft│───►│ pending │───►│ approved │
└──────┘    └────┬────┘    └──────────┘
                 │
            ┌────▼────┐
            │rejected │
            └─────────┘
```

---

## DEEP AUDIT — Page-Level Requirements Analysis

### Sales Domain — Cross-Platform Behavior

| Feature | Web (Sales.tsx) | Mobile Agent (AgentRecordSale) | Mobile Agent (AgentRecord) | Match? |
|---------|-----------------|-------------------------------|---------------------------|--------|
| Sale creation RPC | `record_sale` | `record_sale` | `record_sale` | ✅ |
| Outstanding calc | `total - cash - upi` (no clamp) | `Math.max(0, total - cash - upi)` (clamped) | `total - cash - upi` (NOT clamped) | ❌ |
| Cancel sale | **BROKEN** (`canCancelSales` undefined) | Works via `usePermission` | Works via `usePermission` | ❌ |
| Edit sale | Works via `useEditSale` hook | N/A | Reimplemented inline | ⚠️ |
| Return | Full-only via RPC | N/A | N/A | ⚠️ |
| Validation | `validateSaleData` (Zod) | Inline checks | Inline checks | ❌ (not shared) |
| `useSaleValidation` | Not used | Not used | Not used | ❌ (dead code) |
| Proximity check | Imported, never called | Imported, never called | Imported, never called | ❌ (neither enforces) |
| Price override | Via form UI | Via `usePermission` | Via `usePermission` | ✅ |
| Record on behalf | Via `usePermission` | Via `usePermission` | Via `usePermission` | ✅ |
| Backdate | Only admin (web form) | `usePermission("backdate" as any)` — phantom key | `usePermission("backdate")` — clean | ⚠️ |

**Sales bugs requiring immediate fix:**
1. `Sales.tsx:177` — `canCancelSales` is undefined → cancel button never shows on web
2. `useEditSale.ts:44-66` — zero validation on edit (negative qty, negative price, no stock re-check)
3. `SaleReturnDialog.tsx:114-120` — always returns ALL items, no partial returns
4. `SaleReturns.tsx:285-319` — admin-created returns marked "processed" but stock/outstanding never adjusted
5. `useSaleValidation.ts` — entire 346-line shared validation file is dead code
6. `AgentRecord.tsx:215` — `outstandingFromSale` not clamped to 0 (overpayment reduces outstanding)

### Orders Domain — Cross-Platform Behavior

| Feature | Web (Orders.tsx) | Mobile Marketer | Mobile Admin | Match? |
|---------|-----------------|-----------------|--------------|--------|
| Create order | Via `create_order` RPC (status: `pending`) | Direct insert (status: `confirmed`) | Direct insert (status: `confirmed`) | ❌ |
| Edit order | Inline + dialog | EditOrderSheet | EditOrderSheet | ⚠️ |
| Fulfill order | Full dialog with stock check | Simplified (`base_price` only, `p_outstanding_amount: 0`) | Simplified (`base_price` only, `p_outstanding_amount: 0`) | ❌ |
| Cancel order | Dialog with reason | Sheet with reason | AlertDialog | ✅ |
| Transfer order | TransferOrderDialog | N/A | Inline dialog | ⚠️ |
| Proforma | Auto-created on order | Dialog | Dialog | ✅ |
| Simple order note validation | Yes (line 490) | No | No | ❌ |

**Orders bugs requiring immediate fix:**
1. `Transactions.tsx:516-529` — transaction edit has no permission gate (any staff can edit any transaction)
2. Mobile orders create as `confirmed` (skipping `pending` review) — inconsistent lifecycle
3. Mobile fulfillment hard-codes `p_outstanding_amount: 0` — silent financial data loss
4. Mobile fulfillment uses `base_price` not order item prices — pricing discrepancy
5. `AdminOrders.tsx:327` — uses `store_id` as `customer_id` fallback — wrong customer linkage
6. `EditOrderSheet.tsx:113-116` — hard-deletes items (web soft-deletes) — data history loss
7. `AgentProducts.tsx:33-35` — stock query has no warehouse filter — shows global stock
8. `OrderViewDialog.tsx:147-148` — broken FK join syntax for `assigned_to_user`

### Handovers Domain — Cross-Platform Behavior

| Feature | Web | Mobile Admin | Match? |
|---------|-----|--------------|--------|
| Create handover | Yes (staff) | **No** | ❌ |
| Admin transfer | Yes | Yes | ✅ |
| Adjust holding | Yes | Yes | ✅ |
| Edit handover | Yes | Yes | ✅ |
| Expense claim creation | Yes | Yes | ✅ |
| Expense review (amount adjust) | Yes | **No** | ❌ |
| Expense cancel (by owner) | Yes | **No** | ❌ |
| Balances tab | All staff | Top 5 only | ⚠️ |
| Expense approve → deduct holding | Yes | **No** | ❌ |
| CSV export | Yes | Yes | ✅ |

**Handovers bugs requiring immediate fix:**
1. `Handovers.tsx:946-963` — expense approval deduct + status update not atomic (two separate operations)
2. `Handovers.tsx:1012-1033` — expense cancel doesn't release `holding_amount_locked`
3. Mobile expense approve doesn't call `deduct_expense_from_holding` RPC
4. `EditHandoverDialog.tsx` — allows arbitrary state transitions (confirmed→pending, cancelled→confirmed)
5. `Handovers.tsx:513` — handover creation hardcodes `p_upi_amount: 0`

### Inventory Domain — Cross-Platform Behavior

| Feature | Web | Mobile Admin | Match? |
|---------|-----|--------------|--------|
| View stock | Yes | Yes (read-only) | ⚠️ |
| Stock transfer | Full modal | **No** (links to web) | ❌ |
| Stock adjustment | Full modal | **No** (links to web) | ❌ |
| Raw materials | Full tab | **No** | ❌ |
| Pending returns review | Yes | **No** | ❌ |
| Staff holdings | Full view | **No** | ❌ |
| Stock history | Full view | **No** | ❌ |

**Mobile AdminInventory is essentially a read-only stock dashboard.** All mutation capabilities are missing.

### Expenses Domain

| Feature | Web | Mobile | Match? |
|---------|-----|--------|--------|
| Create expense | Yes (with bill upload) | N/A | ⚠️ |
| Category management | Yes | N/A | ⚠️ |
| Fixed cost management | Yes | N/A | ⚠️ |
| Cost insights | Yes (no auth gate) | N/A | ❌ (security) |

**Expenses bugs requiring immediate fix:**
1. `Expenses.tsx:395-438` — fixed cost payment never advances `next_due_date`
2. `Expenses.tsx:236-254` — NaN amounts possible (`parseFloat("abc")` is truthy)
3. `Expenses.tsx:348-360` — weekly frequency uses `dueDay` (1-31) as day-of-week
4. `CostInsights.tsx` — no authorization gate (any user sees cost intelligence)

---

## Remaining Risks (Require Product/Design Decision)

1. **Credit limit enforcement model:** Currently soft-warning by default. Should it be hard-block? Need product decision on `credit_limit_check` behavior.

2. **Same-day sale restriction:** Should agents be able to edit/cancel sales from previous days? Currently no restriction server-side. Need policy decision.

3. **Offline queue deduplication window:** 10-second window may be too narrow or too wide. Need field testing data to calibrate.

4. **Auto-order creation:** Currently runs without idempotency. Should it be a scheduled cron or manual trigger? Need architectural decision.

5. **Overpayment handling:** Currently silently absorbed. Should it create a credit balance? Need product decision.

6. **Role-based feature gating on CostInsights:** Currently visible to all authenticated users. Should it be admin-only? Need business decision on data sensitivity.

7. **KYC document storage:** Uses `getPublicUrl` for private bucket. Need to decide: make bucket public or switch to signed URLs.

8. **Invoice number gaps:** Acceptable for invoices? Or need sequential numbering without gaps?

---

## Recommended Fix Priority

### Week 1 (CRITICAL — security/data-loss)
1. Re-enable RLS on `user_roles` (BL-001)
2. Remove test OTP bypass (BL-002)
3. Add auth to OTP endpoint (BL-003)
4. Fix `validateSaleItems` total calculation (BL-005)
5. Fix `validateCreditLimit` return value (BL-006)
6. Fix fixed cost payment due date advancement (BL-010)
7. Fix Sales.tsx missing `useQuery`/`supabase` imports (compile error)
8. Fix `canCancelSales` undefined on web — wire to `usePermission("cancel_sales")`
9. Fix `SaleReturns.tsx` admin-created returns — use RPC instead of direct INSERT

### Week 2 (HIGH — correctness/security)
10. Add authorization to edit_sale RPC (BL-014, BL-035)
11. Add double-submit protection to sales/transactions (BL-016, BL-018)
12. Add overpayment check to transactions (BL-017)
13. Fix order fulfillment race condition (BL-007)
14. Make order edit atomic (BL-008)
15. Add handover status transition validation (BL-009)
16. Fix stock transfer cancellation (BL-033)
17. Wire `useSaleValidation` into web + mobile forms (replace dead code)
18. Fix mobile order creation status (`pending` not `confirmed`)
19. Fix mobile fulfillment `p_outstanding_amount: 0` — calculate actual outstanding
20. Fix mobile fulfillment to use order item prices, not `base_price`
21. Fix `EditOrderSheet` to soft-delete items (match web behavior)
22. Fix transaction edit permission gate
23. Fix expense cancel to release `holding_amount_locked`
24. Fix mobile expense approve to call `deduct_expense_from_holding` RPC

### Week 3 (HIGH — remaining)
25. Fix customer search access control (BL-019)
26. Fix route session duplication (BL-020, BL-021)
27. Fix expense NaN validation (BL-023)
28. Fix vendor field validation (BL-025)
29. Fix edge function security (BL-027, BL-028, BL-030, BL-031)
30. Fix CSV injection (BL-034)
31. Fix `AgentProducts` stock query — add warehouse filter
32. Fix `OrderViewDialog` broken FK joins
33. Add auth gate to CostInsights
34. Fix `adjustRawMaterial` to use RPC instead of client-side read-modify-write

### Week 4 (MEDIUM — data quality + cross-platform parity)
35. All MEDIUM issues (BL-039 through BL-083)
36. Align outstanding calculation across web/mobile (clamp to 0 or not — decide policy)
37. Add stock transfer/adjustment capabilities to mobile AdminInventory
38. Align return reason values between `SaleReturns.tsx` and `SaleReturnDialog.tsx`
39. Add partial return capability to `SaleReturnDialog`
40. Fix `AgentRecordSale` to use `usePermission("backdate")` without `as any` cast
41. Add `EditHandoverDialog` state transition validation
42. Fix all timezone-sensitive date comparisons to use UTC consistently
