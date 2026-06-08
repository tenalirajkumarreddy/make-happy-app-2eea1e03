# Role Dashboards Design

**Date:** 2026-06-04
**Status:** Approved
**Applies to:** Web (React) + Mobile (Capacitor)

## Overview

Systematic pass across all six role dashboards to bring them to parity with the
operational needs of each role. Admin and manager get richer analytics, marketer
gets a full CRM view, operator is rebuilt from a 4-card POS screen into a
warehouse + production hub, agent stays as-is, customer stays as-is.

---

## 1. Super Admin Dashboard (web: `Dashboard.tsx` → `SuperAdminDashboard`)

### Keep (already in place)
- Today's sales, cash collected, UPI collected
- Active staff count, total customers, total stores, warehouses count
- Pending handover amount, low stock alerts
- Weekly sales bar chart, quick actions row

### Add — Operational Metrics (4 new StatCards row)
Insert after the existing stats rows. Query keys: `admin-op-metrics`.

| Metric | Source | Description |
|--------|--------|-------------|
| Order fulfillment rate | `orders` WHERE fulfilled_at IS NOT NULL / total | % of orders fulfilled on time |
| Collection efficiency | `transactions` sum / `sales` outstanding (period) | % of due collected |
| Staff performance rank | `sales` grouped by recorded_by + `profiles` | Top 3 staff by sales volume this month |
| Warehouse utilization | `product_stock` per warehouse vs capacity | % stock fill per warehouse |

### Add — Analytics Section (below alerts)
A new 2-column row with two cards:

**1. KPI Trend Card** (line chart, left side)
- Monthly sales (6-month rolling), monthly collections, monthly new customers
- Recharts `LineChart` with 3 series, toggleable legends

**2. Drill-down Metric Cards** (right side)
- Clicking any StatCard navigates to its detail page:
  - "Today's Sales" → `/sales`
  - "Staff" → `/staff-directory`
  - "Outstanding" → `/stores` with outstanding filter
- Wrap StatCard click handlers with `navigate()`

### Mobile (`AdminHome.tsx`)
Mirror the same enrichment: add operational metrics as stat cards and a trend
chart. Use the same query keys (already share supabase client).

---

## 2. Manager Dashboard (web: `Dashboard.tsx` → `ManagerDashboard`)

### Keep
- Today's sales (warehouse-scoped), cash, staff holdings, pending orders
- Sales-by-staff horizontal bar chart, pending handovers list
- Low stock alerts

### Add — Same Operational Metrics as Admin
Filter all queries by `warehouse_id`. Metrics:

| Metric | Source | Scoping |
|--------|--------|---------|
| Order fulfillment rate | `orders` WHERE warehouse_id | Warehouse |
| Collection efficiency | `transactions` + `sales` warehouse_id | Warehouse |
| Staff rank | `sales` + `profiles` warehouse_id | Warehouse staff |
| Warehouse utilization | `product_stock` WHERE warehouse_id | Single warehouse |

### Add — Analytics Section
Same KPI trend chart + drill-down cards as admin, but warehouse-scoped.

### Mobile
Shared `AdminHome.tsx` — ensure the component renders warehouse-scoped queries
when the current user's role is `manager`. Add a conditional branch.

---

## 3. Agent Dashboard (web: `AgentDashboard.tsx`)

**No changes.** Keep the two-tab layout:
- Tab 1: Sales Activity (stores covered, sales/collections, holding, handoverable,
  route session, pending orders)
- Tab 2: Stock Holdings (inventory list, stock value, pending requests, transfer
  history, transfer modal)

### Mobile (`AgentHome.tsx`)
No changes.

---

## 4. Marketer Dashboard (web: `MarketerDashboard.tsx`)

### Keep
- Active customers count, orders count, cash/UPI collected
- Handover status card, recent activity timeline
- Quick actions (Add Customer, Create Order, Record Payment, Review Handover)

### Rebuild to Full CRM View

**Stat Cards row** (expand from 4 to 6 cards):

| Card | Source |
|------|--------|
| Active Customers | `customers` WHERE created_by OR assigned routes |
| Total Orders | `orders` WHERE created_by |
| Pending Orders | orders WHERE status = pending |
| Cash Collected (today) | `transactions` WHERE recorded_by, today |
| UPI Collected (today) | Same as above |
| Collection Target % | Collected vs monthly target (from company_settings or hardcoded) |

**Row 2 — Order Pipeline** (new card replacing old quick actions grid)
- Pipeline visualization: Draft → Pending → Confirmed → Fulfilled
- Show count per stage, total order value bar
- Click any stage to navigate to `/orders` filtered by status

**Row 2 — Collection Performance** (new card, right column)
- Top 5 customers by outstanding (need attention)
- Aging buckets: 0-7d, 8-15d, 16-30d, 30d+
- Quick "Collect Payment" button per customer

