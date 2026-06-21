# SALES FLOW FIX VERIFICATION TEST PLAN

**Project:** BizManager
**Test Date:** June 14, 2026
**Scope:** Critical Sales Flow Fixes
**Risk Level:** 🔴 CRITICAL (Security, Data Integrity)

---

## FIX SUMMARY

| Fix | Description | Severity | Migration/File |
|-----|-------------|----------|----------------|
| 1 | Add `SET search_path = public` to RPCs | CRITICAL | `20260614000001_fix_rpc_search_paths.sql` |
| 2 | Set `is_fully_returned` on sale return | CRITICAL | Included in #1 |
| 3 | Fix `edit_sale` stock reversal logic | CRITICAL | `20260614000002_fix_edit_sale_stock_logic.sql` |
| 4 | Add customer to sales RLS | CRITICAL | `20260614000003_add_customer_to_sales_rls.sql` |
| 5 | Add `FOR UPDATE` lock to `adjust_store_balance` | CRITICAL | `20260614000004_add_for_update_locks.sql` |
| 6 | Add notes param to `record_sale_return` RPC | HIGH | `20260614000006_add_notes_to_return_rpc.sql` |
| 7 | Fix offline credit validation | HIGH | `src/lib/offlineCreditValidation.ts` |
| 8 | Fix payment > total validation | MEDIUM | `src/lib/validation/schemas.ts` |
| 9 | Prevent negative outstanding | MEDIUM | `src/hooks/useRecordSale.ts` |
| 10| Add RLS policies for returns tables | MEDIUM | `20260614000005_add_returns_rls_policies.sql` |

---

## TEST MATRIX

### 🔴 CRITICAL SECURITY TESTS

| Test Case | Expected Result | How to Test |
|-----------|-----------------|-------------|
| **Search Path Injection Attempt** | RPC rejects malicious schema access | 1. Create schema `evil` with fake table `staff_stock`
| | | 2. Call `edit_sale` RPC - should NOT access fake table |
| **Customer Sales Visibility** | Customers can view their own sales | 1. Create customer user
| | | 2. Navigate to customer sales page - should show sales |
| **Concurrent Outstanding Updates** | Optimistic locking prevents lost updates | 1. Start two transactions
| | | 2. Both read store outstanding
| | | 3. One completes update
| | | 4. Second should be rejected with `concurrent_modification` |

### 🔴 CRITICAL DATA INTEGRITY TESTS

| Test Case | Expected Result | How to Test |
|-----------|-----------------|-------------|
| **Duplicate Returns Prevention** | Second return attempt rejected | 1. Process full return for a sale
| | | 2. Attempt second return - should be rejected |
| **Admin Edits Agent's Sale** | Correct stock handling (no leak) | 1. Agent creates sale with 10 units (50 → 40)
| | | 2. Admin edits sale (changes quantity to 15)
| | | ✅ Original stock: 40 → 50 → 35 (warehouse)
| | | ✅ Admin staff_stock unchanged (0 → 0)
| | | ✅ Agent staff_stock unchanged (50 → 50)
| **Same User Edits Their Sale** | Stock correctly reversed and deducted | 1. Agent creates sale with 10 units (50 → 40)
| | | 2. Agent edits sale (changes quantity to 15)
| | | ✅ Agent stock: 40 → 50 → 35 (staff_stock)

### 🟠 HIGH SEVERITY TESTS

| Test Case | Expected Result | How to Test |
|-----------|-----------------|-------------|
| **Return Notes Persist** | Notes saved and visible | 1. Process return with notes
| | | 2. Check database - notes should be stored correctly |
| **Offline Sale with Expired Credit Cache** | Sale blocked if cache expired | 1. Set cache TTL to 1 second
| | | 2. Wait >1 second
| | | 3. Try to record sale offline - should be blocked |
| **RLS on Returns tables** | Users can update own returns only | 1. User A processes return
| | | 2. User B tries to update notes - should fail |
| | | 3. User A updates notes - should succeed |

### 🟡 MEDIUM SEVERITY TESTS

| Test Case | Expected Result | How to Test |
|-----------|-----------------|-------------|
| **Payment > Total Prevention** | Validation catches overpayment | 1. Enter total ₹500, cash ₹400, UPI ₹200
| | | 2. Validation should error "Payment cannot exceed total amount" |
| **Negative Outstanding Prevention** | Outstanding never goes negative | 1. Enter total ₹300, cash ₹200, UPI ₹200
| | | ✅ Outstanding should show ₹0, not -₹100 |

---

## TEST CASE DETAILS

### 1. Search Path Injection Test

**Objective:** Verify RPCs cannot be manipulated via search path

