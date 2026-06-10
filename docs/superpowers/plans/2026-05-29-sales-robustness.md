# Sales & Returns Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task.

**Goal:** Fix record_sale RPC (stock deduction + credit limit gating), remove proximity from sales, add backdate permission, build robust sale-return flow with stock/wastage/balance reversal.

**Architecture:** All business logic in DB RPCs (record_sale, record_sale_return), UI only orchestrates calls. Credit limit gated by company_settings toggle. Stock deducted atomically inside RPC with FOR UPDATE locks.

**Tech Stack:** PostgreSQL (Supabase RPCs), React/TypeScript (web + mobile), zod (validation)

---

### Task 1: Fix `record_sale` RPC — stock deduction + credit limit gating + stock locks

**Files:**
- Create: `supabase/migrations/20260529000001_fix_record_sale_stock_credit.sql`
- Modify: `src/pages/Sales.tsx:610-633` (remove proximity check)
- Modify: `src/mobile/pages/agent/AgentRecord.tsx:250-262` (remove proximity check)

**Step 1.1: Create the migration**

```sql
-- Fix record_sale: restore staff_stock check + DEDUCTION, credit limit gated by setting,
-- lock stock rows FOR UPDATE, restore outstanding validation, keep warehouse_id fix

DROP FUNCTION IF EXISTS public.record_sale(TEXT, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ, NUMERIC);

CREATE OR REPLACE FUNCTION public.record_sale(
  p_display_id            TEXT,
  p_store_id              UUID,
  p_customer_id           UUID,
  p_recorded_by           UUID,
  p_logged_by             UUID,
  p_total_amount          NUMERIC,
  p_cash_amount           NUMERIC,
  p_upi_amount            NUMERIC,
  p_outstanding_amount    NUMERIC,
  p_sale_items            JSONB,
  p_created_at            TIMESTAMPTZ DEFAULT NULL,
  p_expected_outstanding  NUMERIC DEFAULT NULL
)
RETURNS TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_warehouse_id UUID;
    v_target_user_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_available_stock NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_stock_lock RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Resolve warehouse
    SELECT COALESCE(
      (SELECT warehouse_id FROM public.user_roles WHERE user_id = p_recorded_by AND warehouse_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1),
      (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
    ) INTO v_warehouse_id;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    -- Resolve caller role and target
    SELECT role INTO v_caller_role FROM public.user_roles WHERE user_id = p_recorded_by LIMIT 1;
    v_caller_is_admin := v_caller_role IN ('super_admin', 'manager');
    v_target_user_id := p_recorded_by;

    -- Check if target has staff_stock (if not, use product_stock)
    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id) INTO v_has_staff_stock;

    -- LOCK store row + fetch outstanding
    SELECT s.outstanding, s.store_type_id
    INTO v_old_outstanding, v_store_type_id
    FROM public.stores s WHERE s.id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    -- Optimistic concurrency check
    IF p_expected_outstanding IS NOT NULL AND p_expected_outstanding != v_old_outstanding THEN
        RAISE EXCEPTION 'concurrent_modification: expected=%, actual=%', p_expected_outstanding, v_old_outstanding
            USING HINT = 'The store outstanding was modified by another transaction. Refresh and retry.';
    END IF;

    -- Validate outstanding math
    v_computed_outstanding := GREATEST(p_total_amount - COALESCE(p_cash_amount, 0) - COALESCE(p_upi_amount, 0), 0);
    IF p_outstanding_amount != v_computed_outstanding THEN
        RAISE EXCEPTION 'outstanding_mismatch: computed=%, provided=%', v_computed_outstanding, p_outstanding_amount;
    END IF;

    v_new_outstanding := v_old_outstanding + v_computed_outstanding;

    -- Credit limit check — gated by company_settings
    SELECT value INTO v_credit_limit_check FROM public.company_settings WHERE key = 'credit_limit_check';
    IF v_credit_limit_check = 'true' AND NOT v_caller_is_admin THEN
        -- Resolve credit limit from customer override or store type
        SELECT c.kyc_status, c.credit_limit_override
        INTO v_kyc_status, v_credit_limit_override
        FROM public.customers c WHERE c.id = p_customer_id;

        IF v_credit_limit_override IS NOT NULL THEN
            v_credit_limit := v_credit_limit_override;
        ELSE
            SELECT CASE WHEN v_kyc_status IN ('verified', 'approved')
                THEN COALESCE(credit_limit_kyc, 0)
                ELSE COALESCE(credit_limit_no_kyc, 0)
            END INTO v_credit_limit
            FROM public.store_types WHERE id = v_store_type_id;
        END IF;

        IF v_credit_limit > 0 AND v_new_outstanding > v_credit_limit THEN
            RAISE EXCEPTION 'credit_limit_exceeded';
        END IF;
    END IF;

    -- LOCK stock rows + pre-check + DEDUCT in one pass
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

        IF v_has_staff_stock THEN
            -- Lock staff_stock row and check
            SELECT ss.quantity INTO v_available_stock
            FROM public.staff_stock ss
            WHERE ss.user_id = v_target_user_id
              AND ss.product_id = v_product_id
              AND ss.warehouse_id = v_warehouse_id
            FOR UPDATE;

            v_available_stock := COALESCE(v_available_stock, 0);

            IF v_available_stock >= v_quantity THEN
                -- Deduct from staff_stock
                UPDATE public.staff_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE user_id = v_target_user_id
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;
            ELSE
                -- Fall through to product_stock check
                v_available_stock := 0;
            END IF;
        END IF;

        -- If no staff_stock OR insufficient staff_stock, try product_stock
        IF NOT v_has_staff_stock OR v_available_stock < v_quantity THEN
            -- Lock and check product_stock
            SELECT ps.quantity INTO v_available_stock
            FROM public.product_stock ps
            WHERE ps.product_id = v_product_id AND ps.warehouse_id = v_warehouse_id
            FOR UPDATE;

            v_available_stock := COALESCE(v_available_stock, 0);

            IF v_available_stock >= v_quantity THEN
                -- Deduct from product_stock
                UPDATE public.product_stock
                SET quantity = quantity - v_quantity, updated_at = now()
                WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
            ELSE
                v_insufficient_products := array_append(v_insufficient_products,
                    COALESCE(v_product_name, 'Product ' || v_product_id::TEXT));
            END IF;
        END IF;
    END LOOP;

    IF array_length(v_insufficient_products, 1) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock: %', array_to_string(v_insufficient_products, ', ');
    END IF;

    -- Insert sale
    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by
    ) VALUES (
        p_display_id, p_store_id, p_customer_id, p_recorded_by, p_logged_by,
        p_total_amount, p_cash_amount, p_upi_amount, v_computed_outstanding,
        v_old_outstanding, v_new_outstanding, COALESCE(p_created_at, now()),
        v_warehouse_id, p_recorded_by
    ) RETURNING id INTO v_sale_id;

    -- Insert sale items with warehouse_id
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, warehouse_id)
    SELECT v_sale_id,
        (item->>'product_id')::UUID,
        (item->>'quantity')::NUMERIC,
        (item->>'unit_price')::NUMERIC,
        (item->>'total_price')::NUMERIC,
        v_warehouse_id
    FROM jsonb_array_elements(p_sale_items) AS item;

    -- Auto-fulfill pending orders for this store
    UPDATE public.orders o SET status = 'delivered', delivered_at = now(), fulfilled_by = p_recorded_by
    WHERE o.store_id = p_store_id AND o.status = 'pending'
    AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = o.id
        AND oi.product_id IN (
            SELECT (item->>'product_id')::UUID FROM jsonb_array_elements(p_sale_items) AS item
        )
    );

    -- Recalculate running balances if backdated
    IF p_created_at IS NOT NULL THEN
        PERFORM public.recalc_running_balances(p_store_id);
    END IF;

    RETURN QUERY SELECT v_sale_id, p_display_id, v_new_outstanding, TRUE;
END;
$$;
```

