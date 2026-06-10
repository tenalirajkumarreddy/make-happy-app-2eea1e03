# Role × Page Audit — BizManager

**Date:** 2026-05-29
**Audience:** Release readiness
**Scope:** All web + mobile routes, guards, navigation visibility, data-level access, and parity gaps across 6 roles.

---

## 1. Role Definitions

| Role | Source | Staff? | Scoped? | Legacy Alias |
|------|--------|--------|---------|--------------|
| `super_admin` | `user_roles` | Yes | No (unrestricted) | `admin` |
| `manager` | `user_roles` | Yes | No (unrestricted) | — |
| `agent` | `user_roles` | Yes | Yes (route/store-type matrix) | — |
| `marketer` | `user_roles` | Yes | Yes (route/store-type matrix) | — |
| `operator` | `user_roles` | Yes | Yes (route/store-type matrix) | `pos` |
| `customer` | `customers` table | No | No (self-scoped to own data) | — |

**Staff count:** 5 roles · **Total:** 6 roles

---

## 2. Full Role × Route Matrix

### Legend
- `✓` = RoleGuard `allowed` includes this role
- `(✓)` = Inherited from parent route guard
- `—` = Not allowed (guarded out)
- `Nav` = Visible in sidebar/tabs
- `?` = Missing guard — route is open to all authenticated users

### 2.1 Web Routes

| Route | super_admin | manager | agent | marketer | operator | customer | Guard? | Web Nav | Mobile Nav |
|-------|:-----------:|:-------:|:-----:|:--------:|:--------:|:--------:|:------:|:-------:|:----------:|
| `/` (Dashboard) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | RoleRoute | super_admin, manager, agent, marketer, operator, customer | super_admin, manager |
| `/auth` | — | — | — | — | — | — | None (public) | — | — |
| `/onboarding` | — | — | — | — | — | — | None (public) | — | — |
| `/reset-password` | — | — | — | — | — | — | None (public) | — | — |
| `/products` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/vendors` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/vendors/:vendorId` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory/vendors` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory/vendors/:vendorId` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory/purchases` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/inventory/raw-materials` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory/boms` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/inventory/boms/:bomId` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/production` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/customers` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/customers/:id` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/stores` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/stores/:id` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/store-types` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/store-types/access` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/routes` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/routes/:id` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/sales` | ✓ | ✓ | ✓ | — | ✓ | — | RoleGuard | super_admin, manager, agent, operator | super_admin, manager |
| `/sale-returns` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/transactions` | ✓ | ✓ | ✓ | — | ✓ | — | RoleGuard | super_admin, manager, agent, operator | super_admin, manager |
| `/purchase-returns` | ✓ | ✓ | ✓ | — | — | — | RoleGuard | super_admin, manager, agent | super_admin, manager |
| `/purchases` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/stock-transfers` | ✓ | ✓ | ✓ | ✓ | ✓ | — | RoleGuard | super_admin, manager, agent, marketer, operator | super_admin, manager |
| `/vendor-payments` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/expenses` | ✓ | ✓ | ✓ | — | ✓ | — | RoleGuard | super_admin, manager, agent, operator | super_admin, manager |
| `/attendance` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/banners` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/invoices` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/invoices/new` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/invoices/:id` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | — | RoleGuard | super_admin, manager, agent, marketer, operator | super_admin, manager |
| `/handovers` | ✓ | ✓ | ✓ | — | ✓ | — | RoleGuard | super_admin, manager, agent, operator | super_admin, manager |
| `/reports` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/reports/:type` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/analytics` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/activity` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/access-control` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/staff` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/staff/:userId` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/staff/:userId/edit` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/income` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/settings` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | RoleGuard | All 6 | All 6 |
| `/map` | ✓ | ✓ | ✓ | ✓ | — | — | RoleGuard | super_admin, manager, agent, marketer | super_admin, manager |
| `/profile` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | RoleGuard | All 6 | All 6 |
| `/cost-insights` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |
| `/hr/staff` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/hr/roles` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/hr/payroll` | ✓ | ✓ | — | — | ✓ | — | RoleGuard | super_admin, manager, operator | super_admin, manager |
| `/hr/payrolls/:payrollId` | ✓ | ✓ | — | — | — | — | RoleGuard | super_admin, manager | super_admin, manager |

### 2.2 Admin Routes (nested under `/admin` — parent guard `super_admin` only)

