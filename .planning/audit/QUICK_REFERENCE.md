# BizManager Quick Reference
## One-Page Cheat Sheet for Development & Testing

---

## 🎭 Role Quick Reference

| Role | Dashboard | Key Pages | Default Route |
|------|-----------|-----------|---------------|
| **super_admin** | Analytics | access-control, admin/staff, settings, all reports | `/analytics` |
| **manager** | Analytics | products, inventory, reports, handovers | `/analytics` |
| **agent** | AgentDashboard | routes, sales, customers, record (mobile) | `/` → dashboard |
| **marketer** | MarketerDashboard | orders, stores, customers | `/` → dashboard |
| **pos** | PosDashboard | sales (quick), handovers | `/` → dashboard |
| **customer** | CustomerPortal | portal/sales, portal/orders, portal/payments | `/portal/sales` |

---

## 🛣️ Route Patterns

```
Pattern          →  Component              →  Roles
─────────────────────────────────────────────────────────────────
/admin/*         →  Admin pages           →  super_admin only
/portal/*          →  Customer pages        →  customer only
/agent/* (mobile)  →  Mobile agent pages    →  agent (mobile)
/* (web)           →  Web pages             →  Varies by route
```

---

## 🔐 Permission Matrix (Simplified)

| Action | Super | Manager | Agent | Marketer | POS | Customer |
|--------|-------|---------|-------|----------|-----|----------|
| **View Sales** | All | Warehouse | Own | ❌ | Own | ❌ |
| **Record Sale** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **View Customers** | All | All | Assigned | Assigned | ❌ | Own |
| **Edit Store** | ✅ | ✅ | Limited | Limited | ❌ | ❌ |
| **Manage Staff** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Reports** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Process Returns** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manage Routes** | ✅ | ✅ | View Only | ❌ | ❌ | ❌ |
| **View Analytics** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 📁 Component Organization

```
src/
├── pages/                    # Web pages
│   ├── admin/               # Admin-specific
│   │   ├── AuditLogDashboard.tsx
│   │   └── ReconciliationDashboard.tsx
│   ├── [PageName].tsx       # Main pages
│   └── ...
├── mobile/
│   ├── pages/
│   │   ├── agent/          # Agent mobile pages
│   │   ├── pos/            # POS mobile pages
│   │   ├── marketer/       # Marketer mobile pages
│   │   ├── customer/       # Customer mobile pages
│   │   └── admin/          # Admin mobile pages
│   └── MobileApp.tsx       # Mobile router
├── components/
│   ├── shared/             # Shared components (Phase 4)
│   │   ├── SaleReceipt.tsx
│   │   ├── BulkActionToolbar.tsx
│   │   ├── ConflictResolver.tsx
│   │   ├── RouteOptimizer.tsx
│   │   ├── CurrencyDisplay.tsx
│   │   └── CurrencySelector.tsx
│   ├── sales/              # Sale-related
│   ├── customers/          # Customer-related
│   ├── stores/             # Store-related
│   ├── layout/             # Layout components
│   └── ui/                 # UI primitives (shadcn)
├── hooks/                  # Custom hooks
│   ├── useRouteSession.ts
│   ├── useBulkSelection.ts
│   ├── useOnlineStatus.ts
│   └── useRealtimeSync.ts
├── lib/                    # Utilities
│   ├── offlineQueue.ts
│   ├── bulkOperations.ts
│   ├── conflictResolver.ts
│   └── routeOptimization.ts
└── contexts/               # React contexts
    └── AuthContext.tsx
```

---

## 🗄️ Key Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **sales** | Sale records | id, store_id, total_amount, recorded_by, warehouse_id |
| **sale_items** | Line items | sale_id, product_id, quantity, unit_price, cost_price, profit |
| **stores** | Store data | id, name, outstanding, credit_limit, warehouse_id, lat, lng |
| **customers** | Customer profiles | id, phone, email, gst_number, outstanding |
| **products** | Product catalog | id, name, sku, price, category, is_active |
| **staff_stock** | Agent inventory | staff_id, product_id, quantity, warehouse_id |
| **stock_movements** | Stock history | product_id, quantity, movement_type, reference_id |
| **handovers** | Cash transfers | user_id, cash_amount, upi_amount, handed_to, status |
| **transactions** | Payments | store_id, customer_id, total_amount, payment_method |
| **routes** | Route definitions | id, name, agent_id, warehouse_id, is_active |
| **route_stores** | Route assignments | route_id, store_id, visit_order, is_visited |
| **route_sessions** | Daily route tracking | id, agent_id, date, optimized_order, status |
| **receipts** | Receipt storage | id, sale_id, receipt_number, receipt_data, pdf_url |
| **exchange_rates** | Currency rates | from_currency, to_currency, rate, effective_date |
| **bulk_operations** | Bulk job tracking | id, operation_type, status, record_count, performed_by |
| **audit_log** | Audit trail | table_name, record_id, action, old_values, new_values |
| **user_roles** | Role assignments | user_id, role, warehouse_id, is_active |

---

## 🔌 Key RPC Functions

