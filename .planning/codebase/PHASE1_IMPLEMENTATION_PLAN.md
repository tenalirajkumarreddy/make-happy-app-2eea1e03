# Phase 1 Implementation Plan
## Financial Integrity Fixes (CRITICAL Issues)

**Duration:** 2 weeks  
**Priority:** 🔴 CRITICAL  
**Status:** Ready for implementation

---

## Issue #5: Stock Deduction on Sale (HIGHEST PRIORITY)

### Problem Statement
Sales record products sold but don't deduct from staff_stock. This causes:
- Phantom inventory (selling non-existent stock)
- Cannot track actual stock levels
- Purchase planning impossible

### Implementation Steps

#### Step 1: Database Migration (Day 1)
```sql
-- Migration: 20260412000010_stock_deduction_on_sale.sql

-- 1. Add trigger to automatically deduct stock on sale
CREATE OR REPLACE FUNCTION deduct_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sale_item RECORD;
  v_available NUMERIC;
  v_staff_warehouse_id UUID;
BEGIN
  -- Get staff's warehouse
  SELECT warehouse_id INTO v_staff_warehouse_id
  FROM user_roles
  WHERE user_id = NEW.recorded_by
  LIMIT 1;
  
  -- Process each sale item
  FOR sale_item IN 
    SELECT * FROM sale_items WHERE sale_id = NEW.id
  LOOP
    -- Check available stock
    SELECT COALESCE(quantity, 0) INTO v_available
    FROM staff_stock
    WHERE staff_id = NEW.recorded_by
      AND product_id = sale_item.product_id
      AND warehouse_id = v_staff_warehouse_id;
    
    -- Skip if no stock tracking (optional products)
    IF v_available IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check if sufficient stock
    IF v_available < sale_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %: have %, need %',
        sale_item.product_id, v_available, sale_item.quantity;
    END IF;
    
    -- Deduct stock
    UPDATE staff_stock
    SET quantity = quantity - sale_item.quantity,
        updated_at = now()
    WHERE staff_id = NEW.recorded_by
      AND product_id = sale_item.product_id
      AND warehouse_id = v_staff_warehouse_id;
    
    -- Log movement
    INSERT INTO stock_movements (
      product_id,
      warehouse_id,
      staff_id,
      quantity,
      movement_type,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      sale_item.product_id,
      v_staff_warehouse_id,
      NEW.recorded_by,
      -sale_item.quantity, -- negative for deduction
      'sale',
      'sale',
      NEW.id,
      'Auto-deducted on sale ' || NEW.display_id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to sales table
CREATE TRIGGER trg_deduct_stock_on_sale
AFTER INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION deduct_stock_on_sale();

-- 2. Add allow_negative_stock setting to company_settings
INSERT INTO company_settings (key, value, description)
VALUES (
  'allow_negative_stock',
  'false',
  'Allow sales to proceed even if stock is insufficient'
)
ON CONFLICT (key) DO NOTHING;
```

#### Step 2: Update Sales Page (Day 1-2)
```typescript
// src/pages/Sales.tsx - Add stock check before sale

const handleAdd = async () => {
  // ... existing validation ...
  
  // NEW: Check stock availability
  if (items.some(i => i.product_id)) {
    const { data: stockCheck, error: stockError } = await supabase
      .rpc('check_stock_availability', {
        p_staff_id: user!.id,
        p_items: items.filter(i => i.product_id).map(i => ({
          product_id: i.product_id,
          quantity: i.quantity
        }))
      });
    
    if (stockError) {
      toast.error('Stock check failed: ' + stockError.message);
      return;
    }
    
    if (stockCheck && stockCheck.length > 0) {
      const insufficient = stockCheck.filter((s: any) => !s.available);
      if (insufficient.length > 0) {
        toast.error(
          `Insufficient stock for: ${insufficient.map((i: any) => i.product_name).join(', ')}`
        );
        return;
      }
    }
  }
  
  // ... proceed with sale ...
};
```

