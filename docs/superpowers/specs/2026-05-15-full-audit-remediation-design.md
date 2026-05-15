# BizManager Full Audit Remediation Design

**Date:** 2026-05-15
**Status:** Ready for Implementation
**Scope:** Code quality, performance, architecture, security, and testing

---

## Context

BizManager is a multi-role sales/route/collections app (React + Supabase + Capacitor). A comprehensive audit found 4 CRITICAL, 10 HIGH, and 20+ MEDIUM issues. The user is in dev phase — test OTP bypass is kept, no production risk. All changes must preserve existing authorized user access.

---

## Phase 1 — Type Safety & Code Quality

### 1.1 Generate Supabase Types
- Run `npx supabase gen types typescript --linked` to replace manually stubbed `src/integrations/supabase/types.ts`
- Update type casts throughout codebase — currently 980 `any` usages across 134 files
- Remove `(supabase as any).rpc(...)` patterns in AuthContext.tsx and useOnlineStatus.ts

### 1.2 Remove Dead Code
- Delete `old_auth.tsx` and `old_auth_main.tsx` from project root
- Remove unused `firebase` client dependency from package.json (if confirmed unused in src/)
- Move `@types/leaflet` from dependencies to devDependencies
- Delete placeholder `src/test/example.test.ts`

### 1.3 Standardize Error Handling
- Wire up existing `src/lib/logger.ts` — replace 24 unguarded `console.log` calls with `logDebug`/`logInfo`/`logError`
- Replace 30 `catch(err: any)` blocks with typed `catch(err: unknown)` and proper narrowing
- Fix silently swallowed errors in `src/pages/Income.tsx:172-175`, `src/pages/Production.tsx:52-54`, `src/pages/admin/DeliveryFeasibility.tsx:169-170`

### 1.4 Standardize Date Handling
- Remove raw `new Date()` arithmetic in `src/hooks/useSaleValidation.ts:65-68` — use date-fns `subDays()`
- Replace `new Date().toLocaleDateString()` with date-fns `format()` in `src/components/hr/role-columns.tsx:35`

---

## Phase 2 — Performance

### 2.1 Lazy-Load Reports & Dashboards
- `src/pages/Reports.tsx`: convert all 22 static report imports to `lazy(() => import(...))` pattern
- `src/App.tsx`: lazy-load AgentDashboard, MarketerDashboard, PosDashboard, CustomerPortal

### 2.2 Fix React Query Anti-Patterns
- `src/pages/Transactions.tsx:232-235`: remove forced `invalidateQueries` on mount
- `src/components/reports/DailyReport.tsx` and `SalesReport.tsx`: add `staleTime: 5 * 60_000` to report queries
- Create a shared `useProfiles` hook with `staleTime: Infinity` for name resolution (used in Sales.tsx, Transactions.tsx)

### 2.3 Fix Component Re-Render Issues
- Extract `StoreHoverCard` and `CustomerHoverCard` from `src/pages/Sales.tsx:828-955` to module scope
- Extract `StoreHoverCard` from `src/pages/Transactions.tsx:422-457` to module scope
- Wrap column definition arrays in `useMemo` in Sales.tsx (lines 957-1070) and Transactions.tsx (lines 375-477)

### 2.4 Add Image Compression
- Install `browser-image-compression`
- Update `src/components/shared/ImageUpload.tsx` to compress before upload (target ~500KB)

### 2.5 Fix Pagination
- Switch Sales.tsx and Transactions.tsx from range-based "load more" (`query.range(0, loadedPages * PAGE_SIZE)`) to `useInfiniteQuery` with `getNextPageParam` (as Customers.tsx already does correctly)

---

## Phase 3 — Architecture Cleanup

### 3.1 Break Up Large Components
- `src/components/orders/InvoiceDialog.tsx` (890 lines) — extract invoice line items table, payment summary, print view into sub-components
- `src/components/orders/OrderFulfillmentDialog.tsx` (882 lines) — extract fulfillment steps, stock check, transfer logic into sub-components
- Target: no component file over 400 lines

