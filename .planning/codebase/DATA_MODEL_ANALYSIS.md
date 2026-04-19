# BizManager Data Model Analysis

**Analysis Date:** 2026-04-19

---

## 1. Core Entities Overview

| Entity | Table | Purpose | Key Fields |
|--------|-------|---------|------------|
| User | auth.users + profiles | Authentication and profile | user_id, full_name, email, phone, is_active |
| Role | user_roles | Role assignment | user_id, role, warehouse_id |
| Customer | customers | Customer accounts | id, user_id, name, phone, kyc_status, credit_limit_override |
| Store | stores | Store locations | id, customer_id, route_id, outstanding, lat, lng |
| Product | products | Product catalog | id, sku, name, base_price, is_active |
| Sale | sales | Sales transactions | id, store_id, total_amount, cash_amount, upi_amount, outstanding_amount |
| Transaction | transactions | Payment collections | id, store_id, total_amount, old_outstanding, new_outstanding |
| Order | orders | Customer orders | id, store_id, status, order_type, requirement_note |
| Route | routes | Delivery routes | id, name, store_type_id |
| Warehouse | warehouses | Stock locations | id, name, phone |

---

## 2. Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                            │
└─────────────────────────────────────────────────────────────────────────┘

auth.users (1) ────┬─── (1) profiles
                   │
                   ├─── (N) user_roles ──── (N) warehouses
                   │
                   ├─── (N) sales [as recorded_by]
                   │
                   ├─── (N) transactions [as recorded_by]
                   │
                   └─── (N) route_sessions

customers (1) ────┬─── (N) stores
                  │
                  ├─── (N) sales
                  │
                  ├─── (N) transactions
                  │
                  └─── (N) orders

stores (1) ─────┬─── (N) sales
                │
                ├─── (N) transactions
                │
                ├─── (N) orders
                │
                ├─── (N) store_visits
                │
                ├─── (N) store_pricing [product-specific pricing]
                │
                └─── (N) balance_adjustments

routes (1) ─────┬─── (N) stores
                │
                └─── (N) route_sessions

store_types (1) ┬─── (N) routes
                │
                ├─── (N) stores
                │
                ├─── (N) store_type_pricing
                │
                └─── (N) store_type_products

products (1) ───┬─── (N) sale_items
                │
                ├─── (N) order_items
                │
                ├─── (N) store_pricing
                │
                └─── (N) store_type_products

sales (1) ────── (N) sale_items

orders (1) ───── (N) order_items

warehouses (1) ─┬─── (N) product_stock
                │
                ├─── (N) staff_stock
                │
                ├─── (N) stock_movements
                │
                └─── (N) stock_transfers
```

---

## 3. Key Data Integrity Constraints

### 3.1 Uniqueness Constraints

| Table | Constraint | Purpose |
|-------|------------|---------|
| customers | display_id UNIQUE | Business identifier |
| customers | phone UNIQUE (active) | Prevent duplicate phone numbers |
| stores | display_id UNIQUE | Business identifier |
| products | sku UNIQUE | Product code uniqueness |
| store_types | name UNIQUE | Type name uniqueness |
| user_roles | (user_id, role) UNIQUE | One role per user |
| user_permissions | (user_id, permission) UNIQUE | One permission row per user |
| store_pricing | (store_id, product_id) UNIQUE | One price per store-product |
| store_type_pricing | (store_type_id, product_id) UNIQUE | One price per type-product |
| store_type_products | (store_type_id, product_id) UNIQUE | One entry per type-product |

### 3.2 Foreign Key Constraints

| Table | FK Column | References | On Delete |
|-------|-----------|------------|-----------|
| profiles | user_id | auth.users | CASCADE |
| customers | user_id | auth.users | SET NULL |
| user_roles | user_id | auth.users | - |
| stores | customer_id | customers | CASCADE |
| stores | store_type_id | store_types | - |
| stores | route_id | routes | SET NULL |
| sales | customer_id | customers | - |
| sales | store_id | stores | - |
| sales | recorded_by | auth.users | - |
| transactions | customer_id | customers | - |
| transactions | store_id | stores | - |
| orders | customer_id | customers | - |
| orders | store_id | stores | - |
| sale_items | sale_id | sales | CASCADE |
| sale_items | product_id | products | - |
| order_items | order_id | orders | CASCADE |
| order_items | product_id | products | - |
| store_visits | session_id | route_sessions | CASCADE |
| store_visits | store_id | stores | CASCADE |

### 3.3 Check Constraints

| Table | Constraint | Purpose |
|-------|------------|---------|
| sales | total_amount >= 0 | Prevent negative sales |
| sales | cash_amount >= 0 | Prevent negative cash |
| sales | upi_amount >= 0 | Prevent negative UPI |
| transactions | total_amount >= 0 | Prevent negative payments |
| stores | is_active = true for new sales | Block sales to inactive stores |

---

## 4. Critical Business Logic in Database

### 4.1 Outstanding Balance Calculation

**Trigger:** `trg_sales_recalc_outstanding`, `trg_transactions_recalc_outstanding`

**Logic:**
```sql
UPDATE stores SET outstanding = (
  COALESCE(opening_balance, 0)
  + COALESCE((SELECT SUM(s.outstanding_amount) FROM sales s WHERE s.store_id = store_id), 0)
  - COALESCE((SELECT SUM(t.total_amount) FROM transactions t WHERE t.store_id = store_id), 0)
)
```

**Note:** Recalculated from first principles after every sale/transaction to prevent drift.

### 4.2 Credit Limit Enforcement

**Location:** `record_sale()` RPC function

**Logic:**
1. Resolve credit limit (customer override > store_type)
2. Check if caller is admin/manager
3. If new_outstanding > credit_limit AND not admin: RAISE EXCEPTION 'credit_limit_exceeded'

### 4.3 Duplicate Phone Prevention

**Trigger:** `check_customer_phone_before_insert/update`

**Logic:**
```sql
IF NEW.phone IS NOT NULL AND EXISTS (
  SELECT 1 FROM customers 
  WHERE phone = NEW.phone AND id != NEW.id AND is_active = true
) THEN
  RAISE EXCEPTION 'A customer with phone % already exists', NEW.phone;