| Function | Purpose | Called From |
|----------|---------|-------------|
| `record_sale()` | Atomic sale recording | Sales.tsx, AgentRecord.tsx |
| `check_stock_availability()` | Validate stock | Before sale submission |
| `create_handover()` | Server-side calculation | Handovers.tsx |
| `reconcile_outstanding()` | Data integrity check | Admin dashboard |
| `process_sale_return()` | Handle returns | SaleReturns.tsx |
| `create_stock_transfer()` | Transfer stock | Inventory.tsx |
| `optimize_route()` | Route optimization | RouteOptimizer.tsx |
| `bulk_update_prices()` | Bulk price update | BulkActionToolbar.tsx |
| `convert_currency()` | Currency conversion | CurrencyDisplay.tsx |
| `get_user_warehouses()` | Warehouse scoping | All warehouse-scoped queries |

---

## 🔔 Realtime Subscriptions

```typescript
// Active subscriptions by page
const subscriptions = {
  '/sales': ['sales', 'sale_items', 'staff_stock'],
  '/handovers': ['handovers', 'sales'],
  '/inventory': ['stock_movements', 'staff_stock'],
  '/routes': ['route_stores', 'location_pings'],
  '/customers': ['customers', 'stores'],
  '/admin/audit': ['audit_log'],
  '/receipts': ['receipts'],
};
```

---

## 🎨 Color Coding Guide

| State | Color | Usage |
|-------|-------|-------|
| Success | `green-500` | Completed, confirmed, paid |
| Warning | `yellow-500` | Pending, low stock, warning |
| Error | `red-500` | Failed, rejected, error |
| Info | `blue-500` | Active, in-progress, info |
| Neutral | `gray-500` | Default, disabled, archived |
| Primary | `brand-500` | Main actions, buttons |

---

## 📱 Mobile vs Web

| Feature | Web | Mobile |
|---------|-----|--------|
| Navigation | Sidebar + Topbar | Bottom Tabs |
| Sale Entry | Full form | Quick tap + Camera |
| Route View | Map + Table | GPS tracking |
| Stock Check | Table view | Quick lookup |
| Receipt | PDF download | Share sheet |
| Offline | ❌ | ✅ Queue |

---

## 🧪 Testing Checklist (Quick)

### Critical Paths
- [ ] Login with phone OTP
- [ ] Record sale (cash + UPI)
- [ ] View handover and confirm
- [ ] Check inventory updates
- [ ] Process sale return
- [ ] Generate and download receipt
- [ ] View customer ledger
- [ ] Optimize route
- [ ] Sync offline sale
- [ ] Resolve conflict

### Edge Cases
- [ ] Sale exceeding credit limit
- [ ] Sale with insufficient stock
- [ ] Duplicate handover prevention
- [ ] Offline queue sync failure
- [ ] Concurrent sale recording
- [ ] Currency conversion
- [ ] Bulk operation timeout

---

## 🚀 Deployment Checklist

```
Pre-Deploy
├── [ ] Run lint
├── [ ] Run tests
├── [ ] Apply migrations
├── [ ] Verify edge functions
├── [ ] Check environment variables
├── [ ] Review RLS policies
└── [ ] Test critical flows

Deploy
├── [ ] Deploy migrations
├── [ ] Deploy edge functions
├── [ ] Build frontend
├── [ ] Deploy to hosting
└── [ ] Verify health checks

Post-Deploy
├── [ ] Monitor error logs
├── [ ] Check analytics
├── [ ] Verify all pages load
└── [ ] Test core flows
```

---

## 🐛 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Warehouse not found" | Missing user_roles entry | Assign warehouse in staff directory |
| "Stock insufficient" | Negative stock | Check staff_stock allocation |
| "Duplicate handover" | Already created today | Delete existing or edit |
| "Receipt not generating" | Edge function failed | Check logs, retry |
| "Offline queue stuck" | Conflict detected | Open ConflictResolver |
| "Currency not converting" | Missing exchange rate | Add rate in settings |
| "Route not optimizing" | API key expired | Check Map API credentials |

---

## 📞 Support Escalation

| Level | Issue Type | Contact |
|-------|------------|---------|
| L1 | UI bugs, user errors | Support team |
| L2 | Data issues, permissions | Developers |
| L3 | Database corruption, security | Senior Dev + DBA |
| L4 | Infrastructure, outages | DevOps + Management |

---

## 📝 Documentation Links

| Document | Location | Purpose |
|----------|----------|---------|
| Full Audit | `PAGE_ACTIONS_AUDIT.md` | Complete page details |
| Test Checklist | `DETAILED_ACTIONS_CHECKLIST.md` | QA testing guide |
| Flow Diagrams | `PAGE_INTERACTION_FLOWS.md` | Visual data flows |
| Data Flow Audit | `DATA_FLOW_AUDIT.md` | Critical issues |
| Implementation | `PHASE*_IMPLEMENTATION_PLAN.md` | Phase details |

---

## 🎯 Success Metrics Dashboard

| Metric | Where to Check | Target |
|--------|---------------|--------|
| Daily Sales | `/analytics` | Monitor trend |
| Outstanding | `/customers` | < 10% overdue |
| Stock Accuracy | `/inventory` | 99.5% |
| Handover Reconciliation | `/handovers` | 100% match |
| Receipt Generation | `/receipts` | 100% |
| Offline Sync Success | IndexedDB stats | > 95% |
| Page Load Time | Performance API | < 2s |
| Error Rate | Console/Logs | < 1% |

---

**Print this page and keep it handy!**
*Last updated: 2026-04-12*
