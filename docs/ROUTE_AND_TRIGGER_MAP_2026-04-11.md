# Route + Trigger Map (Audit Deliverable)

**Last updated:** 2026-04-11

This document maps:
1) Frontend routes (what loads where, and who can access)
2) Core backend triggers/RPCs that enforce balances, credit limits, IDs, and OTP

---

## 1) Frontend Route Map

Source of truth: [src/App.tsx](../src/App.tsx)

### Public (no auth)

| Path | Page |
|---|---|
| `/auth` | Auth (OTP + staff login) |
| `/onboarding` | Onboarding |
| `/reset-password` | ResetPassword |

### Protected (requires signed-in)

All protected routes render under the standard layout: [src/components/layout/AppLayout.tsx](../src/components/layout/AppLayout.tsx)

#### Root dashboard router

`/` renders a role-based dashboard fork via `RoleRoute`:
- staff → `Dashboard`
- customer → `CustomerPortal`
- agent → `AgentDashboard`
- marketer → `MarketerDashboard`
- pos → `PosDashboard`

#### Admin & Manager only

| Path | Allowed roles | Page |
|---|---|---|
| `/products` | super_admin, manager | Products |
| `/inventory` | super_admin, manager | Inventory |
| `/vendors` | super_admin, manager | Vendors |
| `/vendors/:id` | super_admin, manager | VendorDetail |
| `/purchases` | super_admin, manager | Purchases |
| `/vendor-payments` | super_admin, manager | VendorPayments |
| `/raw-materials` | super_admin, manager | RawMaterials |
| `/invoices` | super_admin, manager | Invoices |
| `/invoices/new` | super_admin, manager | InvoiceForm |
| `/invoices/:id` | super_admin, manager | InvoiceView |
| `/invoices/:id/print` | super_admin, manager | InvoiceView |
| `/attendance` | super_admin, manager | Attendance |
| `/expenses` | super_admin, manager | Expenses |
| `/banners` | super_admin, manager | Banners |
| `/analytics` | super_admin, manager | Analytics |
| `/reports` | super_admin, manager | Reports |
| `/reports/:type` | super_admin, manager | Reports |
| `/activity` | super_admin, manager | Activity |
| `/settings` | super_admin, manager | Settings |
| `/map` | super_admin, manager | MapPage |

#### Super admin only

| Path | Allowed roles | Page |
|---|---|---|
| `/access-control` | super_admin | AccessControl |
| `/admin/staff` | super_admin | AdminStaffDirectory |

#### Shared staff routes

| Path | Allowed roles | Page |
|---|---|---|
| `/customers` | super_admin, manager, agent, marketer | Customers |
| `/customers/:id` | super_admin, manager, agent, marketer | CustomerDetail |
| `/stores` | super_admin, manager, agent, marketer | Stores |
| `/stores/:id` | super_admin, manager, agent, marketer | StoreDetail |
| `/store-types` | super_admin, manager | StoreTypes |
| `/store-types/access` | super_admin, manager | StoreTypeAccess |
| `/routes` | super_admin, manager, agent | Routes |
| `/routes/:id` | super_admin, manager, agent | RouteDetail |
| `/sales` | super_admin, manager, agent, pos | Sales |
| `/sale-returns` | super_admin, manager | SaleReturns |
| `/transactions` | super_admin, manager, agent, marketer | Transactions |
| `/purchase-returns` | super_admin, manager | PurchaseReturns |
| `/orders` | super_admin, manager, agent, marketer | Orders |
| `/handovers` | super_admin, manager, agent, marketer, pos | Handovers |
| `/profile` | all authenticated | UserProfile |

#### Customer portal routes

| Path | Allowed roles | Page |
|---|---|---|
| `/portal/sales` | customer | CustomerSales |
| `/portal/orders` | customer | CustomerOrders |
| `/portal/transactions` | customer | CustomerTransactions |
| `/portal/profile` | customer | CustomerProfile |

---

## 2) Backend Trigger + RPC Map

### 2.1 Outstanding balance correctness (stores)

**Source:** [supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql](../supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql)

**Trigger:** `trg_sales_recalc_outstanding` on `public.sales`
- Fires `AFTER INSERT OR UPDATE OR DELETE`
- Calls `public.recalc_store_outstanding()`

