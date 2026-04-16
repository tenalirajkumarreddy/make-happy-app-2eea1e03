# BizManager Data Flow Audit Report
## Critical Issues & Business Consistency Gaps

**Audit Date:** 2026-04-12  
**Auditor:** OpenCode Agent  
**Status:** 🔴 CRITICAL - Immediate Action Required

---

## Executive Summary

After analyzing the flow documentation and codebase, I've identified **15 critical data flow issues** that could cause business inconsistencies, data corruption, or financial discrepancies. These range from missing audit trails to race conditions in concurrent operations.

### Severity Distribution
- 🔴 **Critical (5):** Immediate risk of data corruption or financial loss
- 🟠 **High (5):** Significant business impact, needs fixing soon
- 🟡 **Medium (5):** Moderate impact, should be addressed in next sprint

---

## 🔴 CRITICAL ISSUES

### Issue #1: Missing Transaction Reversal Capability
**Current State:** Once a sale or transaction is recorded, there's no way to reverse it without direct database manipulation.

**Business Impact:** 
- Cannot handle returns/refunds
- Cannot correct erroneous entries
- Violates accounting principles (no audit trail for reversals)

**Required Solution:**
```sql
-- Add sale_returns table
CREATE TABLE sale_returns (
  id UUID PRIMARY KEY,
  original_sale_id UUID REFERENCES sales(id),
  return_amount NUMERIC NOT NULL,
  return_reason TEXT,
  returned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Must update store outstanding atomically
);

-- Add RPC function
CREATE FUNCTION process_sale_return(
  p_sale_id UUID,
  p_return_amount NUMERIC,
  p_reason TEXT
) RETURNS void;
```

**Affected Files:**
- `src/pages/Sales.tsx` - Add return button
- `src/lib/returns.ts` - NEW
- Supabase migration needed

**Priority:** 🔴 CRITICAL  
**Effort:** 2-3 days

---

### Issue #2: No Audit Trail for Data Modifications
**Current State:** `activity_logs` table exists but doesn't capture:
- Before/after values on updates
- Who approved what changes
- Timestamp granularity for compliance

**Business Impact:**
- Cannot investigate discrepancies
- No compliance trail for auditors
- Cannot rollback malicious/erroneous changes

**Required Solution:**
```sql
-- Create comprehensive audit table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  session_id TEXT, -- For tracking request chains
  ip_address INET,
  user_agent TEXT
);

-- Trigger to auto-log all changes
CREATE TRIGGER audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION log_audit();
```

**Priority:** 🔴 CRITICAL  
**Effort:** 1-2 days

---

### Issue #3: Handover Amount Calculation Race Condition
**Current State:** Handover balance is calculated client-side and can be manipulated between calculation and submission.

**Flow Analysis:**
```
Client A calculates: ₹10,000
                     ↓ [Network delay / concurrent sale]
Client A submits:    ₹10,000 (but actual is now ₹11,000)
                     ↓
Server accepts:     ₹10,000 (INCONSISTENT!)
```

**Business Impact:**
- Cash reconciliation errors
- Trust issues between staff
- Potential for fraud

**Required Solution:**
```sql
-- Calculate server-side at submission time
CREATE FUNCTION create_handover(
  p_user_id UUID,
  p_handover_date DATE
) RETURNS TABLE(
  handover_id UUID,
  calculated_cash NUMERIC,
  calculated_upi NUMERIC,
  actual_total NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cash NUMERIC;
  v_upi NUMERIC;
BEGIN
  -- Calculate at submission time, not earlier
  SELECT COALESCE(SUM(cash_amount), 0)
  INTO v_cash
  FROM sales
  WHERE recorded_by = p_user_id
    AND DATE(created_at) = p_handover_date;
  
  SELECT COALESCE(SUM(upi_amount), 0)
  INTO v_upi
  FROM sales
  WHERE recorded_by = p_user_id
    AND DATE(created_at) = p_handover_date;
  
  -- Insert with calculated values
  INSERT INTO handovers (user_id, handover_date, cash_amount, upi_amount)
  VALUES (p_user_id, p_handover_date, v_cash, v_upi)
  RETURNING id, v_cash, v_upi, v_cash + v_upi;
END;
$$;
```

**Priority:** 🔴 CRITICAL  
**Effort:** 1 day

---