#### Step 3: Create RPC Function (Day 1)
```sql
-- Check stock availability before sale
CREATE OR REPLACE FUNCTION check_stock_availability(
  p_staff_id UUID,
  p_items JSONB
)
RETURNS TABLE(
  product_id UUID,
  product_name TEXT,
  requested_qty NUMERIC,
  available_qty NUMERIC,
  available BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    p.id AS product_id,
    p.name AS product_name,
    (item->>'quantity')::NUMERIC AS requested_qty,
    COALESCE(ss.quantity, 0) AS available_qty,
    COALESCE(ss.quantity, 0) >= (item->>'quantity')::NUMERIC AS available
  FROM jsonb_array_elements(p_items) AS item
  JOIN products p ON p.id = (item->>'product_id')::UUID
  LEFT JOIN staff_stock ss ON 
    ss.product_id = (item->>'product_id')::UUID
    AND ss.staff_id = p_staff_id
    AND ss.warehouse_id = (
      SELECT warehouse_id FROM user_roles WHERE user_id = p_staff_id LIMIT 1
    )
$$;
```

#### Step 4: Update Mobile Sales (Day 2)
```typescript
// src/mobile/pages/agent/AgentRecord.tsx

// Add stock check before recording sale
const checkStockBeforeSale = async () => {
  const { data } = await supabase.rpc('check_stock_availability', {
    p_staff_id: user!.id,
    p_items: cart.map(item => ({
      product_id: item.productId,
      quantity: item.quantity
    }))
  });
  
  return data;
};
```

---

## Issue #3: Handover Server-Side Calculation

### Problem Statement
Handover amounts calculated client-side, vulnerable to race conditions.

### Implementation Steps

#### Step 1: Create RPC Function (Day 3)
```sql
-- Migration: 20260412000011_server_side_handover.sql

CREATE OR REPLACE FUNCTION create_handover(
  p_user_id UUID,
  p_handed_to UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  handover_id UUID,
  handover_date DATE,
  cash_amount NUMERIC,
  upi_amount NUMERIC,
  total_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_handover_id UUID;
  v_today DATE := CURRENT_DATE;
  v_cash NUMERIC;
  v_upi NUMERIC;
  v_already_exists UUID;
BEGIN
  -- Check if handover already exists for today
  SELECT id INTO v_already_exists
  FROM handovers
  WHERE user_id = p_user_id
    AND handover_date = v_today
    AND status IN ('pending', 'awaiting_confirmation')
  LIMIT 1;
  
  IF v_already_exists IS NOT NULL THEN
    RAISE EXCEPTION 'Handover already exists for today';
  END IF;
  
  -- Calculate amounts (server-side, fresh data)
  SELECT COALESCE(SUM(cash_amount), 0)
  INTO v_cash
  FROM sales
  WHERE recorded_by = p_user_id
    AND DATE(created_at) = v_today
    AND NOT EXISTS (
      SELECT 1 FROM handovers h
      WHERE h.user_id = p_user_id
        AND h.status = 'confirmed'
        AND DATE(sales.created_at) = h.handover_date
    );
  
  SELECT COALESCE(SUM(upi_amount), 0)
  INTO v_upi
  FROM sales
  WHERE recorded_by = p_user_id
    AND DATE(created_at) = v_today
    AND NOT EXISTS (
      SELECT 1 FROM handovers h
      WHERE h.user_id = p_user_id
        AND h.status = 'confirmed'
        AND DATE(sales.created_at) = h.handover_date
    );
  
  -- Calculate received from others
  DECLARE
    v_received_cash NUMERIC;
    v_received_upi NUMERIC;
  BEGIN
    SELECT 
      COALESCE(SUM(CASE WHEN cash_amount > 0 THEN cash_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN upi_amount > 0 THEN upi_amount ELSE 0 END), 0)
    INTO v_received_cash, v_received_upi
    FROM handovers
    WHERE handed_to = p_user_id
      AND status = 'confirmed'
      AND DATE(confirmed_at) = v_today;
    
    v_cash := v_cash + v_received_cash;
    v_upi := v_upi + v_received_upi;
  END;
  
  -- Calculate sent to others (deduct)
  DECLARE
    v_sent_cash NUMERIC;
    v_sent_upi NUMERIC;
  BEGIN
    SELECT 
      COALESCE(SUM(cash_amount), 0),
      COALESCE(SUM(upi_amount), 0)
    INTO v_sent_cash, v_sent_upi
    FROM handovers
    WHERE user_id = p_user_id
      AND status = 'confirmed'
      AND DATE(confirmed_at) = v_today;
    
    v_cash := v_cash - v_sent_cash;
    v_upi := v_upi - v_sent_upi;
  END;
  
  -- Calculate approved expenses (deduct)
  DECLARE
    v_expenses NUMERIC;
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_expenses
    FROM expense_claims
    WHERE user_id = p_user_id
      AND status = 'approved'
      AND DATE(updated_at) = v_today;
    
    v_cash := v_cash - v_expenses;
  END;
  
  -- Ensure non-negative
  v_cash := GREATEST(0, v_cash);
  v_upi := GREATEST(0, v_upi);
  
  -- Insert handover
  INSERT INTO handovers (
    user_id,
    handover_date,
    cash_amount,
    upi_amount,
    handed_to,
    status,
    notes,
    created_at
  ) VALUES (
    p_user_id,
    v_today,
    v_cash,
    v_upi,
    p_handed_to,
    'awaiting_confirmation',
    p_notes,
    now()
  )
  RETURNING id INTO v_handover_id;
  
  RETURN QUERY SELECT 
    v_handover_id,
    v_today,
    v_cash,
    v_upi,
    v_cash + v_upi;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION create_handover TO authenticated;
```