**Trigger:** `trg_transactions_recalc_outstanding` on `public.transactions`
- Fires `AFTER INSERT OR UPDATE OR DELETE`
- Calls `public.recalc_store_outstanding()`

**Function:** `public.recalc_store_outstanding()`
- Recomputes `stores.outstanding` from first principles:
  - opening_balance
  - + sum(sales.outstanding_amount)
  - - sum(transactions.total_amount)
- Eliminates client-side delta race conditions.

### 2.2 Sale creation (atomic + credit limit enforcement)

**Source (latest):** [supabase/migrations/20260411000004_record_sale_kyc_verified_fix.sql](../supabase/migrations/20260411000004_record_sale_kyc_verified_fix.sql)

**RPC:** `public.record_sale(...)`
- Locks the store row with `SELECT ... FOR UPDATE` to serialize concurrent sales.
- Computes outstanding delta server-side: `total - cash - upi`.
- Resolves credit limit:
  - customer override (if set) wins
  - else store-type limit using KYC status
- Enforces credit limit for non-admin callers; admins/managers can override.
- Inserts into `sales` + `sale_items` in one transaction.
- Marks pending orders for the store as delivered.
- For backdated inserts (`p_created_at` passed), calls `public.recalc_running_balances(store_id)` to rebuild historical old/new snapshots.

**Helper:** `public.recalc_running_balances(p_store_id uuid)`
- Defined in [supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql](../supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql)

### 2.3 Display ID generation (sequential, concurrency-safe)

**Source:** [supabase/migrations/20260411000003_display_id_generator.sql](../supabase/migrations/20260411000003_display_id_generator.sql)

**Table:** `public.display_id_counters(prefix, day, last_value, updated_at)`

**RPCs:**
- `public.generate_display_id(prefix text)`
- `public.generate_display_id(prefix text, seq_name text)` (backwards-compat param)

**Format:** `PREFIX-YYYYMMDD-0001`

### 2.4 OpenSMS OTP flow

**OTP sessions table:** [supabase/migrations/20260324000006_opensms_otp_sessions.sql](../supabase/migrations/20260324000006_opensms_otp_sessions.sql)

**Hardened RLS:** [supabase/migrations/20260411000001_harden_otp_sessions_rls.sql](../supabase/migrations/20260411000001_harden_otp_sessions_rls.sql)
- Removes anon full-access policy.
- Revokes direct table privileges from `anon`/`authenticated`.
- Edge Functions continue to operate with service-role key.

**SMS job queue + rate limit table:** [supabase/migrations/20260411000002_opensms_sms_jobs_and_rate_limits.sql](../supabase/migrations/20260411000002_opensms_sms_jobs_and_rate_limits.sql)
- `public.sms_jobs` (gateway polls/selects pending/processing; updates status)
- `public.otp_rate_limits` (service-role only; reserved for stricter limiting)

**Edge Functions:**
- Send OTP: [supabase/functions/send-otp-opensms/index.ts](../supabase/functions/send-otp-opensms/index.ts)
- Verify OTP: [supabase/functions/verify-otp-opensms/index.ts](../supabase/functions/verify-otp-opensms/index.ts)
- Shared CORS helper: [supabase/functions/_shared/cors.ts](../supabase/functions/_shared/cors.ts)

Key enforcement in verify:
- Reject already-verified sessions
- Reject expired sessions
- Enforce `max_attempts` and increment `attempts` on wrong OTP

---

## 3) Parity + Reliability Notes (What Was Fixed)

- Env misconfig now shows a clear startup screen instead of a blank page: [src/main.tsx](../src/main.tsx) + [src/lib/env.ts](../src/lib/env.ts)
- Offline sync now invalidates relevant query domains after success: [src/hooks/useOnlineStatus.ts](../src/hooks/useOnlineStatus.ts)
- KYC UI now treats legacy `approved` as `verified` consistently: [src/pages/Customers.tsx](../src/pages/Customers.tsx) and related components/pages
- Sales store selection now enforces route/store-type matrix restrictions for scoped roles: [src/pages/Sales.tsx](../src/pages/Sales.tsx) + [src/hooks/useRouteAccess.ts](../src/hooks/useRouteAccess.ts)