**Step 1.2: Remove proximity check from web Sales.tsx**

Delete lines 610-633 (the entire proximity check block):

Old:
```typescript
  // Proximity check for agents (only if geofencing is enabled)
  if (role === "agent" && selectedStore) {
    const { data: locSetting } = await supabase.from("company_settings").select("value").eq("key", "location_validation").maybeSingle();
    if (locSetting?.value === "true") {
      const { checkProximity } = await import("@/lib/proximity");
      const result = await checkProximity(
        selectedStore.lat ?? null,
        selectedStore.lng ?? null,
        { noGpsHandling: "require_manager_override", userRole: role }
      );
      if (!result.withinRange) {
        if (result.requiresManagerOverride) {
          toast.error(result.message + " Please ask a manager to update the store's GPS coordinates.");
        } else {
          toast.error(result.message);
        }
        setSaving(false);
        return;
      }
      if (result.skippedNoGps) {
        toast.warning("Store has no GPS coordinates — location check skipped");
      }
    }
  }
```

**Step 1.3: Remove proximity check from mobile AgentRecord.tsx**

Delete lines 250-262:
```typescript
    // Proximity check for agents (mirrors web Sales.tsx)
    if (role === "agent" && store) {
      const { data: locSetting } = await supabase.from("company_settings").select("value").eq("key", "location_validation").maybeSingle();
      if (locSetting?.value === "true") {
        const result = await checkProximity(store.lat, store.lng, { noGpsHandling: "require_manager_override", userRole: role });
        if (!result.withinRange) {
          toast.error(result.requiresManagerOverride ? result.message + " Please ask a manager to update the store's GPS coordinates." : result.message);
          setSaving(false);
          return;
        }
        if (result.skippedNoGps) toast.warning("Store has no GPS coordinates — location check skipped");
      }
    }
```