**Row 3 — Follow-ups & Activity**
- Keep the recent activity timeline, but add:
- **Follow-up reminders**: customers with no order in 7+ days, flagged stores
- **Customer health**: stores with outstanding > credit limit, last visit date

**Row 4 — Handover Status**
- Keep existing handover card, add handover history mini-table

### Mobile (`MarketerHome.tsx`)
- Enrich current stats with same customer/order pipeline focus
- Replace bottom action row with quick CRM actions: Add Customer, Create Order,
  Record Payment, Collect Outstanding
- Add a "Needs Follow-up" section at top

---

## 5. Operator Dashboard (web: `PosDashboard.tsx`)

### Rebuild from Scratch

Current: 4 stat cards (sales, cash, UPI, pending handover).

New: **Warehouse + Production Hub**

**Query key pattern:** `operator-dashboard-{userId}-{warehouseId}`

#### Row 1 — Core Ops Stats (6 stats)

| Card | Source | Notes |
|------|--------|-------|
| POS Sales Today | `sales` WHERE recorded_by, today | Same as current |
| Cash Collected | sales.cash_amount today | Same as current |
| Stock Movements Today | `stock_movements` WHERE today, warehouse | Count of inbound + outbound |
| Purchases Today | `purchases` WHERE today | Count of purchase receipts |
| Pending Invoices | `invoices` WHERE status = draft/pending | Count |
| Workers Present | `attendance_entries` WHERE today AND present | Count |

#### Row 2 — Warehouse Ops (left) + Production (right)

**Left — Warehouse Operations card:**
- Recent stock movements table (last 5): product, qty, type (in/out), time
- Quick links: Record Stock Movement, New Purchase, View Inventory

**Right — Production card:**
- Today's production runs: product, qty produced, time
- Raw material low-stock alerts (top 5)
- Quick links: New Production, Raw Materials, Wastage Log

#### Row 3 — Attendance & POS Sales

**Left — Attendance card:**
- Worker attendance summary: present / absent / on leave
- Today's shift: start time, end time
- Quick links: Mark Attendance, View Attendance, Payroll

**Right — POS Sales Breakdown card:**
- Today's sales by payment method (cash vs UPI)
- Recent POS transactions (last 5)
- Quick link to POS register

### Mobile (`PosHome.tsx`)
- Rebuild bottom tabs if needed: Home | Inventory | Production | Attendance | History
- Home tab shows summary stats + recent ops
- Add production and attendance quick actions

---

## 6. Customer Portal (web: `CustomerPortal.tsx`)

**No changes.** Keep current layout: banners, stat cards (stores, outstanding,
pending orders), quick actions, stores table.

### Mobile (`CustomerHome.tsx`)
No changes.

---

## Cross-Cutting Concerns

### Query Co-location
Each dashboard's data-fetching logic lives inside its component file. No new
hooks needed unless a query is shared (consider extracting shared admin/manager
queries to `src/hooks/useDashboardQueries.ts` if repeated logic emerges).

### Loading & Error States
All dashboards already use `DashboardSkeleton`. Ensure the new operator and
marketer dashboards also handle empty states with the existing empty-state
patterns (`text-muted-foreground` centered text).

### Offline Awareness
Agent dashboard already has offline banners. Marketer and operator should also
get offline/pending-sync indicators — use the existing `useOnlineStatus` hook.

### Mobile Parity Matrix
| Role | Web file | Mobile file | Changes needed |
|------|----------|-------------|----------------|
| super_admin | `Dashboard.tsx` → SuperAdminDashboard | `AdminHome.tsx` | Enrichment |
| manager | `Dashboard.tsx` → ManagerDashboard | `AdminHome.tsx` | Enrichment + role fork |
| agent | `AgentDashboard.tsx` | `AgentHome.tsx` | None |
| marketer | `MarketerDashboard.tsx` | `MarketerHome.tsx` | Full rebuild |
| operator | `PosDashboard.tsx` | `PosHome.tsx` | Full rebuild |
| customer | `CustomerPortal.tsx` | `CustomerHome.tsx` | None |

### Data Freshness
Use existing `useRealtimeSync` patterns for invalidation. Add new query keys
to the invalidation map:
- `admin-op-metrics`
- `manager-op-metrics-{warehouseId}`
- `marketer-crm-{userId}`
- `operator-hub-{userId}-{warehouseId}`

### Route Guard Consistency
No route guard changes needed — existing `RoleGuard` arrays already handle all
roles. Operator/POS route at `/` is already dispatched by `RoleRoute`.

---

## Out of Scope

- Permission/role assignment UI changes
- Backend RPC changes (all queries use existing `supabase.from()` patterns)
- New database migrations (all data already exists in current schema)
- Mobile bottom tab reorganization for roles other than operator