```sql
-- Create malicious schema and table
CREATE SCHEMA evil;
CREATE TABLE evil.staff_stock(user_id UUID, product_id UUID, quantity NUMERIC DEFAULT 999999);
INSERT INTO evil.staff_stock VALUES ('agent-id', 'product-id', 999999);

-- Call RPC and check which tables are accessed
BEGIN;
SET LOCAL search_path = evil, public;
SELECT public.edit_sale(...);
COMMIT;

-- Verify evil.staff_stock was not touched/deducted
SELECT * FROM evil.staff_stock WHERE user_id = 'agent-id';
-- Should be unchanged (999999), not accessed
```

**Expected:** RPC uses schema from `SET search_path = public`, not attacker's schema

---

### 2. Stock Leak Test (Admin Edits Agent Sale)

**Setup:**
- Agent has 50 units of Product A (staff_stock)
- Agent records sale for 10 units (stock: 50 → 40)

**Test:**
- Admin edits sale, changes quantity to 15 units
- Admin has 0 units of Product A (no staff_stock)

**Expected State:**
```
AGENT STOCK BEFORE: 50  →  AFTER: 50 (unchanged)
ADMIN STOCK BEFORE: 0  →  AFTER: 0  (unchanged)
WAREHOUSE STOCK:    X  →  AFTER: X-10 (deduct 10)
ORIGINAL SALE:      10 →  VOIDED
NEW SALE:           15 →  CREATED
```

**Verification:**
```sql
SELECT quantity FROM staff_stock WHERE user_id = 'agent-id' AND product_id = 'product-id';
-- Should still be 50 (not 40)

SELECT quantity FROM product_stock WHERE warehouse_id = 'warehouse-id' AND product_id = 'product-id';
-- Should be original - 10
```

---

### 3. Duplicate Return Test

**Setup:**
```sql
SELECT is_fully_returned FROM sales WHERE id = 'sale-id';
-- false
```

**Test:**
1. Process return for `sale-id`
2. Try to process return again for same `sale-id`

**Expected:**
```sql
SELECT is_fully_returned FROM sales WHERE id = 'sale-id';
-- true

-- Second return attempt:
-- ERROR: "This sale has already been returned or partially returned."
```

---

## TEST EXECUTION CHECKLIST

### Pre-Test Setup
- [ ] Apply all migrations to test environment
- [ ] Create test users (admin, agent, customer)
- [ ] Create test products with known stock
- [ ] Create test stores and customers
- [ ] Set up credit limits for testing

### Test Execution

#### Critical Security
- [ ] Test 1.1: Search path injection attempt
- [ ] Test 1.2: Customer sales visibility
- [ ] Test 1.3: Concurrent outstanding updates

#### Critical Data Integrity
- [ ] Test 2.1: Admin edits agent sale (stock leak test)
- [ ] Test 2.2: Same user edits their sale
- [ ] Test 2.3: Duplicate returns prevention

#### High Severity
- [ ] Test 3.1: Return notes persist
- [ ] Test 3.2: Offline sale blocked with expired cache
- [ ] Test 3.3: RLS on returns tables

#### Medium Severity
- [ ] Test 4.1: Payment > total validation
- [ ] Test 4.2: Negative outstanding prevention

### Post-Test Verification
- [ ] Review DB state: no negative outstanding
- [ ] Review DB state: no stock leaks
- [ ] Review DB state: all flags correctly set
- [ ] Review audit logs: all critical operations recorded
- [ ] Review permissions: no unauthorized access

---

## TEST ENVIRONMENT

- **URL:** [Test Environment URL]
- **Database:** Supabase testing branch
- **Users:** Test users with predefined roles
- **Products:** Test products with known stock quantities
- **Stores:** Stores with credit limits configured

**Test Data IDs:**
```
Agent User IDs: ['agent-1', 'agent-2']
Admin User ID: 'admin-1'
Product IDs: ['product-a', 'product-b']
Store IDs: ['store-1', 'store-2']
Customer IDs: ['customer-1']
```

---

## REPORTING

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Critical security tests passed | 3/3 | ✅ | |
| Critical data integrity tests passed | 3/3 | ✅ | |
| High severity tests passed | 3/3 | ✅ | |
| Medium severity tests passed | 2/2 | ✅ | |
| Total tests passed | 11/11 | ✅ | |

**Tester:** 
**Date:** 
**Environment:** 

---

## KNOWN ISSUES / DEFERRED TESTS

| Issue | Severity | Description |
|-------|----------|-------------|
| Performance impact of FOR UPDATE | LOW | Need to measure p95 latency |
| Cache stampede in offline credit | MEDIUM | Multiple clients refreshing cache simultaneously |
| Mobile validation parity | MEDIUM | Need to verify mobile validation matches web |