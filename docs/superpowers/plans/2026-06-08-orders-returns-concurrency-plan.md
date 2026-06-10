# Orders & Sale Returns Concurrency Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate race conditions in order creation, order fulfillment, and sale return processing.

**Architecture:** Create server-side RPCs with `FOR UPDATE` row locks. Fix frontend bugs in status checks. Route direct inserts through atomic RPCs.

**Tech Stack:** Supabase Postgres (RPCs), React + TypeScript, React Query

---

### Task 1: Create migration with concurrency-safe RPCs + fixes

**Files:**
- Create: `supabase/migrations/20260608000010_orders_returns_concurrency.sql`

One migration containing all SQL changes.

- [ ] **Step 1: Create `create_order` RPC**

```sql
CREATE OR REPLACE FUNCTION public.create_order(
  p_store_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_order_type TEXT DEFAULT 'simple',
  p_requirement_note TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_date DATE DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT 0,
  p_created_by UUID,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(order_id UUID, display_id TEXT) LANGUAGE plpgsql AS $$
DECLARE
  v_existing_id UUID;
  v_display_id TEXT;
  v_order_id UUID;
BEGIN
  -- Lock any active order for this store (prevents concurrent creation)
  SELECT id INTO v_existing_id
  FROM public.orders
  WHERE store_id = p_store_id AND status IN ('pending', 'confirmed')
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Store already has an active order (id: %)', v_existing_id
      USING HINT = 'Edit the existing order instead of creating a new one';
  END IF;

  -- Generate display ID
  SELECT COALESCE(
    (SELECT display_id FROM public.generate_random_display_id('ORD', 'orders')),
    'ORD-' || substr(gen_random_uuid()::text, 1, 8)
  ) INTO v_display_id;

  -- Insert order
  INSERT INTO public.orders (
    store_id, customer_id, assigned_to, warehouse_id,
    order_type, status, requirement_note, delivery_address,
    delivery_date, total_amount, display_id,
    created_by, created_at, updated_at
  ) VALUES (
    p_store_id, p_customer_id, p_assigned_to, p_warehouse_id,
    p_order_type, 'pending', p_requirement_note, p_delivery_address,
    p_delivery_date, p_total_amount, v_display_id,
    p_created_by, p_created_at, p_created_at
  ) RETURNING id INTO v_order_id;

  RETURN QUERY SELECT v_order_id, v_display_id;
END;
$$;
```

- [ ] **Step 2: Hardening `record_sale` — lock order before fulfillment**

```sql
CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id TEXT,
  p_store_id UUID,
  p_customer_id UUID,
  p_recorded_by UUID,
  p_warehouse_id UUID,
  p_total_amount NUMERIC DEFAULT 0,
  p_cash_amount NUMERIC DEFAULT 0,
  p_upi_amount NUMERIC DEFAULT 0,
  p_outstanding_amount NUMERIC DEFAULT 0,
  p_created_at TIMESTAMPTZ DEFAULT NOW(),
  p_fulfilled_order_id UUID DEFAULT NULL,
  p_is_proxy_record BOOLEAN DEFAULT FALSE,
  p_proxy_for_user_id UUID DEFAULT NULL,
  p_product_data JSONB DEFAULT NULL,
  p_expected_outstanding NUMERIC DEFAULT NULL
) RETURNS JSONB
  LANGUAGE plpgsql
  AS $$
-- … (existing function body) …
```

Modify the existing function: at the top, if `p_fulfilled_order_id IS NOT NULL`, lock the order row:

```sql
  -- If fulfilling an order, lock the order row first to prevent double-fulfillment
  IF p_fulfilled_order_id IS NOT NULL THEN
    PERFORM id FROM public.orders
    WHERE id = p_fulfilled_order_id
    FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_fulfilled_order_id AND status = 'delivered') THEN
      RAISE EXCEPTION 'Order % is already fulfilled', p_fulfilled_order_id
        USING HINT = 'Cannot fulfill an already-delivered order';
    END IF;
  END IF;
```

- [ ] **Step 3: Fix `process_completed_sale_return` — add FOR UPDATE lock**

Add at the top of the function body:

```sql
  -- Lock the return row to prevent concurrent processing
  PERFORM id FROM public.sale_returns WHERE id = p_return_id FOR UPDATE;
```

- [ ] **Step 4: Create `approve_or_reject_return` RPC**

```sql
CREATE OR REPLACE FUNCTION public.approve_or_reject_return(
  p_return_id UUID,
  p_status TEXT,
  p_approved_by UUID
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_current_status TEXT;
  v_result JSONB;
BEGIN
  -- Lock the return row
  SELECT status INTO v_current_status
  FROM public.sale_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF v_current_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Return is not pending (current status: %s)', v_current_status)
    );
  END IF;

  UPDATE public.sale_returns
  SET status = p_status,
      approved_by = CASE WHEN p_status = 'approved' THEN p_approved_by ELSE approved_by END,
      approved_at = CASE WHEN p_status = 'approved' THEN NOW() ELSE approved_at END,
      cancelled_by = CASE WHEN p_status = 'rejected' THEN p_approved_by ELSE cancelled_by END,
      cancellation_reason = CASE WHEN p_status = 'rejected' THEN 'Rejected by manager' ELSE cancellation_reason END,
      updated_at = NOW()
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;
```