END IF;
```

---

## 5. Access Control Matrices

### 5.1 Route Access (`agent_routes`)

| Column | Type | Purpose |
|--------|------|---------|
| user_id | UUID | Staff member |
| route_id | UUID | Accessible route |
| enabled | boolean | Access granted |

**Logic:** Scoped roles (agent, marketer, pos) see only routes explicitly enabled.

### 5.2 Store Type Access (`agent_store_types`)

| Column | Type | Purpose |
|--------|------|---------|
| user_id | UUID | Staff member |
| store_type_id | UUID | Accessible store type |
| enabled | boolean | Access granted |

**Logic:** Scoped roles see only stores matching enabled store types AND routes.

---

## 6. Inventory Data Model

### 6.1 Stock Tracking Tables

| Table | Purpose |
|-------|---------|
| product_stock | Warehouse-level stock quantities |
| staff_stock | Per-user stock assignments |
| stock_movements | Audit trail of all stock changes |
| stock_transfers | Transfer requests and approvals |
| stock_adjustments | Direct quantity adjustments |

### 6.2 Stock Transfer Types

| Type | Description |
|------|-------------|
| warehouse_to_staff | Assign stock to field staff |
| staff_to_warehouse | Return stock to warehouse |
| staff_to_staff | Transfer between staff |
| warehouse_to_warehouse | Move between warehouses (admin only) |

---

## 7. Missing or Weak Relationships

### 7.1 Soft Deletion
- **Issue:** No `deleted_at` fields for soft delete
- **Impact:** Records are hard-deleted or marked inactive only
- **Tables affected:** customers, stores, products

### 7.2 Audit Trail Gaps
- **Issue:** No version history for price changes
- **Location:** store_pricing, store_type_pricing lack history tables
- **Workaround:** activity_logs captures some changes

### 7.3 Inventory-Sale Link
- **Issue:** No direct link between sales and inventory deductions
- **Current:** Stock deducted via triggers, not explicit sale_id reference
- **Gap:** Hard to trace which sale caused which stock movement

### 7.4 Customer-User Link Optional
- **Issue:** customers.user_id is optional (SET NULL)
- **Impact:** Customer portal access may break if user_id null
- **Recommendation:** Should be NOT NULL with proper onboarding flow

---

## 8. Data Type Observations

### 8.1 Numeric Precision
- **Amounts:** NUMERIC (no precision specified, defaults to variable)
- **Recommendation:** Should be NUMERIC(15,2) for currency

### 8.2 Date/Time Handling
- **Created At:** timestamptz (good, UTC-aware)
- **Payment Date:** date (may lose time precision)

### 8.3 JSON Usage
- **Metadata:** activity_logs.metadata (JSONB) - appropriate
- **Sale Items:** Passed as JSONB to RPC functions

---

## 9. Index Strategy

### 9.1 Existing Indexes
- Primary keys on all tables
- Unique indexes on business identifiers (display_id, sku)
- FK indexes for performance
- Query-specific indexes on common lookups

### 9.2 Missing Indexes (Potential Performance Issues)
- sales(created_at) - for date range queries
- transactions(store_id, created_at) - for store history
- orders(store_id, status) - for pending order lookups

---

## 10. Data Integrity Risks

| Risk | Location | Severity | Mitigation |
|------|----------|----------|------------|
| Race condition on outstanding | sales/transactions | HIGH | FOR UPDATE lock in RPC |
| Orphaned customer records | customers.user_id | MEDIUM | Trigger auto-link on signup |
| Stock negative balances | staff_stock | MEDIUM | Check constraint missing |
| Duplicate display_ids | sales/transactions/orders | LOW | Sequence-based generation |

---

*Data model analysis: 2026-04-19*
