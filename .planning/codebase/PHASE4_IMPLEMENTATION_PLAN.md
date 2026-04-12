# Phase 4 Implementation Plan
## Scale & Polish: Warehouse Scoping, Receipts, and Advanced Features

**Duration:** 2 weeks
**Priority:** 🟠 HIGH / 🟡 MEDIUM
**Status:** Ready for implementation
**Phase:** 4 (following Phases 1-3 completion)

---

## Overview

Phase 4 focuses on scaling the application for multi-warehouse operations, implementing proper receipt generation, and adding advanced features for improved operations and user experience.

---

## Issue #10: Warehouse Scoping Enforcement (HIGH PRIORITY)

### Problem Statement
`warehouse_id` exists in tables but RLS policies don't properly enforce warehouse boundaries. Staff can potentially see/modify data from warehouses they don't belong to.

### Current State (Weak)
```sql
-- Current policy allows viewing all sales if user has manager role
CREATE POLICY "View sales" ON sales FOR SELECT
  USING (has_role(auth.uid(), 'manager'));
```

### Required Solution
```sql
-- Enforce warehouse scoping
CREATE POLICY "View warehouse sales" ON sales FOR SELECT
  USING (
    has_role(auth.uid(), 'manager')
    AND warehouse_id IN (
      SELECT warehouse_id FROM user_roles WHERE user_id = auth.uid()
    )
  );
```

### Implementation Steps

#### Step 1: Audit Current RLS Policies (Day 1)
- Review all existing RLS policies
- Identify tables needing warehouse scoping
- Document current permission gaps

#### Step 2: Create Warehouse Scoping Functions (Day 1-2)
```sql
-- Helper function to get user's accessible warehouses
CREATE OR REPLACE FUNCTION get_user_warehouses(p_user_id UUID)
RETURNS TABLE(warehouse_id UUID) AS $$
  SELECT warehouse_id FROM user_roles WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if user has access to specific warehouse
CREATE OR REPLACE FUNCTION user_has_warehouse_access(
  p_user_id UUID,
  p_warehouse_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
    AND warehouse_id = p_warehouse_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

#### Step 3: Update RLS Policies (Day 2-3)
Tables to update:
- `sales` - SELECT, INSERT, UPDATE
- `transactions` - SELECT, INSERT
- `stores` - SELECT, INSERT, UPDATE
- `staff_stock` - SELECT, UPDATE
- `stock_movements` - SELECT, INSERT
- `orders` - SELECT, INSERT, UPDATE

#### Step 4: Update Frontend Queries (Day 3-4)
```typescript
// src/hooks/useSales.ts - Add warehouse filtering
const { data: sales } = useQuery({
  queryKey: ['sales', user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .in('warehouse_id', userWarehouses); // Use IN for multi-warehouse
    return data;
  }
});
```

---

## Issue #12: Receipt Generation System (MEDIUM PRIORITY)

### Problem Statement
Receipts are generated on-the-fly but not stored persistently. Cannot resend receipts or maintain receipt history.

### Required Solution
```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id),
  receipt_number TEXT UNIQUE NOT NULL,
  receipt_data JSONB NOT NULL, -- Full receipt JSON snapshot
  pdf_url TEXT, -- Generated PDF storage URL
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  sent_to TEXT[], -- Array of email/SMS recipients
  resent_count INTEGER DEFAULT 0,
  last_resent_at TIMESTAMPTZ
);