| Route | super_admin | Guard? | Web Nav | Mobile Nav |
|-------|:-----------:|:------:|:-------:|:----------:|
| `/admin/staff` | (✓) | Inherited | super_admin | super_admin |
| `/admin/setup` | (✓) | Inherited | super_admin | super_admin |
| `/admin/expense-access` | (✓) | Inherited | super_admin | super_admin |
| `/admin/cost-history` | (✓) | Inherited | super_admin | super_admin |
| `/admin/vehicles` | (✓) | Inherited | super_admin | super_admin |
| `/admin/delivery-feasibility` | (✓) | Inherited | super_admin | super_admin |
| `/admin/production-log` | (✓) | Inherited | super_admin, manager | super_admin, manager |
| `/admin/settings` | (✓) | Inherited | super_admin | super_admin |
| `/admin/map` | (✓) | Inherited | super_admin | super_admin |

### 2.3 Customer Portal Routes (unguarded — ISSUE)

| Route | Guard? | In Nav? | Risk |
|-------|:------:|:-------:|:----:|
| `/portal/sales` | **None** | Customer sidebar | Any authenticated user |
| `/portal/orders` | **None** | Customer sidebar | Any authenticated user |
| `/portal/transactions` | **None** | Customer sidebar | Any authenticated user |
| `/portal/profile` | **None** | Customer sidebar | Any authenticated user |

### 2.4 Mobile Bottom-Nav Tabs (by role)

| Role | Tabs | Notes |
|------|------|-------|
| **Agent** | Home · Routes · Scan (center) · Stores · History | Native mobile pages |
| **Marketer** | Home · Orders · Record (center) · Stores · History | Shares AgentRecord/AgentHistory |
| **Customer** | Home · Sales · Order (center) · Ledger · Profile | Native mobile pages |
| **POS (operator)** | Home · Orders · Sale (center) · Handover · History | Shares AdminOrders/AgentRecord/AgentHistory |
| **Staff** (sup/mgr) | No bottom nav — hamburger sidebar | 6 native admin pages + MobilePageWrapper for rest |

---

## 3. Per-Role Page Inventory

### 3.1 `super_admin` — 58 web + 9 admin + mobile equivalent
Full unrestricted access to every route. Mobile via StaffApp hamburger menu.

**Exclusive admin pages** (no other role):
- `/admin/setup`, `/admin/cost-history`, `/admin/vehicles`, `/admin/delivery-feasibility`
- `/admin/staff`, `/admin/expense-access`, `/admin/map`, `/admin/settings`

### 3.2 `manager` — ~52 web routes (all except admin-exclusive)
Same as super_admin minus the `/admin/*` exclusive routes above. Mobile via StaffApp hamburger menu.

**Key differences from super_admin:**
- No ERP Setup, Cost History, Vehicles, Delivery Feasibility
- Missing `/admin/staff` web nav entry (but route allows it via RoleGuard — inconsistency)

### 3.3 `agent` — ~17 web routes + native mobile app
**Web:** Dashboard, Customers, CustomerDetail, Stores, StoreDetail, Routes, RouteDetail, Sales, SaleReturns, Transactions, PurchaseReturns, StockTransfers, Expenses, Orders, Handovers, Settings, Profile, Map

**Mobile tabs:** Home · Routes · Scan/Record · Stores · History
**Native mobile pages:** AgentHome, AgentRoutes, AgentScan, AgentRecord, AgentRecordPayment, AgentRecordSale, AgentHistory, AgentCustomers, AgentStoreProfile, AgentProducts, AddCustomerStore

**Data scope:** Restricted by `agent_routes` and `agent_store_types` matrix (deny-by-default).

### 3.4 `marketer` — ~8 web routes + native mobile app
**Web:** Dashboard, Orders, StockTransfers, Map, Settings, Profile

**Mobile tabs:** Home · Orders · Record · Stores · History
**Native mobile pages:** MarketerHome, MarketerOrders, MarketerStores, MarketerStoreProfile (shares AgentRecord, AgentHistory, AgentProducts)

**Data scope:** Restricted by `agent_routes`/`agent_store_types` matrix.

### 3.5 `operator` — ~20 web routes + native mobile app
**Web:** Dashboard, Inventory, Inventory/Vendors, Inventory/Purchases, Production, Sales, Transactions, Purchases, StockTransfers, Expenses, Attendance, Invoices, InvoiceForm, InvoiceView, Orders, Handovers, HR/Staff, HR/Roles, HR/Payroll, Settings, Profile

**Mobile tabs:** Home · Orders · Sale (center) · Handover · History
**Native mobile pages:** PosHome (only) — reuses AdminOrders, AgentRecord, AgentHistory, AgentProducts

**Data scope:** Restricted by `agent_routes`/`agent_store_types` matrix.

### 3.6 `customer` — ~6 web routes + native mobile app
**Web:** CustomerPortal (dashboard), Portal/Sales, Portal/Orders, Portal/Transactions, Portal/Profile, Settings, Profile