### Issue #4: Outstanding Balance Reconciliation Gap
**Current State:** There's no nightly/periodic job to verify `stores.outstanding` matches the sum of actual sales minus transactions.

**Current Check:** Only manual spot-checks via data-quality-check edge function.

**Business Impact:**
- Silent data corruption goes undetected
- Financial reports become unreliable
- Customer disputes cannot be resolved accurately

**Required Solution:**
```sql
-- Scheduled reconciliation function
CREATE FUNCTION reconcile_outstanding()
RETURNS TABLE(
  store_id UUID,
  current_outstanding NUMERIC,
  calculated_outstanding NUMERIC,
  difference NUMERIC,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id AS store_id,
    s.outstanding AS current_outstanding,
    COALESCE(sales_calc.total_sales, 0) - COALESCE(txn_calc.total_collections, 0) AS calculated_outstanding,
    s.outstanding - (COALESCE(sales_calc.total_sales, 0) - COALESCE(txn_calc.total_collections, 0)) AS difference,
    CASE 
      WHEN ABS(s.outstanding - (COALESCE(sales_calc.total_sales, 0) - COALESCE(txn_calc.total_collections, 0))) > 1000 THEN 'CRITICAL'
      WHEN ABS(s.outstanding - (COALESCE(sales_calc.total_sales, 0) - COALESCE(txn_calc.total_collections, 0))) > 100 THEN 'HIGH'
      ELSE 'MEDIUM'
    END AS severity
  FROM stores s
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total_sales
    FROM sales
    GROUP BY store_id
  ) sales_calc ON s.id = sales_calc.store_id
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total_collections
    FROM transactions
    GROUP BY store_id
  ) txn_calc ON s.id = txn_calc.store_id
  WHERE s.outstanding != COALESCE(sales_calc.total_sales, 0) - COALESCE(txn_calc.total_collections, 0);
END;
$$;

-- Schedule as cron job
-- 0 2 * * * (Daily at 2 AM)
```

**Priority:** 🔴 CRITICAL  
**Effort:** 1 day

---

### Issue #5: Missing Inventory-Stock Link
**Current State:** Sales record products sold but there's no automatic deduction from `staff_stock` or `warehouses`.

**Current Flow:**
```
Sale Recorded → ✅
Stock Deduction → ❌ (NOT HAPPENING)
```

**Business Impact:**
- Phantom inventory (selling non-existent stock)
- Cannot track actual stock levels
- Purchase planning becomes impossible

**Required Solution:**
```sql
-- Update record_sale RPC to deduct stock
CREATE OR REPLACE FUNCTION record_sale(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ... existing sale logic ...
  
  -- NEW: Deduct from staff stock
  FOR sale_item IN SELECT * FROM jsonb_array_elements(p_sale_items) LOOP
    -- Check available stock
    DECLARE
      v_available NUMERIC;
    BEGIN
      SELECT COALESCE(quantity, 0)
      INTO v_available
      FROM staff_stock
      WHERE staff_id = p_recorded_by
        AND product_id = (sale_item->>'product_id')::UUID;
      
      IF v_available < (sale_item->>'quantity')::NUMERIC THEN
        RAISE EXCEPTION 'Insufficient stock for product %', sale_item->>'product_id';
      END IF;
      
      -- Deduct stock
      UPDATE staff_stock
      SET quantity = quantity - (sale_item->>'quantity')::NUMERIC,
          last_sale_at = now()
      WHERE staff_id = p_recorded_by
        AND product_id = (sale_item->>'product_id')::UUID;
      
      -- Log stock movement
      INSERT INTO stock_movements (
        product_id, from_location, to_location,
        quantity, movement_type, reference_id
      ) VALUES (
        (sale_item->>'product_id')::UUID,
        p_recorded_by::text,
        'sale',
        (sale_item->>'quantity')::NUMERIC,
        'sale',
        v_sale_id
      );
    END;
  END LOOP;
  
  -- ... rest of function ...
END;
$$;
```

**Priority:** 🔴 CRITICAL  
**Effort:** 2 days

---

## 🟠 HIGH PRIORITY ISSUES

### Issue #6: No Sales Void/Edit Capability
**Current State:** Once a sale is recorded, it cannot be modified or voided. Only admin can update directly in DB.

**Business Impact:**
- Cannot fix data entry errors
- Cannot handle post-sale adjustments
- Forces workarounds (negative transactions)