-- Index for quick lookups
CREATE INDEX idx_receipts_sale_id ON receipts(sale_id);
CREATE INDEX idx_receipts_number ON receipts(receipt_number);
```

### Implementation Steps

#### Step 1: Create Receipts Table (Day 4)
- Migration with table structure
- RLS policies for receipt access
- Trigger to auto-generate on sale

#### Step 2: PDF Generation Service (Day 5-6)
```typescript
// supabase/functions/generate-receipt-pdf/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const { receipt_id } = await req.json();
  
  // Fetch receipt data
  // Generate PDF using template
  // Store in storage bucket
  // Return download URL
});
```

#### Step 3: Update Sale Components (Day 6-7)
```typescript
// src/components/sales/SaleReceipt.tsx - Enhanced version
const SaleReceipt = ({ saleId }: { saleId: string }) => {
  const { data: receipt } = useQuery({
    queryKey: ['receipt', saleId],
    queryFn: async () => {
      const { data } = await supabase
        .from('receipts')
        .select('*')
        .eq('sale_id', saleId)
        .single();
      return data;
    }
  });
  
  const resendReceipt = async (email: string) => {
    // Update sent_to array
    // Trigger email notification
  };
  
  const downloadPDF = async () => {
    // Fetch PDF from storage
    // Trigger download
  };
};
```

#### Step 4: Receipt History UI (Day 7)
- New page: `/receipts` - List all receipts with filters
- Receipt detail view with resend options
- Bulk receipt generation for date ranges

---

## Issue #11: Multi-Currency Support (MEDIUM PRIORITY)

### Problem Statement
All amounts are hardcoded to INR (Indian Rupee). Limits business expansion to other countries.

### Implementation Steps

#### Step 1: Schema Updates (Day 8)
```sql
-- Add currency columns
ALTER TABLE sales ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE stores ADD COLUMN default_currency TEXT DEFAULT 'INR';
ALTER TABLE products ADD COLUMN base_currency TEXT DEFAULT 'INR';

-- Exchange rates table
CREATE TABLE exchange_rates (
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (from_currency, to_currency, effective_date)
);

