# NEWZ Business Flow Audit Report

## Executive Summary

This document audits the business flows in the NEWZ application against the database schema to identify inconsistencies, gaps, and optimization opportunities.

---

## CORE BUSINESS DOMAINS

### 1. SALES & DISTRIBUTION
**Database Tables:**
- `sales` - Core sales transactions
- `sale_items` - Line items per sale
- `sale_returns` - Returned items
- `sale_return_items` - Return line items

**Flow:** Sales Agent → Record Sale → Inventory Deducted → Customer Outstanding Updated → Cash Handover

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| sales.created_by → auth.users | ✅ Fixed | FK now points to auth.users |
| sales.warehouse_id | ✅ Exists | Multi-tenant |
| sale_items.warehouse_id | ✅ Added | New column from migration |
| soft delete (sale_items) | ✅ Added | deleted_at/deleted_by |

---

### 2. PURCHASES & VENDORS
**Database Tables:**
- `purchases` - Purchase orders
- `purchase_items` - Line items
- `purchase_returns` - Returns from vendors
- `purchase_return_items` - Return line items
- `vendors` - Vendor master
- `vendor_payments` - Payments to vendors
- `vendor_transactions` - Vendor ledger

**Flow:** Procurement → Purchase Order → Receive Stock → Vendor Payment → Accounting

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| RLS on purchase_orders | ✅ Enabled | New from migration |
| vendor_payments trigger | ✅ Added | Auto-creates vendor_transactions |
| soft delete (vendors) | ✅ Added | Previously missing |

---

### 3. INVENTORY & STOCK
**Database Tables:**
- `products` - Product master
- `product_stock` - Current stock levels
- `product_categories` - Category groupings
- `stock_movements` - Movement history
- `stock_transfers` - Inter-warehouse transfers
- `bill_of_materials` - BOM for manufacturing
- `raw_materials` - Raw material inventory

**Flow:** Receive Stock → Store in Warehouse → Allocate to Agent → Track Usage → Reconcile

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| stock_transfers CHECK | ✅ Exists | Status validation |
| warehouse_id consistency | ⏳ Need Review | Some tables vary |

---

### 4. CUSTOMERS & STORES
**Database Tables:**
- `customers` - Customer accounts
- `stores` - Store locations per customer
- `customer_outstanding_summary` - Aggregated outstanding
- `store_outstanding_summary` - Per-store outstanding

**Flow:** Create Customer → Add Stores → Record Sales → Track Outstanding → Receive Payment

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| stores.lat/lng duplicate | ⚠️ Marked Deprecated | Views depend on these |
| customer status tracking | ✅ Exists | active_customers view |

---

### 5. PAYMENTS & COLLECTIONS
**Database Tables:**
- `transactions` - All payment transactions
- `customer_payments` - Customer payments
- `vendor_payments` - Vendor payments
- `income` / `income_entries` - Income recording
- `payment_returns` - Payment returns

**Flow:** Receive Cash → Record Payment → Update Outstanding → Cash Handover → Bank Deposit

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| income deprecated | ✅ Marked | Legacy table noted |
| income_entries is newer | ✅ Proper tracking | Has created_by |

---

### 6. ROUTES & VISITS
**Database Tables:**
- `routes` - Planned routes
- `route_sessions` - Daily route execution
- `store_visits` - Visit records
- `agent_routes` - Agent route assignments

**Flow:** Plan Route → Assign Agent → Execute Visit → Record Sales/Collections → Return

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| route_sessions CHECK | ✅ Added | Status validation |
| store_visits duplicate policy | ✅ Standardized | has_role() |

---

### 7. CASH & HANDOVER
**Database Tables:**
- `handovers` - Cash handover records
- `handover_requests` - Approval workflow
- `handover_snapshots` - Daily snapshots
- `staff_cash_accounts` - Staff cash balances

**Flow:** Agent collects cash → Request Handover → Manager confirms → Cash transferred

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| RLS on handover_requests | ✅ Enabled | New |
| handover_request_id FK | ✅ Added | Links to handovers |
| handovers CHECK | ✅ Added | Includes awaiting_confirmation |

---

### 8. HR & WORKFORCE
**Database Tables:**
- `workers` - Worker/employee records
- `worker_roles` - Role definitions
- `worker_balances` - Balance tracking
- `worker_payments` - Salary payments

**Flow:** Onboard Worker → Assign Role → Track Hours → Calculate Pay → Disburse

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| workers.wage_type CHECK | ✅ Added | daily/monthly/hourly |
| RLS on worker_roles | ✅ Enabled | New |

---