### 3.2 Extract Expense-Manager Shared Logic
- Move bill-upload (base64 decode + storage upload) into `supabase/functions/_shared/billUpload.ts`
- Split `supabase/functions/expense-manager/index.ts` (957 lines) into focused functions or at minimum extract the shared patterns

### 3.3 Standardize Soft-Delete
- Pick `deleted_at` as the single pattern for `customers`, `sales`, `transactions`, `profiles`, `stores`
- Where `is_active` boolean overlaps with `deleted_at` (e.g., `warehouses`, `staff_directory`), keep `is_active` only for "disabled" semantics (not deletion), ensure `deleted_at` is the deletion marker
- Update all queries to use `deleted_at IS NULL` consistently — no query should check only `is_active`
- Activate soft-delete RLS policies currently commented out in `20260508000002`

### 3.4 Deduplicate Mobile Business Logic
- Extract shared sale recording logic (SaleItem interface, price resolution, credit limit check, payment splitting) from `src/pages/Sales.tsx` and `src/mobile/pages/agent/AgentRecord.tsx` into `src/lib/saleLogic.ts`
- Both web and mobile import from the same shared module

---

## Phase 4 — Security Hardening (Preserving Dev Access)

### 4.1 Re-Enable RLS on user_roles
- Write migration: `ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY`
- Policies: users read own roles, super_admin read/write all, service_role bypass
- Verify `has_role()` SECURITY DEFINER function works without recursion

### 4.2 Fix CORS on Auth Endpoints
- Replace `Access-Control-Allow-Origin: *` in `verify-otp-opensms/index.ts` with shared `getCorsHeaders()`
- Same for `generate-receipt-pdf/index.ts` — add JWT verification
- Standardize all edge functions to use `_shared/cors.ts`

### 4.3 Add OTP Attempt Limiting
- In `verify-otp-opensms/index.ts`: increment `session.attempts`, reject after 5 failures

### 4.4 Remove Error Info Leaks
- Remove `error.stack` from response bodies in `send-otp-opensms` and `expense-manager`

### 4.5 Audit SECURITY DEFINER Functions
- Review all SECURITY DEFINER functions across migrations
- For each: verify it calls `has_role()` or checks `auth.uid()` before mutating data
- For `adjust_staff_holding_balance`: validate that `p_admin_id` matches calling user's auth UID
- Remove SECURITY DEFINER from functions that only read data (use RLS instead)

### 4.6 Clean Committed Secrets
- Clean `.env.example` — remove real Clerk credentials, use placeholder values only
- Verify `.env` is in `.gitignore` (already present)
- Note: actual API key rotation is a manual step in Supabase/Firebase dashboards — this task covers removing exposed values from tracked files only

---

## Phase 5 — Testing

### 5.1 Core Business Logic Tests
- Sales creation flow: credit limits, payment splitting, offline queue
- Transaction recording and running balance calculation
- Inventory stock transfers
- Permission checks and role guards

### 5.2 Integration Hooks
- Test `useRealtimeSync` query invalidation
- Test `useOnlineStatus` sync queue processing

---

## Non-Goals (Deferred)
- Internationalization (i18n)
- Mobile navigation centralization
- Virtual table dynamic row heights
- Banner image dimension validation

---

## Acceptance Criteria
- [ ] Supabase types generated and `any` usage reduced to <50 occurrences
- [ ] No component files over 400 lines (except auto-generated UI components)
- [ ] All console.log replaced with logger.ts or removed
- [ ] Reports page initial bundle reduced by >60%
- [ ] Soft-delete uses single `deleted_at` pattern everywhere
- [ ] Mobile and web share sale logic from common module
- [ ] All SECURITY DEFINER functions have explicit permission checks
- [ ] All edge functions use shared CORS handler
- [ ] New tests cover Sales, Transactions, and Inventory
- [ ] All existing tests still pass
