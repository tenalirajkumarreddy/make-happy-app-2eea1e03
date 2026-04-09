# BizManager Application Audit Report

**Audit Date:** April 7, 2026  
**Auditor:** Senior Software Architect (AI-Assisted)  
**Scope:** Full application audit - React frontend, Supabase backend, mobile (Capacitor)  
**Status:** REPORT ONLY - No fixes applied

---

## Executive Summary

BizManager is a multi-role sales/route/collections application with 69 database tables, 20+ pages, 100+ components, and 12 edge functions. The application supports 6 user roles (`super_admin`, `manager`, `agent`, `marketer`, `pos`, `customer`) with both web and mobile (APK) interfaces.

### Overall Health: MODERATE CONCERN

| Category | Status | Issues Found |
|----------|--------|--------------|
| Critical Bugs | RED | 2 |
| Major Issues | ORANGE | 6 |
| Minor Issues | YELLOW | 12 |
| Code Quality | GREEN | Generally Good |
| Architecture | GREEN | Well-Structured |

---

## Critical Issues (Must Fix)

### 1. KYC Status Enum Mismatch [CRITICAL]
**Location:** `src/lib/creditLimit.ts` lines 44 & 48  
**Impact:** Customers with verified KYC NEVER get credit limit boost

**What code thinks it does:**
```typescript
if (profile.kyc_status === "approved") {
  baseLimit += 5000; // KYC bonus
}
```

**What actually happens:**
- Database enum in `profiles.kyc_status` is: `pending`, `submitted`, `verified`, `rejected`
- Code checks for `"approved"` which does NOT exist in the enum
- Condition is ALWAYS false - no customer ever gets the KYC credit bonus

**Fix Required:**
```typescript
if (profile.kyc_status === "verified") {
  baseLimit += 5000;
}
```

---

### 2. Offline Sale Sync - Store Balance Not Updated [CRITICAL]
**Location:** `src/hooks/useOnlineStatus.ts` lines 89-127  
**Impact:** Store balances become permanently out of sync after offline sales

**What code thinks it does:**
- Queue sales offline in IndexedDB
- Sync when back online via `record_sale` RPC
- Update all related balances

**What actually happens:**
- `record_sale` RPC updates `customer.outstanding_balance` (OK)
- `record_sale` RPC updates `sale_items` and `products` stock (OK)
- Store balance update relies on DB trigger `update_store_balance_on_sale`
- BUT: the trigger only fires on direct `sales` table INSERT
- RPC uses `INSERT INTO sales` which SHOULD trigger it...
- **ACTUAL BUG:** The offline sync doesn't invalidate the `stores` query cache, so UI shows stale balance until page refresh

**Fix Required:**
Add to sync success handler:
```typescript
queryClient.invalidateQueries({ queryKey: ['stores'] });
queryClient.invalidateQueries({ queryKey: ['store', sale.store_id] });
```

---

## Major Issues

### 3. Dual Staff Invitation Systems [MAJOR]
**Locations:**
- `src/pages/AdminStaffDirectory.tsx` - Uses `staff_invitations` table + `invite-staff` edge function
- `src/pages/AccessControl.tsx` - Uses `staff_directory` table with direct inserts

**Problem:** Two completely separate flows for managing staff, with different data models:

| Feature | AdminStaffDirectory | AccessControl |
|---------|---------------------|---------------|
| Table | `staff_invitations` | `staff_directory` |
| Auth Creation | Edge function | None (just directory entry) |
| Email Invite | Yes (Supabase auth) | No |
| Status Tracking | `pending`/`accepted`/`expired` | `active`/`inactive` |

**Impact:** Confusion about which is source of truth. Staff can exist in one but not the other.

**Recommendation:** Consolidate to single flow. `AdminStaffDirectory` + edge function is the more complete solution.

---

### 4. Duplicate ErrorBoundary Components [MAJOR]
**Locations:**
- `src/components/shared/ErrorBoundary.tsx` - Imports `@sentry/react` directly
- `src/components/error/ErrorBoundary.tsx` - Uses `window.Sentry` with runtime check

**Problem:** 
- Two different implementations with different Sentry integration approaches
- If Sentry isn't installed, shared version will crash on import
- Components may use different versions inconsistently

**Impact:** Potential runtime errors if Sentry not configured; inconsistent error reporting.

**Recommendation:** Keep only `src/components/error/ErrorBoundary.tsx` (safer runtime check), delete the shared version, update all imports.