#### Step 2: Update Handovers Page (Day 3-4)
```typescript
// src/pages/Handovers.tsx

const handleCreateHandover = async () => {
  setCreating(true);
  
  try {
    const { data, error } = await supabase
      .rpc('create_handover', {
        p_user_id: user!.id,
        p_handed_to: selectedRecipient,
        p_notes: notes || null
      });
    
    if (error) throw error;
    
    toast.success(`Handover created: ₹${Number(data[0].total_amount).toLocaleString()}`);
    setShowCreateDialog(false);
    qc.invalidateQueries({ queryKey: ['handovers'] });
    
  } catch (error: any) {
    toast.error(error.message);
  } finally {
    setCreating(false);
  }
};

// Remove client-side calculation
// Delete: calculatePendingAmount() function (lines 126-218)
```

#### Step 3: Verify Handover (Day 4)
```sql
-- Add verification function
CREATE OR REPLACE FUNCTION verify_handover_amounts(
  p_handover_id UUID
)
RETURNS TABLE(
  is_valid BOOLEAN,
  expected_cash NUMERIC,
  expected_upi NUMERIC,
  actual_cash NUMERIC,
  actual_upi NUMERIC,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_handover RECORD;
  v_expected_cash NUMERIC;
  v_expected_upi NUMERIC;
BEGIN
  SELECT * INTO v_handover
  FROM handovers
  WHERE id = p_handover_id;
  
  -- Recalculate expected
  SELECT COALESCE(SUM(cash_amount), 0)
  INTO v_expected_cash
  FROM sales
  WHERE recorded_by = v_handover.user_id
    AND DATE(created_at) = v_handover.handover_date;
  
  SELECT COALESCE(SUM(upi_amount), 0)
  INTO v_expected_upi
  FROM sales
  WHERE recorded_by = v_handover.user_id
    AND DATE(created_at) = v_handover.handover_date;
  
  RETURN QUERY SELECT 
    ABS(v_expected_cash - v_handover.cash_amount) < 0.01 
      AND ABS(v_expected_upi - v_handover.upi_amount) < 0.01,
    v_expected_cash,
    v_expected_upi,
    v_handover.cash_amount,
    v_handover.upi_amount,
    CASE 
      WHEN ABS(v_expected_cash - v_handover.cash_amount) >= 0.01 
        THEN 'Cash amount mismatch'
      WHEN ABS(v_expected_upi - v_handover.upi_amount) >= 0.01 
        THEN 'UPI amount mismatch'
      ELSE 'Amounts match'
    END;
END;
$$;
```

---

## Issue #4: Outstanding Reconciliation

### Problem Statement
No periodic verification that `stores.outstanding` matches actual sales minus payments.

### Implementation Steps