**Required Solution:**
- Add `is_voided` and `voided_at` columns to sales
- Add `sale_adjustments` table for modifications
- Admin approval workflow for voids

**Priority:** 🟠 HIGH

---

### Issue #7: Missing Customer Ledger View
**Current State:** Customer transactions are scattered across `sales` and `transactions` tables. No unified ledger.

**Business Impact:**
- Cannot generate customer statements easily
- Dispute resolution is difficult
- Customer portal shows incomplete picture

**Required Solution:**
```sql
-- Create customer ledger view
CREATE VIEW customer_ledger AS
SELECT 
  customer_id,
  created_at AS date,
  'SALE' AS type,
  display_id AS reference,
  total_amount AS debit,
  0 AS credit,
  outstanding_amount AS balance
FROM sales
UNION ALL
SELECT 
  customer_id,
  created_at AS date,
  'PAYMENT' AS type,
  display_id AS reference,
  0 AS debit,
  total_amount AS credit,
  new_outstanding AS balance
FROM transactions
ORDER BY customer_id, date;
```

**Priority:** 🟠 HIGH

---

### Issue #8: Incomplete Handover Confirmation Chain
**Current State:** Handover has "pending" → "confirmed" but no intermediate states or rejection tracking.

**Missing States:**
- `disputed` - Receiver contests amount
- `partially_confirmed` - Partial acceptance
- `auto_confirmed` - Auto-accept after timeout

**Required Solution:**
```sql
-- Expand handover status
ALTER TABLE handovers 
ADD CONSTRAINT valid_status 
CHECK (status IN (
  'pending',
  'under_review',
  'partially_confirmed', 
  'confirmed',
  'rejected',
  'disputed',
  'auto_confirmed'
));
```

**Priority:** 🟠 HIGH

---

### Issue #9: No Product-Level Profit Tracking
**Current State:** Sales track total amounts but not cost/profit per product.

**Business Impact:**
- Cannot calculate actual profit
- Cannot identify loss-making products
- Pricing decisions lack data

**Required Solution:**
```sql
-- Add cost tracking to sale_items
ALTER TABLE sale_items ADD COLUMN cost_price NUMERIC;
ALTER TABLE sale_items ADD COLUMN profit NUMERIC GENERATED ALWAYS AS (unit_price - cost_price) * quantity STORED;

-- Trigger to auto-fetch cost from product_stock
CREATE TRIGGER set_sale_item_cost
BEFORE INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION set_cost_from_stock();
```

**Priority:** 🟠 HIGH

---

### Issue #10: Warehouse Scoping Inconsistencies
**Current State:** `warehouse_id` added to tables but RLS policies don't enforce scoping properly.

**Current RLS:**
```sql
-- Current (weak)
CREATE POLICY "View sales" ON sales FOR SELECT
USING (has_role(auth.uid(), 'manager'));

-- Should be:
CREATE POLICY "View warehouse sales" ON sales FOR SELECT
USING (
  has_role(auth.uid(), 'manager')
  AND warehouse_id IN (
    SELECT warehouse_id FROM user_roles WHERE user_id = auth.uid()
  )
);
```

**Priority:** 🟠 HIGH

---

## 🟡 MEDIUM PRIORITY ISSUES

### Issue #11: Missing Multi-Currency Support
**Current State:** Hardcoded INR (Indian Rupee) throughout.

**Impact:** Limits business expansion.

**Solution:** Add `currency` column to sales, transactions, stores.

**Priority:** 🟡 MEDIUM

---

### Issue #12: No Automated Receipt Generation
**Current State:** `SaleReceipt` component exists but receipts aren't stored persistently.

**Impact:** Cannot resend receipts, no receipt history.