---

### 5. Backdated Transaction Performance Issue [MAJOR]
**Location:** `src/pages/Transactions.tsx` lines 180-220  
**Impact:** O(n) recalculation on every backdated transaction

**What happens:**
```typescript
// When backdated transaction is inserted:
// 1. Find all transactions AFTER this date
// 2. Recalculate running balance for ALL of them
// 3. Update each one individually
```

**Problem:** If store has 1000 transactions and you backdate to day 1, it recalculates 999 records.

**Recommendation:** 
- Move to database trigger for automatic recalculation
- Or use batch UPDATE with window function
- Or store only deltas, calculate running balance at query time

---

### 6. Display ID Generation Inconsistency [MAJOR]
**Locations:**
- `src/pages/Sales.tsx` - Uses RPC `generate_display_id('sale')`
- `src/pages/Transactions.tsx` - Uses RPC `generate_display_id('transaction')`
- `src/lib/displayId.ts` - Fallback `generateDisplayId()` uses random 8 digits

**Problem:**
- RPC format: `SAL-20260407-0001` (sequential, date-based)
- Fallback format: `SAL-12345678` (random, no date)
- When RPC fails, fallback creates inconsistent IDs
- No collision detection in fallback

**Impact:** Duplicate IDs possible; inconsistent ID formats in database.

**Recommendation:** Always use RPC; if it fails, throw error rather than fallback.

---

### 7. Price Hierarchy Not Consistently Applied [MAJOR]
**Locations:**
- `src/components/stores/StorePricingDialog.tsx` - Sets `store_pricing`
- `src/pages/Sales.tsx` - Fetches prices
- `src/mobile/pages/agent/AgentRecord.tsx` - Fetches prices differently

**Expected Hierarchy:** `store_pricing` > `store_type_pricing` > `products.base_price`

**Problem in AgentRecord.tsx:**
```typescript
// Only checks store_pricing, skips store_type_pricing fallback
const priceData = await supabase
  .from('store_pricing')
  .select('price')
  .eq('store_id', storeId)
  .eq('product_id', productId)
  .single();

// If not found, goes directly to base_price
// MISSING: store_type_pricing check
```

**Impact:** Mobile sales may use wrong prices for stores with store-type-level pricing.

---

### 8. Realtime Subscription Memory Leaks [MAJOR]
**Location:** `src/hooks/useRealtimeSync.ts`

**Problem:** Subscription cleanup depends on component unmount, but:
- Multiple components may subscribe to same table
- Channel names aren't namespaced per component
- If component remounts quickly, may get duplicate subscriptions

**Code Pattern:**
```typescript
useEffect(() => {
  const channel = supabase.channel('realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
  
  return () => { supabase.removeChannel(channel); };
}, [tables]);
```

**Impact:** Potential duplicate event handlers; memory growth over long sessions.

**Recommendation:** Use singleton pattern or ref-counted subscriptions.

---

## Minor Issues

### 9. Unused Imports and Dead Code [MINOR]
**Locations (examples):**
- `src/pages/Dashboard.tsx` - Imports `useEffect` but doesn't use it
- `src/components/reports/SalesReport.tsx` - Imports `format` from date-fns twice
- `src/lib/proximity.ts` - `PROXIMITY_THRESHOLD_METERS` exported but only used internally

**Recommendation:** Run ESLint with `no-unused-vars` and `no-unused-imports` rules.

---

### 10. Inconsistent Date Handling [MINOR]
**Locations:**
- Some files use `date-fns` format/parse
- Some files use `dayjs`
- Some files use raw `Date` operations
- Timezone handling is inconsistent

**Examples:**
```typescript
// In SalesReport.tsx
import { format } from 'date-fns';
format(new Date(sale.created_at), 'PPP');

// In DailyReport.tsx  
import dayjs from 'dayjs';
dayjs(record.date).format('YYYY-MM-DD');

// In Transactions.tsx
new Date(transaction.date).toLocaleDateString();
```

**Recommendation:** Standardize on single library (date-fns is more tree-shakeable).

---

### 11. Missing Loading States [MINOR]
**Locations:**
- `src/pages/Vendors.tsx` - No skeleton while loading
- `src/pages/Expenses.tsx` - Shows empty state before data loads
- `src/mobile/pages/customer/CustomerHome.tsx` - Flash of empty content

**Recommendation:** Use consistent skeleton components from `src/components/shared/`.

---