### 9. ATTENDANCE & TIME
**Database Tables:**
- `attendance_entries` - Check-in/out records
- `attendance_records` - Daily summaries
- `shift_rates` - Per-shift pricing
- `daily_user_snapshots` - Daily activity

**Flow:** Worker checks in → Work session → Check out → Calculate hours → Pay

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| soft delete | ✅ Added | Previously missing |
| warehouse_id | ✅ Added | New column |

---

### 10. PAYROLL
**Database Tables:**
- `payrolls` - Payroll runs
- `payroll_items` - Per-worker items

**Flow:** Period ends → Calculate wages → Process payment → Record in ledger

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| RLS enabled | ✅ Enabled | New from migration |
| payrolls CHECK | ✅ Added | Status validation |

---

### 11. EXPENSES
**Database Tables:**
- `expenses` - Company expenses
- `expense_claims` - Staff claims
- `expense_claims_history` - Audit trail
- `fixed_costs` - Recurring expenses
- `fixed_cost_payments` - Fixed cost payments

**Flow:** Expense incurred → Validate → Approve → Pay → Reconcile

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| expense_claims CHECK | ✅ Exists | Before migration |
| fixed_cost CHECK | ✅ Exists | Before migration |

---

### 12. INVOICING
**Database Tables:**
- `invoices` - Customer invoices
- `invoice_items` - Line items
- `invoice_sales` - Sales linked to invoices
- `daily_receivables_snapshots` - Receivables snapshot

**Flow:** Generate Invoice → Send to Customer → Track Payment → Mark Paid

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| invoices CHECK | ✅ Added | Draft/issued/cancelled/paid |
| invoice_items.warehouse_id | ✅ Added | New column |

---

### 13. REPORTING SNAPSHOTS
**Database Tables:**
- `daily_store_snapshots` - Store daily data
- `daily_receivables_snapshots` - Receivables data
- `daily_user_snapshots` - User activity data

**Audit Findings:**
| Check | Status | Notes |
|-------|--------|-------|
| RLS on all 3 | ⏳ Need Review | Should be SELECT only for managers |

---

## GAPS IDENTIFIED

### 1. Duplicate Column Pairs (Rule 5)
- ✅ Marked as deprecated but cannot drop (view dependencies)
- Need application audit of view code

### 2. staff_cash_accounts.cash_balance vs cash_amount
- ⚠️ Semantic unclear - needs code audit

### 3. Schema Documentation
- ✅ Created schema_audit table
- ✅ Added table comments for overlapping tables

---

## CONSISTENCY MATRIX

| Domain | FK → auth.users | soft_delete | warehouse_id | RLS | CHECK |
|--------|---------------|------------|-------------|-----|-------|
| Sales | ✅ | ✅ | ✅ | ✅ | ✅ |
| Purchases | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Inventory | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Customers | ⏳ | ✅ | ✅ | ✅ | ⏳ |
| Payments | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Routes | ⏳ | ⏳ | ⏳ | ✅ | ✅ |
| Handover | ⏳ | ✅ | ✅ | ✅ | ✅ |
| HR | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Attendance | ⏳ | ✅ | ✅ | ✅ | ⏳ |
| Payroll | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Expenses | ⏳ | ✅ | ✅ | ✅ | ✅ |
| Invoices | ⏳ | ✅ | ✅ | ✅ | ✅ |

Legend: ✅ = Complete, ⏳ = Partial/Needs Review

---

## RECOMMENDATIONS

### High Priority
1. **Review FK references** - Some tables still reference profiles.user_id instead of auth.users.id
2. **Drop deprecated columns** after code audit confirms no dependencies
3. **Clarify staff_cash_accounts** - cash_balance vs cash_amount semantics

### Medium Priority
4. **Add missing CHECK constraints** - Ensure all status fields have validation
5. **Complete warehouse_id** - Some operational tables may still need it

### Low Priority
6. **Deprecate income table** - Move all writes to income_entries
7. **Add more documentation** - Table comments for all business domains

---

## BUSINESS FLOW DIAGRAMS (Text)

### Sales Flow
```
Agent → Select Store → Add Products → Calculate Total → 
Validate Stock → Record Sale → Deduct Inventory → 
Update Customer Outstanding → Queue for Sync → 
Approve Handover → Manager Confirm → Cash to Finance
```

### Purchase Flow
```
Manager → Create PO → Vendor Confirm → 
Receive Stock → Inspect → 
Add to Inventory → 
Record Payment → Vendor Ledger Updated
```

### Inventory Flow
```
Warehouse Receive → Stock Check → 
Allocate to Agent → Agent Uses → 
Daily Count → Reconcile → Alert Low Stock
```

---

Generated: 2026-04-23
Project: NEWZ (ref: vrhptrtgrpftycvojaqo)