**Solution:**
```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY,
  sale_id UUID REFERENCES sales(id),
  receipt_number TEXT UNIQUE,
  receipt_data JSONB, -- Full receipt JSON
  pdf_url TEXT, -- Generated PDF storage
  sent_to TEXT[], -- Email/SMS recipients
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

**Priority:** 🟡 MEDIUM

---

### Issue #13: Missing Route Optimization
**Current State:** Stores shown in creation order, not optimized for travel.

**Impact:** Agents waste time/effort on inefficient routes.

**Solution:**
- Integrate with Google Maps/Mapbox for route optimization
- Calculate optimal visiting order based on GPS
- Consider traffic, distance, store priority

**Priority:** 🟡 MEDIUM

---

### Issue #14: No Bulk Operations
**Current State:** All operations are single-record.

**Impact:**
- Bulk price updates require manual editing
- Cannot bulk-assign stores to routes
- Cannot bulk-update credit limits

**Solution:** Add bulk operation APIs.

**Priority:** 🟡 MEDIUM

---

### Issue #15: Incomplete Offline Conflict Resolution
**Current State:** Offline queue uses business keys for deduplication but doesn't handle:
- Price changes between queue and sync
- Store becoming inactive
- Credit limit changes

**Example:**
```
User records offline sale: ₹5000 (credit limit ₹10000)
[Time passes, user makes other purchases]
User comes online: Current outstanding ₹8000
                 New sale would exceed limit ₹5000
                 BUT offline sale goes through anyway!
```

**Solution:** Server-side re-validation on sync.

**Priority:** 🟡 MEDIUM

---

## 📊 Business Consistency Matrix

| Data Flow | Atomic | Audited | Reversible | Validated | Status |
|-----------|--------|---------|------------|-----------|--------|
| Sales Recording | ✅ | ⚠️ Partial | ❌ | ✅ | 🔴 Needs Work |
| Transaction Recording | ✅ | ⚠️ Partial | ❌ | ✅ | 🔴 Needs Work |
| Order Fulfillment | ✅ | ⚠️ Partial | ✅ | ✅ | 🟡 OK |
| Handover | ⚠️ Race Condition | ⚠️ Partial | ❌ | ⚠️ Client-side | 🔴 CRITICAL |
| Stock Deduction | ❌ | ❌ | ❌ | ❌ | 🔴 MISSING |
| Customer Updates | ⚠️ | ⚠️ | ✅ | ✅ | 🟡 OK |
| Store Updates | ⚠️ | ⚠️ | ✅ | ✅ | 🟡 OK |
| Route Session | ✅ | ⚠️ | ❌ | ✅ | 🟡 OK |

---

## 🎯 Recommended Implementation Order

### Phase 1: Financial Integrity (Week 1-2)
1. Issue #5: Stock Deduction (CRITICAL)
2. Issue #3: Handover Server-Side Calculation (CRITICAL)
3. Issue #4: Outstanding Reconciliation (CRITICAL)

### Phase 2: Audit & Compliance (Week 3-4)
4. Issue #2: Comprehensive Audit Trail (CRITICAL)
5. Issue #1: Sale Returns (CRITICAL)
6. Issue #6: Sales Void/Edit (HIGH)

### Phase 3: Business Intelligence (Week 5-6)
7. Issue #7: Customer Ledger (HIGH)
8. Issue #9: Profit Tracking (HIGH)
9. Issue #8: Handover States (HIGH)

### Phase 4: Scale & Polish (Week 7-8)
10. Issue #10: Warehouse Scoping (HIGH)
11. Issue #12: Receipt Generation (MEDIUM)
12. Issues #11, #13, #14, #15 (MEDIUM)

---

## 💡 Additional Feature Recommendations

### For Business Growth
1. **Subscription Billing** - Monthly recurring charges for customers
2. **Commission Tracking** - Automatic agent commission calculation
3. **Multi-location Support** - Store chains with consolidated reporting
4. **Customer Loyalty** - Points/rewards system
5. **Demand Forecasting** - ML-based stock prediction

### For Operations
1. **Barcode/QR Scanning** - Faster product/store identification
2. **Digital Signatures** - Customer acknowledgment on delivery
3. **Photo Verification** - Store visit confirmation with photo
4. **Voice Notes** - Quick note-taking for agents
5. **Offline Maps** - Cached route maps for remote areas

---

## 📝 Implementation Notes

### Critical Success Factors
1. **Test thoroughly** - These changes affect financial data
2. **Backup first** - Always backup before schema changes
3. **Migrate gradually** - Use feature flags for rollout
4. **Monitor closely** - Watch for errors post-deployment

### Testing Strategy
- Unit tests for all RPC functions
- Integration tests for end-to-end flows
- Load tests for concurrent operations
- Chaos tests for offline scenarios

---

*Audit completed by: OpenCode Agent*  
*Next review: After Phase 1 implementation*