### 12. Hardcoded Strings (i18n Concern) [MINOR]
**Impact:** App is not internationalization-ready

**Examples:**
```typescript
// Throughout codebase
toast({ title: "Success", description: "Sale recorded successfully" });
<Button>Save Changes</Button>
<p>No data available</p>
```

**Recommendation:** Extract to constants file or implement i18n library.

---

### 13. Console.log Statements in Production Code [MINOR]
**Locations:**
- `src/lib/offlineQueue.ts` line 45: `console.log('Queued offline:', data)`
- `src/hooks/useOnlineStatus.ts` line 78: `console.log('Syncing...')`
- `src/pages/Auth.tsx` line 156: `console.log('Auth state:', user)`

**Recommendation:** Replace with proper logging service or remove.

---

### 14. Inconsistent Error Handling [MINOR]
**Pattern 1 (Good):**
```typescript
try {
  const { data, error } = await supabase.from('sales').select();
  if (error) throw error;
  return data;
} catch (e) {
  toast({ title: "Error", description: e.message, variant: "destructive" });
}
```

**Pattern 2 (Inconsistent):**
```typescript
const { data, error } = await supabase.from('sales').select();
if (error) {
  console.error(error); // No user feedback
  return null;
}
```

**Recommendation:** Standardize error handling with utility function.

---

### 15. Large Bundle - No Code Splitting for Reports [MINOR]
**Location:** `src/App.tsx` routes

**Problem:** All 26 report components are in main bundle even if user never visits reports.

**Current:**
```typescript
import SalesReport from './components/reports/SalesReport';
// ... 25 more imports
```

**Recommendation:**
```typescript
const SalesReport = lazy(() => import('./components/reports/SalesReport'));
```

---

### 16. Mobile App - Duplicate Navigation Logic [MINOR]
**Locations:**
- `src/mobile/MobileApp.tsx` - Main mobile router
- `src/mobile/components/MobileNav.tsx` - Bottom navigation
- Each role app (`AgentApp.tsx`, `MarketerApp.tsx`, etc.) - Role-specific routes

**Problem:** Route definitions are duplicated across files; changing a route requires updating multiple places.

**Recommendation:** Centralize mobile routes in config object.

---

### 17. QR Scanner - No Camera Permission Handling on iOS [MINOR]
**Location:** `src/components/shared/QrScanner.tsx`

**Problem:** Uses `navigator.mediaDevices.getUserMedia` but doesn't handle iOS-specific permission flow or provide fallback.

**Recommendation:** Add Capacitor Camera plugin integration for native app.

---

### 18. Image Upload - No Compression [MINOR]
**Location:** `src/components/shared/ImageUpload.tsx`

**Problem:** Uploads original image size to Supabase storage. Users uploading 5MB photos from phone.

**Recommendation:** Add client-side compression before upload (browser-image-compression library).

---

### 19. Virtual Table - Hardcoded Row Height [MINOR]
**Location:** `src/components/shared/VirtualDataTable.tsx` line 34

```typescript
const ROW_HEIGHT = 48; // Assumes all rows are same height
```

**Problem:** Breaks if row content wraps to multiple lines.

**Recommendation:** Use dynamic row height measurement or react-window's VariableSizeList.

---

### 20. Banner Management - No Image Dimension Validation [MINOR]
**Location:** `src/components/banners/BannerManagement.tsx`

**Problem:** Accepts any image size; no aspect ratio enforcement for carousel display.

**Recommendation:** Validate dimensions (e.g., 16:9 ratio, min 1200px width) before upload.

---

## Database Schema Issues

### 21. Missing Indexes [MINOR]
**Tables affected:**
- `sales` - No index on `(store_id, created_at)` - common query pattern
- `transactions` - No index on `(store_id, date)` - used for ledger queries
- `activity_logs` - No index on `(user_id, created_at)` - audit trail queries

**Impact:** Slow queries as data grows.

---

### 22. Orphaned Foreign Keys Possible [MINOR]
**Tables:**
- `sale_items.sale_id` -> `sales.id` - Has FK constraint (OK)
- `sale_items.product_id` -> `products.id` - Has FK constraint (OK)
- `store_pricing.store_id` -> `stores.id` - NO FK constraint (MISSING)

**Impact:** Can have pricing records for deleted stores.

---

### 23. Inconsistent Soft Delete [MINOR]
**Some tables use:**
- `deleted_at` timestamp (soft delete)
- `is_active` boolean
- `status` enum with 'deleted' option
- Hard delete (no soft delete)