#### Step 1: Create Reconciliation Function (Day 5)
```sql
-- Migration: 20260412000012_outstanding_reconciliation.sql

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT now(),
  run_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'running', -- running, completed, failed
  total_stores INTEGER,
  mismatched_stores INTEGER,
  critical_issues INTEGER,
  high_issues INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id),
  current_outstanding NUMERIC,
  calculated_outstanding NUMERIC,
  difference NUMERIC,
  severity TEXT, -- critical, high, medium
  status TEXT DEFAULT 'open', -- open, investigating, resolved, ignored
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION reconcile_outstanding(
  p_auto_resolve_minor BOOLEAN DEFAULT false
)
RETURNS UUID -- Returns run_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id UUID;
  v_total INTEGER := 0;
  v_mismatched INTEGER := 0;
  v_critical INTEGER := 0;
  v_high INTEGER := 0;
  issue RECORD;
BEGIN
  -- Create run record
  INSERT INTO reconciliation_runs (run_by, status)
  VALUES (auth.uid(), 'running')
  RETURNING id INTO v_run_id;
  
  -- Count total stores
  SELECT COUNT(*) INTO v_total FROM stores WHERE is_active = true;
  
  -- Find mismatches
  FOR issue IN
    SELECT 
      s.id AS store_id,
      s.outstanding AS current_outstanding,
      COALESCE(sales_calc.total, 0) - COALESCE(txn_calc.total, 0) AS calculated_outstanding,
      s.outstanding - (COALESCE(sales_calc.total, 0) - COALESCE(txn_calc.total, 0)) AS difference
    FROM stores s
    LEFT JOIN (
      SELECT store_id, COALESCE(SUM(outstanding_amount), 0) AS total
      FROM sales
      GROUP BY store_id
    ) sales_calc ON s.id = sales_calc.store_id
    LEFT JOIN (
      SELECT store_id, COALESCE(SUM(total_amount), 0) AS total
      FROM transactions
      GROUP BY store_id
    ) txn_calc ON s.id = txn_calc.store_id
    WHERE s.is_active = true
      AND ABS(s.outstanding - (COALESCE(sales_calc.total, 0) - COALESCE(txn_calc.total, 0))) > 0.01
  LOOP
    v_mismatched := v_mismatched + 1;
    
    -- Determine severity
    DECLARE
      v_severity TEXT;
    BEGIN
      IF ABS(issue.difference) > 10000 THEN
        v_severity := 'critical';
        v_critical := v_critical + 1;
      ELSIF ABS(issue.difference) > 1000 THEN
        v_severity := 'high';
        v_high := v_high + 1;
      ELSE
        v_severity := 'medium';
      END IF;
      
      -- Insert issue
      INSERT INTO reconciliation_issues (
        run_id, store_id, current_outstanding,
        calculated_outstanding, difference, severity
      ) VALUES (
        v_run_id, issue.store_id, issue.current_outstanding,
        issue.calculated_outstanding, issue.difference, v_severity
      );
      
      -- Auto-resolve minor discrepancies (if enabled)
      IF p_auto_resolve_minor 
         AND ABS(issue.difference) < 100 
         AND v_severity = 'medium' THEN
        UPDATE stores
        SET outstanding = issue.calculated_outstanding
        WHERE id = issue.store_id;
        
        UPDATE reconciliation_issues
        SET status = 'resolved',
            notes = 'Auto-resolved: minor discrepancy corrected'
        WHERE run_id = v_run_id AND store_id = issue.store_id;
      END IF;
    END;
  END LOOP;
  
  -- Update run record
  UPDATE reconciliation_runs
  SET status = 'completed',
      total_stores = v_total,
      mismatched_stores = v_mismatched,
      critical_issues = v_critical,
      high_issues = v_high,
      completed_at = now()
  WHERE id = v_run_id;
  
  -- Notify admins if critical issues
  IF v_critical > 0 THEN
    PERFORM pg_notify('reconciliation_alert', 
      format('CRITICAL: %s stores have critical outstanding mismatches', v_critical));
  END IF;
  
  RETURN v_run_id;
END;
$$;
```