- [ ] **Step 5: Apply migration**

Run: `supabase migration apply` or use Supabase MCP tool to apply `20260608000010_orders_returns_concurrency.sql`.

Expected: Migration applies without errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260608000010_orders_returns_concurrency.sql
git commit -m "feat: add concurrency-safe RPCs for orders and sale returns"
```

---

### Task 2: Update Orders.tsx to use `create_order` RPC

**Files:**
- Modify: `src/pages/Orders.tsx:573-644`

Replace the direct `supabase.from("orders").insert(...)` + client-side active-order check with a call to the `create_order` RPC.

- [ ] **Step 1: Remove the client-side active-order check and replace insert with RPC call**

Find the `handleAdd` function (around line 573). Replace:

```typescript
const { data: displayId, error: displayIdError } = await supabase.rpc(
  "generate_random_display_id",
  { p_prefix: "ORD", p_table_name: "orders" }
);
// ... then later:
const { data: newOrder, error: orderError } = await supabase
  .from("orders")
  .insert({ ... })
  .select()
  .single();
```

With:

```typescript
// Use concurrency-safe RPC instead of client check + direct insert
const { data: orderResult, error: orderError } = await supabase
  .rpc("create_order", {
    p_store_id: storeId,
    p_customer_id: customerId || null,
    p_assigned_to: assignedTo || null,
    p_warehouse_id: currentWarehouse?.id || null,
    p_order_type: orderType,
    p_requirement_note: requirementNote || null,
    p_delivery_address: deliveryAddress || null,
    p_delivery_date: deliveryDate || null,
    p_total_amount: totalAmount || 0,
    p_created_by: user!.id,
    p_created_at: createdAt || new Date().toISOString(),
  });

if (orderError) {
  if (orderError.message?.includes?.('already has an active order')) {
    toast.error('This store already has an active order');
    return;
  }
  toast.error(orderError.message);
  return;
}

const newOrderId = orderResult[0]?.order_id;
const orderDisplayId = orderResult[0]?.display_id;
```

- [ ] **Step 2: Update subsequent insertions to use returned IDs**

Where order_items and proforma_invoice are inserted, use `newOrderId` and `orderDisplayId` instead of the old `newOrder.id` / `newOrder.display_id`.

- [ ] **Step 3: Build and verify**

Run `npm run build`. Fix any TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Orders.tsx
git commit -m "fix: use concurrency-safe create_order RPC"
```

---

### Task 3: Fix SaleReturns.tsx — bugs + atomic RPCs

**Files:**
- Modify: `src/pages/SaleReturns.tsx`

- [ ] **Step 1: Fix the approve status check bug**

Find the approve/reject handler. Currently:
```typescript
.eq("status", "approved")
```

Should be:
```typescript
.eq("status", "pending")
```

- [ ] **Step 2: Replace direct approve/reject with `approve_or_reject_return` RPC**

Replace:
```typescript
const { error: updateError } = await supabase
  .from("sale_returns")
  .update({ status: newStatus, ... })
  .eq("id", id)
  .eq("status", "approved");  // bug: should be "pending"
```

With:
```typescript
const { data: result, error: rpcError } = await supabase
  .rpc("approve_or_reject_return", {
    p_return_id: id,
    p_status: newStatus,
    p_approved_by: user!.id,
  });

if (rpcError || !result?.success) {
  toast.error(result?.error || 'Failed to update return status');
  return;
}
```

- [ ] **Step 3: Route admin return creation through `record_sale_return` RPC**

Find the admin auto-process flow (around line 284). Instead of:
```typescript
const { data: newReturn, error: returnError } = await supabase
  .from("sale_returns")
  .insert({ status: "processed", ... })
```

Replace with a call to `record_sale_return`:
```typescript
const { data: result, error: rpcError } = await supabase
  .rpc("record_sale_return", {
    p_sale_id: saleId,
    p_returned_by: user!.id,
    p_warehouse_id: currentWarehouse?.id || null,
    p_reason: reason || null,
    p_items: returnItems.map(item => ({
      sale_item_id: item.sale_item_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_damaged: item.is_damaged || false,
    })),
    p_is_approved: true,  // admin auto-approve
  });
```

- [ ] **Step 4: Build and verify**

Run `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SaleReturns.tsx
git commit -m "fix: use atomic RPCs for sale returns + fix pending status check"
```

---

### Task 4: Write tests

**Files:**
- Create: `src/test/ordersConcurrency.test.ts` — test `create_order` RPC logic
- Create: `src/test/saleReturnsConcurrency.test.ts` — test approve/reject logic

Since these test server-side RPCs, test the logic by testing the client-side handler functions.

- [ ] **Step 1: Test order creation error handling**

```typescript
import { describe, it, expect } from "vitest";

describe("create_order error handling", () => {
  it("handles active order error message", () => {
    const error = { message: 'Store already has an active order (id: abc-123)' };
    expect(error.message).toContain('already has an active order');
  });
});
```

- [ ] **Step 2: Run tests**

Run `npm run test` — verify all tests including new ones pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/ordersConcurrency.test.ts src/test/saleReturnsConcurrency.test.ts
git commit -m "test: add concurrency tests for orders and sale returns"
```