**Mobile tabs:** Home · Sales · Order (center) · Ledger · Profile
**Native mobile pages:** CustomerHome, CustomerKyc, CustomerSales, CustomerOrders, CustomerTransactions, CustomerProfile

**Auth flow:** Phone OTP-only. No password. Self-registration via OpenSMS.

---

## 4. Guard Consistency Audit

### 4.1 ISSUE: Missing RoleGuard on customer portal routes

**Location:** `src/App.tsx`, routes `/portal/sales`, `/portal/orders`, `/portal/transactions`, `/portal/profile`

**Impact:** Any authenticated staff user (or any role) can access these routes by URL. The `RoleRoute` at `/` forks customers to `CustomerPortal`, but direct navigation to `/portal/sales` bypasses the fork.

**Severity:** Medium (no sensitive write operations on portal pages, but data exposure risk — customer order/sale data might leak to staff via shared portal queries)

**Recommendation:** Add `RoleGuard allowed={["customer"]}` to all four portal routes.

### 4.2 ISSUE: Duplicate `/admin/staff` route (unguarded flat route)

**Location:** `src/App.tsx`, line 236 (flat) vs line 250 (nested under `/admin` guard)

**Impact:** Duplicate component registration. The flat route has no guard — accessible to any authenticated user. The nested version is correctly gated to `super_admin`.