#### Step 2: Create Admin Dashboard (Day 5-6)
```typescript
// src/pages/admin/ReconciliationDashboard.tsx (NEW)

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function ReconciliationDashboard() {
  const { data: latestRun } = useQuery({
    queryKey: ['latest-reconciliation'],
    queryFn: async () => {
      const { data } = await supabase
        .from('reconciliation_runs')
        .select('*, reconciliation_issues(*)')
        .order('run_at', { ascending: false })
        .limit(1)
        .single();
      return data;
    }
  });
  
  const runReconciliation = async () => {
    const { data, error } = await supabase
      .rpc('reconcile_outstanding', { p_auto_resolve_minor: true });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Reconciliation completed');
      // Refresh data
    }
  };
  
  const resolveIssue = async (issueId: string, correction: number) => {
    // Admin resolves with correction amount
  };
  
  return (
    <div>
      <h1>Outstanding Reconciliation</h1>
      <Button onClick={runReconciliation}>
        Run Reconciliation Now
      </Button>
      {/* Show latest run results */}
    </div>
  );
}
```

#### Step 3: Schedule Cron Job (Day 6)
```sql
-- Set up pg_cron job (requires pg_cron extension)
SELECT cron.schedule(
  'nightly-reconciliation',
  '0 2 * * *', -- Daily at 2 AM
  $$SELECT reconcile_outstanding(true)$$
);
```

---

## Testing Strategy

### Unit Tests (Day 7-8)

```typescript
// src/test/stockDeduction.test.ts

describe('Stock Deduction', () => {
  it('should deduct stock on sale', async () => {
    // Setup: Create staff stock
    // Act: Record sale
    // Assert: Stock reduced
  });
  
  it('should block sale if insufficient stock', async () => {
    // Setup: Low stock
    // Act: Attempt large sale
    // Assert: Error thrown
  });
  
  it('should allow sale if stock tracking disabled', async () => {
    // Setup: Product with no stock entry
    // Act: Record sale
    // Assert: Success
  });
});

// src/test/handover.test.ts

describe('Handover Calculation', () => {
  it('should calculate fresh on creation', async () => {
    // Setup: Multiple sales
    // Act: Create handover
    // Assert: Amounts match actual sales
  });
  
  it('should prevent duplicate handovers', async () => {
    // Setup: Existing handover
    // Act: Try create another
    // Assert: Error
  });
  
  it('should include received from others', async () => {
    // Setup: Receive handover from another staff
    // Act: Create handover
    // Assert: Includes received amount
  });
});
```

### Integration Tests (Day 9-10)

```typescript
// End-to-end flow tests

describe('Financial Integrity Flows', () => {
  it('should maintain stock accuracy after 100 concurrent sales', async () => {
    // Load test
  });
  
  it('should detect outstanding discrepancies', async () => {
    // Manually create mismatch
    // Run reconciliation
    // Verify detected
  });
  
  it('should handle handover race condition', async () => {
    // Simulate concurrent handover creation
    // Only one should succeed
  });
});
```

---

## Rollback Plan

### If Issues Arise:

1. **Stock Deduction Issues**
   ```sql
   -- Disable trigger
   ALTER TABLE sales DISABLE TRIGGER trg_deduct_stock_on_sale;
   
   -- Re-enable after fix
   ALTER TABLE sales ENABLE TRIGGER trg_deduct_stock_on_sale;
   ```

2. **Handover Calculation Issues**
   ```sql
   -- Revert to client-side temporarily
   -- Restore old calculatePendingAmount() function
   ```

3. **Reconciliation False Positives**
   ```sql
   -- Mark all issues as ignored
   UPDATE reconciliation_issues SET status = 'ignored';
   ```

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Stock Accuracy | ❌ Unknown | ✅ Real-time | 99.9% |
| Handover Errors | ⚠️ Race conditions | ✅ Server-side | 0 race conditions |
| Outstanding Discrepancies | ❌ Unknown | ✅ Daily check | < 1% stores |
| Phantom Inventory | ❌ Possible | ✅ Blocked | 0 |

---

## Deployment Checklist

- [ ] Run database migrations in staging
- [ ] Run integration tests
- [ ] Deploy to production (feature flags)
- [ ] Monitor for 24 hours
- [ ] Enable for all users
- [ ] Document in CHANGELOG

---

*Plan created: 2026-04-12*  
*Ready for implementation*