-- Currency conversion function
CREATE OR REPLACE FUNCTION convert_currency(
  p_amount NUMERIC,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF p_from_currency = p_to_currency THEN
    RETURN p_amount;
  END IF;
  
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE from_currency = p_from_currency
  AND to_currency = p_to_currency
  AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;
  
  RETURN p_amount * COALESCE(v_rate, 1);
END;
$$ LANGUAGE plpgsql STABLE;
```

#### Step 2: Frontend Updates (Day 9)
- Currency selector in sale creation
- Currency display formatter component
- Exchange rate management UI (admin)

---

## Issue #13: Route Optimization (MEDIUM PRIORITY)

### Problem Statement
Stores shown in creation order, not optimized for travel efficiency. Agents waste time on inefficient routes.

### Implementation Steps

#### Step 1: Schema Preparation (Day 10)
```sql
-- Add route optimization fields
ALTER TABLE stores ADD COLUMN latitude NUMERIC;
ALTER TABLE stores ADD COLUMN longitude NUMERIC;
ALTER TABLE stores ADD COLUMN visit_priority INTEGER DEFAULT 0; -- 0 = normal, higher = urgent
ALTER TABLE stores ADD COLUMN avg_visit_duration INTEGER; -- minutes

-- Route sessions table
CREATE TABLE route_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  optimized_order INTEGER[], -- Array of store IDs in optimal order
  estimated_duration INTEGER, -- minutes
  actual_duration INTEGER,
  total_distance NUMERIC, -- km
  status TEXT DEFAULT 'planned', -- planned, active, completed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Step 2: Integration with Map Service (Day 11-12)
```typescript
// src/lib/routeOptimization.ts
export async function optimizeRoute(
  storeIds: string[],
  startingPoint: { lat: number; lng: number }
): Promise<OptimizedRoute> {
  // Call Mapbox/Google Maps Directions API
  // Get optimized order
  // Calculate ETA and distance
  // Store in route_sessions
}

export async function getRouteForAgent(
  agentId: string,
  date: Date
): Promise<RouteSession | null> {
  // Check for existing route session
  // Generate new if none exists
  // Return with store details
}
```

#### Step 3: UI Components (Day 13)
- Route visualization on map
- Turn-by-turn navigation view (mobile)
- Route reordering with drag-drop

---

## Issue #14: Bulk Operations (MEDIUM PRIORITY)

### Problem Statement
All operations are single-record. Manual editing required for bulk updates.

### Implementation Steps

#### Step 1: Bulk Operations API (Day 13-14)
```sql
-- Bulk price update
CREATE OR REPLACE FUNCTION bulk_update_prices(
  p_product_ids UUID[],
  p_price_change NUMERIC,
  p_is_percentage BOOLEAN DEFAULT false
) RETURNS void AS $$
BEGIN
  IF p_is_percentage THEN
    UPDATE products
    SET price = price * (1 + p_price_change / 100),
        updated_at = now()
    WHERE id = ANY(p_product_ids);
  ELSE
    UPDATE products
    SET price = price + p_price_change,
        updated_at = now()
    WHERE id = ANY(p_product_ids);
  END IF;
  
  -- Log bulk operation
  INSERT INTO bulk_operations (operation_type, record_count, performed_by)
  VALUES ('price_update', array_length(p_product_ids, 1), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bulk store assignment
CREATE OR REPLACE FUNCTION bulk_assign_stores(
  p_store_ids UUID[],
  p_agent_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE stores
  SET assigned_to = p_agent_id,
      updated_at = now()
  WHERE id = ANY(p_store_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Step 2: Bulk Operation UI (Day 14)
- Multi-select table rows
- Bulk action toolbar
- Confirmation dialogs with impact preview
- Progress indicators for large operations

---

## Issue #15: Offline Conflict Resolution (MEDIUM PRIORITY)

### Problem Statement
Offline queue handles deduplication but doesn't handle data changes between queue and sync.

### Implementation Steps

#### Step 1: Enhanced Offline Queue (Day 14-15)
```typescript
// src/lib/offlineQueue.ts - Enhanced version
interface QueuedOperation {
  id: string;
  type: 'sale' | 'transaction' | 'store_update';
  data: any;
  timestamp: number;
  businessKey: string;
  // NEW: Context for conflict detection
  context: {
    storeOutStandingAtQueueTime?: number;
    productPriceAtQueueTime?: number;
    customerCreditLimitAtQueueTime?: number;
  };
}

export async function syncOfflineQueue(): Promise<SyncResult> {
  const queue = await getOfflineQueue();
  const conflicts: Conflict[] = [];
  const synced: string[] = [];
  
  for (const op of queue) {
    // Server-side re-validation
    const validation = await validateOperationContext(op);
    
    if (!validation.valid) {
      conflicts.push({
        operation: op,
        reason: validation.reason,
        suggestions: validation.suggestions
      });
      continue;
    }
    
    // Process operation
    await processOperation(op);
    synced.push(op.id);
  }
  
  return { synced, conflicts };
}
```

#### Step 2: Conflict Resolution UI (Day 15)
- Conflict notification component
- Side-by-side comparison (queued vs current)
- Options: Apply anyway, Modify and apply, Discard
- Auto-retry with modified values

---

## Testing Strategy

### Unit Tests
```typescript
// Warehouse scoping tests
describe('Warehouse Scoping', () => {
  it('should block access to unauthorized warehouse sales', async () => {});
  it('should allow access to assigned warehouse data', async () => {});
  it('should enforce warehouse on insert', async () => {});
});

// Receipt generation tests
describe('Receipt System', () => {
  it('should generate receipt on sale', async () => {});
  it('should track resend history', async () => {});
  it('should generate PDF correctly', async () => {});
});
```

### Integration Tests
- Multi-warehouse sale recording
- Receipt generation and retrieval
- Currency conversion accuracy
- Route optimization accuracy
- Bulk operation performance

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Warehouse Data Isolation | ❌ Weak | ✅ Enforced | 100% compliance |
| Receipt Persistence | ❌ None | ✅ Stored | 100% of sales |
| Multi-Currency | ❌ INR only | ✅ Flexible | Support 3+ currencies |
| Route Efficiency | ⚠️ Manual | ✅ Optimized | 20% time savings |
| Bulk Operations | ❌ Single | ✅ Batch | Support 100+ records |
| Offline Conflicts | ❌ Silent | ✅ Visible | 0 silent failures |

---

## Deployment Checklist

- [ ] Run database migrations in staging
- [ ] Test RLS policies with different user roles
- [ ] Verify receipt generation and PDF creation
- [ ] Test multi-currency conversions
- [ ] Validate route optimization integration
- [ ] Load test bulk operations
- [ ] Test offline conflict scenarios
- [ ] Deploy to production
- [ ] Monitor for 48 hours
- [ ] Update user documentation

---

*Plan created: 2026-04-12*
*Based on DATA_FLOW_AUDIT.md Phase 4 recommendations*