Also remove the import: `import { checkProximity } from "@/lib/proximity";` (line 20)

---

### Task 2: Add `backdate` permission + `credit_limit_check` setting

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/components/access/UserPermissionsPanel.tsx`
- Modify: `src/pages/Settings.tsx` (add toggle)
- Modify: `supabase/migrations/20260529000001_fix_record_sale_stock_credit.sql` (add seed)

**Step 2.1: Add `backdate` to PermissionKey in UserPermissionsPanel.tsx**

Add `"backdate"` to the PermissionKey union type:

```typescript
export type PermissionKey =
  // General
  | "price_override" | "record_behalf" | "create_customers" | "create_stores"
  | "edit_balance" | "opening_balance" | "finalizer" | "see_handover_balance"
  | "submit_expenses" | "manage_expense_access" | "approve_expenses"
  // Handover
  | "modify_handovers" | "cancel_any_handover" | "adjust_holding_balance"
  // Sales
  | "record_sale" | "backdate"
  // rest unchanged...
```

**Step 2.2: Add `backdate` to ROLE_DEFAULTS in permissions.ts**

```typescript
// In the ROLE_DEFAULTS object, add backdate: true for admin/manager:
super_admin: { ... , backdate: true },
manager: { ... , backdate: true },
// Others get nothing (backdate not listed = false)
```

Also add `backdate` to `ALL_PERMISSION_KEYS` and `PERMISSION_GROUPS`:

```typescript
export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  // ... existing
  "backdate",
];

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: "Sales & Pricing",
    permissions: ["record_sale", "backdate", "create_sale_returns", ...],
  },
  // ...
];
```

**Step 2.3: Add `credit_limit_check` seed data to the migration**

Add to `20260529000001_fix_record_sale_stock_credit.sql`:

```sql
-- Seed credit_limit_check setting if not exists
INSERT INTO public.company_settings (key, value)
VALUES ('credit_limit_check', 'false')
ON CONFLICT (key) DO NOTHING;
```

**Step 2.4: Add toggle in Settings.tsx**

Find the settings toggles section and add:

```tsx
// In the settings toggles section
{renderFeatureToggle?.(
  "credit_limit_check",
  "Credit Limit Check",
  "Enforce credit limits when recording sales. If disabled, sales are allowed even if outstanding exceeds limit."
)}
```

---

### Task 3: Wire `backdate` permission in web + mobile sales forms

**Files:**
- Modify: `src/pages/Sales.tsx`
- Modify: `src/mobile/pages/agent/AgentRecord.tsx`

**Step 3.1: Web Sales.tsx — use backdate permission instead of isAdmin**

Add `usePermission("backdate")` near the other permission hooks (line 167-168):

```typescript
const { allowed: canOverridePrice } = usePermission("price_override");
const { allowed: canRecordBehalf } = usePermission("record_behalf");
const { allowed: canBackdate } = usePermission("backdate");
```

Change line 1462 from:
```typescript
{isAdmin && (
```
to:
```typescript
{canBackdate && (
```

**Step 3.2: Mobile AgentRecord.tsx — use backdate permission instead of isAdmin**

Add near line 35-36:
```typescript
const { allowed: canOverridePrice } = usePermission("price_override");
const { allowed: canRecordBehalf } = usePermission("record_behalf");
const { allowed: canBackdate } = usePermission("backdate");
```

Change line 519 from:
```typescript
{isAdmin && (
```
to:
```typescript
{canBackdate && (
```

---

### Task 4: Add `p_expected_outstanding` to mobile AgentRecord.tsx RPC call

**Files:**
- Modify: `src/mobile/pages/agent/AgentRecord.tsx`

**Step 4.1: Add p_expected_outstanding to the RPC call**

Find the RPC call around line 328-340:

Old:
```typescript
const { data: saleResult, error } = await (supabase as any).rpc("record_sale", {
  p_display_id: displayId,
  p_store_id: store.id,
  p_customer_id: store.customer_id,
  p_recorded_by: effectiveRecordedBy,
  p_logged_by: loggedBy,
  p_total_amount: totalAmount,
  p_cash_amount: cash,
  p_upi_amount: upi,
  p_outstanding_amount: outstandingFromSale,
  p_sale_items: saleItems,
  p_created_at: saleDate ? new Date(saleDate).toISOString() : null,
});
```

New:
```typescript
const { data: saleResult, error } = await (supabase as any).rpc("record_sale", {
  p_display_id: displayId,
  p_store_id: store.id,
  p_customer_id: store.customer_id,
  p_recorded_by: effectiveRecordedBy,
  p_logged_by: loggedBy,
  p_total_amount: totalAmount,
  p_cash_amount: cash,
  p_upi_amount: upi,
  p_outstanding_amount: outstandingFromSale,
  p_sale_items: saleItems,
  p_created_at: saleDate ? new Date(saleDate).toISOString() : null,
  p_expected_outstanding: store?.outstanding ?? null,
});
```

---

### Task 5: Build `record_sale_return` RPC — stock reversal + wastage + balance

**Files:**
- Create: `supabase/migrations/20260529000002_record_sale_return_rpc.sql`

**Step 5.1: Create the return RPC**

```sql
-- record_sale_return: reverse a sale (partial or full), reverse stock or mark as wastage,
-- reduce outstanding, prevent re-return of same items

CREATE TABLE IF NOT EXISTS public.sale_return_tracked_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL,
    sale_item_id UUID NOT NULL,
    product_id UUID NOT NULL,
    returned_qty NUMERIC NOT NULL,
    damaged_qty NUMERIC DEFAULT 0,
    unit_price NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id           UUID,
    p_returned_by       UUID,
    p_reason            TEXT,
    p_items             JSONB,  -- [{sale_item_id, product_id, return_qty, damaged_qty, unit_price}]
    p_created_at        TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(return_id UUID, display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_display_id TEXT;
    v_sale RECORD;
    v_warehouse_id UUID;
    v_item JSONB;
    v_sale_item_id UUID;
    v_product_id UUID;
    v_return_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_total_return_amount NUMERIC := 0;
    v_previously_returned NUMERIC;
    v_original_qty NUMERIC;
    v_remaining_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_target_user_id UUID;
    v_agent_holding TEXT;
    v_old_outstanding NUMERIC;
    v_cash_amount NUMERIC;
    v_upi_amount NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock & fetch the sale
    SELECT * INTO v_sale
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale % not found', p_sale_id;
    END IF;

    v_old_outstanding := v_sale.outstanding_amount;
    v_warehouse_id := COALESCE(v_sale.warehouse_id, (
        SELECT id FROM public.warehouses LIMIT 1
    ));
    v_target_user_id := v_sale.recorded_by;

    SELECT EXISTS (SELECT 1 FROM public.staff_stock WHERE user_id = v_target_user_id)
    INTO v_has_staff_stock;

    -- Generate display ID
    SELECT COALESCE(
        (SELECT display_id FROM public.sales WHERE id = p_sale_id),
        'SR-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT
    ) || '-RETURN' INTO v_display_id;

    -- Create return header
    INSERT INTO public.sale_returns (sale_id, returned_by, reason, display_id, created_at, warehouse_id)
    VALUES (p_sale_id, p_returned_by, p_reason, v_display_id, COALESCE(p_created_at, now()), v_warehouse_id)
    RETURNING id INTO v_return_id;

    -- Process each returned item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item->>'sale_item_id')::UUID;
        v_product_id := (v_item->>'product_id')::UUID;
        v_return_qty := (v_item->>'return_qty')::NUMERIC;
        v_damaged_qty := COALESCE((v_item->>'damaged_qty')::NUMERIC, 0);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        -- Validate damaged_qty <= return_qty
        IF v_damaged_qty > v_return_qty THEN
            RAISE EXCEPTION 'Damaged quantity (%) exceeds return quantity (%)', v_damaged_qty, v_return_qty;
        END IF;

        -- Get original sale item quantity
        SELECT quantity INTO v_original_qty
        FROM public.sale_items WHERE id = v_sale_item_id AND sale_id = p_sale_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found on this sale', v_sale_item_id;
        END IF;

        -- Check previously returned qty
        SELECT COALESCE(SUM(returned_qty), 0) INTO v_previously_returned
        FROM public.sale_return_tracked_items
        WHERE sale_item_id = v_sale_item_id;

        v_remaining_qty := v_original_qty - v_previously_returned;

        IF v_return_qty > v_remaining_qty THEN
            RAISE EXCEPTION 'Cannot return % of item (only % remaining after previous returns)',
                v_return_qty, v_remaining_qty;
        END IF;

        -- Track the return
        INSERT INTO public.sale_return_tracked_items (
            return_id, sale_item_id, product_id,
            returned_qty, damaged_qty, unit_price, subtotal
        ) VALUES (
            v_return_id, v_sale_item_id, v_product_id,
            v_return_qty, v_damaged_qty, v_unit_price,
            v_return_qty * v_unit_price
        );

        -- Revenue from return items (for outstanding calculation)
        v_subtotal := v_return_qty * v_unit_price;
        v_total_return_amount := v_total_return_amount + v_subtotal;

        -- Restock non-damaged items
        IF (v_return_qty - v_damaged_qty) > 0 THEN
            IF v_has_staff_stock THEN
                UPDATE public.staff_stock
                SET quantity = quantity + (v_return_qty - v_damaged_qty), updated_at = now()
                WHERE user_id = v_target_user_id
                  AND product_id = v_product_id
                  AND warehouse_id = v_warehouse_id;

                IF NOT FOUND THEN
                    INSERT INTO public.staff_stock (user_id, product_id, quantity, warehouse_id)
                    VALUES (v_target_user_id, v_product_id, (v_return_qty - v_damaged_qty), v_warehouse_id);
                END IF;
            ELSE
                UPDATE public.product_stock
                SET quantity = quantity + (v_return_qty - v_damaged_qty), updated_at = now()
                WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

                IF NOT FOUND THEN
                    INSERT INTO public.product_stock (product_id, quantity, warehouse_id)
                    VALUES (v_product_id, (v_return_qty - v_damaged_qty), v_warehouse_id);
                END IF;
            END IF;
        END IF;

        -- Track damaged/wastage
        IF v_damaged_qty > 0 THEN
            INSERT INTO public.wastage_entries (
                product_id, quantity, reason, source, source_id,
                warehouse_id, recorded_by, created_at
            ) VALUES (
                v_product_id, v_damaged_qty,
                'Sale return damaged: ' || COALESCE(p_reason, 'No reason'),
                'sale_return', p_sale_id,
                v_warehouse_id, p_returned_by, now()
            );
        END IF;
    END LOOP;

    -- Calculate new outstanding
    -- Reduce outstanding by the return amount, but don't go below 0
    -- First reduce outstanding until 0, remainder becomes credit
    IF v_sale.paid_amount = 0 THEN
        v_cash_amount := v_sale.cash_amount;
        v_upi_amount := v_sale.upi_amount;
    END IF;

    -- Determine how much of the return to apply to outstanding vs paid amounts
    -- Strategy: reduce outstanding first (no cash movement), then reduce payments if needed
    v_new_outstanding := GREATEST(v_old_outstanding - v_total_return_amount, 0);

    -- Update sale outstanding
    UPDATE public.sales
    SET outstanding_amount = v_new_outstanding,
        updated_at = now()
    WHERE id = p_sale_id;

    -- Recalculate running balances
    PERFORM public.recalc_running_balances(v_sale.store_id);

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;
```

---

### Task 6: Update sale return UI for partial returns + wastage

**Files:**
- Modify: `src/components/sales/SaleReturnDialog.tsx`

**Step 6.1: Read the current SaleReturnDialog.tsx to understand the existing structure.**

Then update it to:
1. Show sale items with return qty inputs
2. Add "Damaged" checkbox per item → shows wastage qty field
3. Show running total of return amount
4. Show new outstanding preview
5. Reason dropdown (Damage/Defect/Expired/Other)

---

### Task 7: Add sale return notification dispatch

**Files:**
- Modify: `src/pages/SaleReturns.tsx` or wherever the return is submitted

**Step 7.1: After successful return, dispatch notifications**

```typescript
// After return RPC succeeds
logActivity(user.id, "Processed sale return", "sale_return", displayId, returnId, { saleId: p_sale_id, reason });
getAdminUserIds().then((ids) => {
  const others = ids.filter((id) => id !== user.id);
  if (others.length > 0) {
    sendNotificationToMany(others, {
      title: "Sale Return Processed",
      message: `Return for sale #${displayId} — ₹${totalReturnAmount}`,
      type: "payment",
      entityType: "sale_return",
      entityId: returnId,
    });
  }
});
```

---

### File Structure Summary

| Action | File | What |
|--------|------|------|
| Create | `supabase/migrations/20260529000001_fix_record_sale_stock_credit.sql` | Fixed RPC + credit_limit_check seed |
| Create | `supabase/migrations/20260529000002_record_sale_return_rpc.sql` | Return RPC |
| Modify | `src/pages/Sales.tsx` | Remove proximity, switch to canBackdate |
| Modify | `src/mobile/pages/agent/AgentRecord.tsx` | Remove proximity, switch to canBackdate, add p_expected_outstanding |
| Modify | `src/lib/permissions.ts` | Add backdate to types + defaults |
| Modify | `src/components/access/UserPermissionsPanel.tsx` | Add backdate to PermissionKey |
| Modify | `src/pages/Settings.tsx` | Add credit_limit_check toggle |
| Modify | `src/components/sales/SaleReturnDialog.tsx` | Full return flow UI |