**Severity:** Medium (duplicate registered — whichever loads first wins, but likely the nested guarded one since it's deeper in the tree)

**Recommendation:** Remove the flat unguarded `/admin/staff` route at line 236.

### 4.3 Navigation ≠ Route Guard Discrepancies

| Route | In Nav For | RoleGuard Allows | Issue |
|-------|-----------|:----------------:|:------|
| `/map` | operator (web sidebar `pos`) | agent, marketer, manager, super_admin (NOT operator) | Nav item visible for `pos` role but route blocked if role normalizes to `operator`. Since `pos`→`operator` is the runtime role, this nav item is dead UI for anyone whose DB role was originally `pos`. |
| `/admin/production-log` | manager (web sidebar nav) | Inherits super_admin-only from parent `/admin` | Nav shows for manager but route returns 403 in web (mobile StaffApp menu correctly includes it for manager). **Web manager nav/route mismatch.** |
| `/admin/map` | Not in any nav | Guarded super_admin only | Not exposed in nav — correct (intentionally hidden admin duplicate) |

### 4.4 Legacy Role Reference: `pos`

The sidebar `NAV_BY_ROLE` includes a `pos` entry, but the auth system normalizes `pos` → `operator`. The `pos` nav entry shows `/map` which the `operator` RouteGuard does NOT allow. This is inconsistent.

**Impact:** If a user's DB role is stored as `pos`, they see a `/map` nav item they can't access. If normalized to `operator`, they see the `operator` nav (which doesn't include `/map`).

### 4.5 `record_sale` permission gap

**Location:** `src/lib/permissions.ts`

The permission key `record_sale` is referenced in components (e.g., `AgentRecord.tsx`) but is **not defined** in `ALL_PERMISSION_KEYS`. It appears to be used inline rather than through the typed permission system.

**Recommendation:** Either add `record_sale` to `ALL_PERMISSION_KEYS` and `ROLE_DEFAULTS`, or migrate to the existing typed permission system.

---

## 5. Mobile vs Web Parity Analysis

| Page | Web | Mobile | Parity |
|------|:---:|:------:|:------:|
| Dashboard | Role-specific dashboards | AdminHome, AgentHome, MarketerHome, PosHome, CustomerHome | ✅ Native per role |
| Orders | Full CRUD with audit trail | AdminOrders (staff), MarketerOrders, AdminOrders (pos), CustomerOrders | ✅ Good |
| Sales | Sales page | AdminSales (staff), AgentRecord + AgentRecordSale (agent/pos), CustomerSales | ✅ Good |
| Transactions | Transactions page | AdminTransactions (staff), CustomerTransactions | ⚠️ Agent/Marketer/Pos use `AgentHistory` — different UX from web |
| Handovers | Handovers page | AdminHandovers (staff) with MobilePageWrapper; AgentHistory for agent/pos | ✅ Adequate |
| Customers | Customers + CustomerDetail | AgentCustomers, AgentStoreProfile | ✅ Good |
| Stores | Stores + StoreDetail | MarketerStores, MarketerStoreProfile, AgentCustomers/StoreProfile | ✅ Good |
| Routes | Routes + RouteDetail (web) | AgentRoutes (mobile-native) | ✅ Good |
| Products | Products page | AgentProducts (mobile-native) | ✅ Good |
| Scan | N/A (web doesn't scan) | AgentScan (barcode scanner) | ✅ Mobile-only feature |
| KYC | N/A | CustomerKyc (mobile-native) | ✅ Mobile-only feature |
| Profile/Settings | UserProfile + Settings | MobilePageWrapper(UserProfile) + MobilePageWrapper(Settings) | ✅ Good |
| Inventory | Inventory page | AdminInventory (mobile-native) | ✅ Good |
| Purchases | Purchases page | AdminPurchases (mobile-native) | ✅ Good |
| Reports | Reports + sub-reports | MobilePageWrapper(Reports) | ✅ Good |
| Map | MapPage | MobilePageWrapper(MapPage) | ✅ Good |
| Analytics | Analytics page | MobilePageWrapper(Analytics) | ✅ Good |
| Production | Production page | MobilePageWrapper(Production) | ✅ Good |

**Mobile gaps:**
1. `marketer` has no native marketer-specific dashboard (uses shared `MarketerHome`)
2. `operator` has minimal native mobile (`PosHome` only) — heavy reuse of agent/admin pages
3. No native **Reports** experience on mobile — wrapped web pages in cramped viewport

---

## 6. Permission/Data-Access Audit

### 6.1 Permission Matrix (37 keys, 8 categories)

| Category | Keys | Notes |
|----------|------|-------|
| **Orders** | view_orders, create_orders, modify_orders, modify_order_item_prices, transfer_orders, delete_orders, fulfill_orders, cancel_orders, view_assigned_orders, accept_order_transfers | Heaviest permission category — 10 keys |
| **Invoices** | view_invoices, create_invoices, edit_invoices, delete_invoices, download_invoices | 5 keys |
| **Sales & Pricing** | price_override, record_behalf, record_sale, create_sale_returns | record_sale not in ALL_PERMISSION_KEYS |
| **Handovers** | see_handover_balance, modify_handovers, cancel_any_handover, adjust_holding_balance | 4 keys |
| **Customers & Stores** | create_customers, create_stores, edit_balance, opening_balance, finalizer | 5 keys |
| **Vendors & Purchases** | view_vendors, manage_vendors, view_purchases, manage_purchases, view_vendor_payments, manage_vendor_payments | 6 keys |
| **Attendance** | view_attendance, manage_attendance | 2 keys |
| **Other** | submit_expenses, manage_expense_access, approve_expenses, view_raw_materials, manage_raw_materials | 5 keys |

### 6.2 `super_admin` bypass
Always returns `{ allowed: true }` for every permission — never hits the matrix.

### 6.3 Scoped role data access
- `agent`, `marketer`, `operator` are scoped via `agent_routes` and `agent_store_types` tables
- `manager` and `super_admin` are **unrestricted** (all routes/store-types accessible)
- `customer` is self-scoped by `customer_id` in queries (not via this hook)
- If a scoped role has **zero rows** in `agent_store_types`, ALL store-types are accessible (potential loophole)

### 6.4 Customer data isolation
Customer data access is enforced at the RLS/query level (assumes `customer_id` parameter is bound to the authenticated user's own `customers.id`). No route-level RoleGuard on portal pages means no defense-in-depth.

---

## 7. Summary of Issues & Recommendations

| # | Issue | Severity | Location | Fix |
|---|-------|:--------:|----------|-----|
| 1 | Portal routes missing RoleGuard | **Medium** | `src/App.tsx:232-243` | Add `allowed={["customer"]}` to 4 portal routes |
| 2 | Duplicate unguarded `/admin/staff` | **Medium** | `src/App.tsx:236` | Remove flat route (keep nested guarded one) |
| 3 | `pos` role in NAV_BY_ROLE references stale routes | **Low** | `AppSidebar.tsx` | Remove `pos` entry or align with `operator` normalized role |
| 4 | `/admin/production-log` in manager web nav but route blocked | **Low** | `AppSidebar.tsx` vs `App.tsx` | Either remove from manager nav or grant manager access at route level |
| 5 | `record_sale` not in typed permission system | **Low** | `src/lib/permissions.ts` | Add to `ALL_PERMISSION_KEYS` and `ROLE_DEFAULTS` |
| 6 | Scoped role with zero store-type rows gets unrestricted access | **Low** | `src/hooks/useRouteAccess.ts` | Consider explicit deny-by-default when rows exist vs zero ambiguity |
| 7 | No operator native mobile pages beyond PosHome | **Low** | `src/mobile/` | Consider: OperatorInventory, OperatorHandovers native pages |
| 8 | `customer` sees `/settings` and `/profile` in web RoleGuard — should these be staff-only? | **Info** | `App.tsx:204,216` | Confirm intent — customer has own portal profile route |