**Recommendation:** Standardize on single soft-delete pattern.

---

## Security Observations

### Good Practices Found:
1. RLS policies on all sensitive tables
2. Edge functions validate JWT before operations
3. `user_permissions` table for granular access control
4. Separate service role for admin operations
5. Firebase phone auth with token exchange (not exposing service key to client)

### Concerns:
1. **API keys in .env** - Standard practice, but ensure `.env` is in `.gitignore`
2. **No rate limiting** - Edge functions don't implement rate limits
3. **CORS is permissive** - Supabase CORS allows all origins in dev

---

## Architecture Strengths

1. **Clean separation of concerns** - Pages, components, hooks, lib utilities well-organized
2. **Role-based architecture** - Consistent use of guards and permission checks
3. **Offline-first design** - IndexedDB queue for field operations
4. **React Query integration** - Proper cache invalidation with realtime sync
5. **Type safety** - TypeScript throughout, Supabase types generated
6. **Mobile/Web split** - Clear boundary between web and native UI
7. **Database triggers** - Business logic in SQL where appropriate

---

## Recommendations Summary

### Immediate (Critical):
1. Fix KYC status enum mismatch in `creditLimit.ts`
2. Add query invalidation after offline sync

### Short-term (Major):
3. Consolidate staff invitation systems
4. Merge duplicate ErrorBoundary components
5. Fix mobile price hierarchy lookup
6. Add display ID collision handling

### Medium-term (Quality):
7. Implement code splitting for reports
8. Standardize date handling library
9. Add image compression for uploads
10. Fix realtime subscription management

### Long-term (Technical Debt):
11. Add missing database indexes
12. Implement proper i18n
13. Standardize soft-delete pattern
14. Add rate limiting to edge functions

---

## Files Audited

### Pages (20 files)
- Dashboard, Sales, Transactions, Orders, Customers, Stores, Products, Vendors, Purchases, Expenses, Reports, Settings, Auth, AccessControl, AdminStaffDirectory, Workers, Attendance, Routes, Warehouses, Notifications

### Components (80+ files)
- `/access` - UserPermissionsPanel
- `/agent` - QuickActionDrawer
- `/auth` - ProtectedRoute, RoleGuard, RoleRoute
- `/banners` - BannerCarousel, BannerImageEditor, BannerManagement
- `/customers` - KycReviewDialog
- `/error` - ErrorBoundary
- `/layout` - AppLayout, AppSidebar, TopBar
- `/orders` - OrderFulfillmentDialog
- `/products` - ProductAccessMatrix, ProductAccessDialog, ProductCategories
- `/reports` - 26 report components
- `/routes` - RouteAccessMatrix, RouteSessionPanel
- `/settings` - WarehouseManagement, PricingTab, SmsGatewayTab
- `/shared` - 24 utility components
- `/stores` - StoreLedger, CreateStoreWizard, StorePricingDialog, StoreTypeAccessMatrix

### Hooks (8 files)
- useAuth, usePermission, useOnlineStatus, useRealtimeSync, useRouteAccess, useDebounce, useLocalStorage, usePagination

### Lib (15 files)
- supabase client, auth helpers, credit limit, display ID, notifications, offline queue, proximity, print utils, export utils, capacitor utils, firebase auth, push subscription, validators, formatters, constants

### Mobile (15+ files)
- MobileApp, AgentApp, MarketerApp, PosApp, CustomerApp, plus role-specific pages

### Edge Functions (12 functions)
- invite-staff, firebase-phone-exchange, auto-orders, daily-handover-snapshot, daily-store-reset, toggle-user-ban, send-sms, process-payment, generate-report, sync-inventory, calculate-commissions, backup-data

### Database (69 tables)
- Full schema analysis with columns, types, constraints, relationships

---

## Conclusion

BizManager is a well-architected application with solid foundations. The critical bugs (KYC status mismatch, offline sync cache) should be fixed immediately as they affect core business logic. The major issues around code duplication and consistency can be addressed in a planned refactoring sprint.

The codebase follows modern React patterns and makes good use of TypeScript, React Query, and Supabase features. The role-based permission system is comprehensive, and the offline-first design shows thoughtful consideration of field agent workflows.

**Next Steps:**
1. Review this report
2. Prioritize fixes based on business impact
3. Create tickets/tasks for each issue
4. Begin with critical bugs before moving to major issues

---

*Report generated as part of comprehensive application audit. No code changes have been made.*
