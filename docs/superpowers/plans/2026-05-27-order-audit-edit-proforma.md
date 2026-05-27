# Order Audit, Edit & Proforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audit trail to order cards, make Proforma visible to all staff, enable editing unfulfilled orders on mobile.

**Architecture:** New DB migration adds `updated_by`/`fulfilled_by` columns; a shared `EditOrderSheet` component handles both simple and detailed order editing; each mobile page adds profile joins, expandable audit row, Proforma button (where missing), and Edit button.

**Tech Stack:** Supabase (SQL migration), React + TypeScript + shadcn/ui (frontend)

---

### Task 1: Database migration — `updated_by` + `fulfilled_by` columns + RPC update

**Files:**
- Create: `supabase/migrations/20260527000002_orders_updated_by_fulfilled_by.sql`

- [ ] **Step 1: Create migration SQL**

```sql
-- Add updated_by column (nullable, FK to auth.users)
ALTER TABLE public.orders
  ADD COLUMN updated_by uuid REFERENCES auth.users(id);

-- Add fulfilled_by column (nullable, FK to auth.users)
ALTER TABLE public.orders
  ADD COLUMN fulfilled_by uuid REFERENCES auth.users(id);
```

- [ ] **Step 2: Update record_sale RPC to set fulfilled_by**

Read the current RPC to find the UPDATE statement that sets status='delivered'. Replace it to also set `fulfilled_by`:

```sql
UPDATE public.orders o SET
  status = 'delivered',
  delivered_at = now(),
  fulfilled_by = p_recorded_by
WHERE o.store_id = p_store_id AND o.status = 'pending'
AND EXISTS (...);
```

- [ ] **Step 3: Apply migration**

Run: Apply via `supabase_apply_migration`

---

### Task 2: Shared EditOrderSheet component

**Files:**
- Create: `src/components/orders/EditOrderSheet.tsx`

- [ ] **Step 1: Write the component skeleton**

```tsx
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, XCircle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface EditItem {
  product_id: string;
  quantity: number;
}

interface EditOrderSheetProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditOrderSheet({ order, open, onOpenChange, onSaved }: EditOrderSheetProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<EditItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reset form when order changes
  useEffect(() => {
    if (!order) return;
    setRequirementNote(order.requirement_note || "");
    if (order.order_type === "detailed" && order.order_items) {
      setOrderItems(
        order.order_items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }))
      );
    } else {
      setOrderItems([{ product_id: "", quantity: 1 }]);
    }
    setLoadError(null);
  }, [order]);

  // Products for the store's store_type
  const storeTypeId = order?.stores?.store_type_id;
  const storeId = order?.store_id;

  const { data: products = [] } = useQuery({
    queryKey: ["edit-order-products", storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) return [];
      const { data: typeProducts } = await supabase
        .from("store_type_products")
        .select("product_id")
        .eq("store_type_id", storeTypeId);
      const productIds = (typeProducts || []).map((tp: any) => tp.product_id);
      if (productIds.length === 0) return [];
      const { data: products } = await supabase
        .from("products")
        .select("id, name, base_price")
        .in("id", productIds)
        .eq("is_active", true)
        .order("name");
      // Get store-specific or store-type pricing
      const { data: storePrices } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", storeId);
      const storePriceMap = new Map((storePrices || []).map((sp: any) => [sp.product_id, sp.price]));
      const { data: typePrices } = await supabase
        .from("store_type_pricing")
        .select("product_id, price")
        .eq("store_type_id", storeTypeId);
      const typePriceMap = new Map((typePrices || []).map((tp: any) => [tp.product_id, tp.price]));
      return ((products || []) as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        effective_price: storePriceMap.get(p.id) ?? typePriceMap.get(p.id) ?? Number(p.base_price) ?? 0,
      }));
    },
    enabled: open && !!storeTypeId,
  });

  const addItem = () => setOrderItems((prev) => [...prev, { product_id: "", quantity: 1 }]);
  const removeItem = (index: number) => setOrderItems((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!order || !user) return;
    if (order.order_type === "simple" && !requirementNote.trim()) {
      toast.error("Requirement note cannot be empty");
      return;
    }
    if (order.order_type === "detailed" && !orderItems.some((item) => item.product_id)) {
      toast.error("Add at least one product");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          requirement_note: order.order_type === "simple" ? requirementNote : (requirementNote || null),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (updateError) throw updateError;

      if (order.order_type === "detailed") {
        // Delete old items, insert new ones
        const { error: deleteError } = await supabase
          .from("order_items")
          .delete()
          .eq("order_id", order.id);
        if (deleteError) throw deleteError;

        const validItems = orderItems.filter((item) => item.product_id);
        if (validItems.length > 0) {
          const { error: insertError } = await supabase
            .from("order_items")
            .insert(
              validItems.map((item) => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
              }))
            );
          if (insertError) throw insertError;
        }
      }

      toast.success("Order updated");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Edit Order {order?.display_id}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {order?.order_type === "simple" ? (
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Requirement Note
                </Label>
                <Textarea
                  value={requirementNote}
                  onChange={(e) => setRequirementNote(e.target.value)}
                  placeholder="What does the store need?"
                  rows={3}
                  className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Products</Label>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products available for this store</p>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-[1fr_90px_36px] gap-2">
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => {
                            setOrderItems((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, product_id: value } : row))
                            );
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-10 border-slate-200 dark:border-slate-600">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — ₹{p.effective_price}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, Number(e.target.value || 1));
                            setOrderItems((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, quantity: qty } : row))
                            );
                          }}
                          className="h-10 rounded-xl"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-9 rounded-xl"
                          onClick={() => removeItem(index)}
                          disabled={orderItems.length === 1}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                    Requirement Note (optional)
                  </Label>
                  <Textarea
                    value={requirementNote}
                    onChange={(e) => setRequirementNote(e.target.value)}
                    placeholder="Additional notes..."
                    rows={2}
                    className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full h-11 rounded-xl"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/EditOrderSheet.tsx
git commit -m "feat: add shared EditOrderSheet component"
```

---

### Task 3: AdminOrders — profile joins + expandable audit + Edit button

**Files:**
- Modify: `src/mobile/pages/admin/AdminOrders.tsx`

- [ ] **Step 1: Add profile joins to the query**

Add to the Supabase select:
```
creator_profile:profiles!orders_created_by_fkey(full_name),
updater_profile:profiles!orders_updated_by_fkey(full_name),
fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name)
```

Update the `Order` interface to include:
```tsx
creator_profile?: { full_name: string } | null;
updater_profile?: { full_name: string } | null;
fulfiller_profile?: { full_name: string } | null;
```

- [ ] **Step 2: Add expandable audit section to each card**

Between the card body (closing `</div>` at line ~636) and the action buttons (line ~639), add:

```tsx
{/* Audit trail */}
<div className="border-t border-border/50 px-3 py-1.5">
  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
    <span>Created by {order.creator_profile?.full_name || "—"}</span>
    {order.updater_profile && order.updater_profile.full_name !== order.creator_profile?.full_name && (
      <>
        <span className="text-muted-foreground/40">•</span>
        <span>Edited by {order.updater_profile.full_name}</span>
      </>
    )}
    {(order.status === "delivered" || order.fulfiller_profile) && (
      <>
        <span className="text-muted-foreground/40">•</span>
        <span>Fulfilled by {order.fulfiller_profile?.full_name || "—"}</span>
      </>
    )}
  </div>
</div>
```

- [ ] **Step 3: Add Edit button and EditOrderSheet**

Add import:
```tsx
import { EditOrderSheet } from "@/components/orders/EditOrderSheet";
```

Add state:
```tsx
const [editOrder, setEditOrder] = useState<Order | null>(null);
```

Add Edit button in the action buttons row (show for `pending` or `confirmed`):
```tsx
{order.status !== "delivered" && order.status !== "cancelled" && (
  <button
    onClick={() => setEditOrder(order)}
    className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-colors border-r border-border/50"
  >
    <Edit className="h-3.5 w-3.5 shrink-0" />
    <span className="truncate">Edit</span>
  </button>
)}
```

Add import for `Edit` icon from lucide-react.

Add the EditOrderSheet before closing `</div>`:
```tsx
<EditOrderSheet
  order={editOrder}
  open={!!editOrder}
  onOpenChange={(o) => { if (!o) setEditOrder(null); }}
  onSaved={() => qc.invalidateQueries({ queryKey: ["mobile-orders"] })}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/mobile/pages/admin/AdminOrders.tsx
git commit -m "feat(admin-orders): add audit trail, edit button, profile joins"
```

---

### Task 4: AgentRoutes — profile joins + expandable audit + Proforma fix + Edit button

**Files:**
- Modify: `src/mobile/pages/agent/AgentRoutes.tsx`

- [ ] **Step 1: Add profile joins to the query**

Add to the select (line ~196):
```
creator_profile:profiles!orders_created_by_fkey(full_name),
updater_profile:profiles!orders_updated_by_fkey(full_name),
fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name)
```

Add to `OrderRow` interface:
```tsx
creator_profile?: { full_name: string } | null;
updater_profile?: { full_name: string } | null;
fulfiller_profile?: { full_name: string } | null;
```

- [ ] **Step 2: Add expandable audit section to each card**

Between the card body and the action buttons bar (after line ~1038), add the audit trail div (same pattern as Task 3 Step 2, adapted for AgentRoutes styling).

- [ ] **Step 3: Remove pending-only guard on Proforma button**

Change line ~1051-1057 from:
```tsx
{order.status === "pending" && (
  <>
    <button onClick={() => { setViewProformaId(order.id); }}>Proforma</button>
    ...
  </>
)}
```
to:
```tsx
<button onClick={() => { setViewProformaId(order.id); }}>Proforma</button>
```
So the Proforma button is always visible regardless of status.

- [ ] **Step 4: Add Edit button + EditOrderSheet import/state**

Import `EditOrderSheet` and `Edit` icon. Add state `[editOrder, setEditOrder]`. Add Edit button for pending/confirmed orders. Add `EditOrderSheet` at the bottom (same pattern as Task 3 Step 3).

- [ ] **Step 5: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/mobile/pages/agent/AgentRoutes.tsx
git commit -m "feat(agent-orders): add audit trail, edit button, proforma for all statuses"
```

---

### Task 5: OperatorOrders — Proforma button + profile joins + audit + Edit

**Files:**
- Modify: `src/mobile/pages/operator/OperatorOrders.tsx`

- [ ] **Step 1: Add ProformaView import + dialog state**

Import:
```tsx
import { ProformaView } from "@/components/orders/ProformaView";
```

Add state:
```tsx
const [viewProformaId, setViewProformaId] = useState<string | null>(null);
```

Add Proforma query (same pattern as AdminOrders lines 113-134, referencing operator orders query key):
```tsx
const { data: viewProforma } = useQuery({
  queryKey: ["operator-view-proforma", viewProformaId],
  queryFn: async () => {
    if (!viewProformaId) return null;
    const order = allOrders.find((o: any) => o.id === viewProformaId);
    const { data: pf } = await supabase.from("proforma_invoices").select("*").eq("order_id", viewProformaId).maybeSingle();
    if (!pf) return null;
    return {
      id: pf.id, display_id: pf.display_id, order_id: pf.order_id,
      store_name: order?.stores?.name || "—",
      customer_name: order?.customers?.name || "—",
      customer_phone: (order as any)?.customers?.phone || "—",
      items: pf.items || [], total_amount: Number(pf.total_amount) || 0,
      status: pf.status, created_at: pf.created_at,
    };
  },
  enabled: !!viewProformaId,
});
```

Add Proforma button in the card action buttons:
```tsx
<button
  onClick={() => setViewProformaId(order.id)}
  className="flex-1 py-2.5 flex items-center justify-center gap-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
>
  <FileText className="h-3.5 w-3.5" />
  Proforma
</button>
```

Add `FileText` to lucide imports.

Add Proforma dialog before closing `</div>`:
```tsx
<Dialog open={!!viewProformaId && !!viewProforma} onOpenChange={(o) => { if (!o) setViewProformaId(null); }}>
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Proforma Invoice</DialogTitle></DialogHeader>
    {viewProforma && <ProformaView proforma={viewProforma} />}
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Add profile joins to the query + interface**

Add to select and `Order` interface (same pattern as Task 3 Step 1).

- [ ] **Step 3: Add expandable audit section**

Same pattern as Task 3 Step 2, placed between card body and action buttons.

- [ ] **Step 4: Add Edit button + EditOrderSheet**

Same pattern as Task 3 Step 3. Add `Edit` icon import.

- [ ] **Step 5: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/mobile/pages/operator/OperatorOrders.tsx
git commit -m "feat(operator-orders): add proforma, audit trail, edit button"
```

---

### Task 6: MarketerOrders — Proforma button + profile joins + audit + Edit

**Files:**
- Modify: `src/mobile/pages/marketer/MarketerOrders.tsx`

- [ ] **Step 1: Add ProformaView import + dialog state**

Same pattern as Task 5 Step 1, adapted for MarketerOrders query key `["mobile-marketer-orders"]`.

- [ ] **Step 2: Add profile joins to the query + interface**

Add to query select (line ~115) and `OrderRow` interface. Already has `created_by` filter (only shows own orders), so creator is implicitly the current user, but fulfiller/editor could differ.

- [ ] **Step 3: Add expandable audit section**

Same pattern as Task 3 Step 2.

- [ ] **Step 4: Add Edit button + EditOrderSheet**

Same pattern as Task 3 Step 3. Show for pending/confirmed orders.

- [ ] **Step 5: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/mobile/pages/marketer/MarketerOrders.tsx
git commit -m "feat(marketer-orders): add proforma, audit trail, edit button"
```

---

### Task 7: Web Orders.tsx — profile joins + expandable audit

**Files:**
- Modify: `src/pages/Orders.tsx`

- [ ] **Step 1: Add profile joins to the data query**

Find the main orders query and add:
```
creator_profile:profiles!orders_created_by_fkey(full_name),
updater_profile:profiles!orders_updated_by_fkey(full_name),
fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name)
```

Update the `OrderRecord` interface or the data shape.

- [ ] **Step 2: Add expandable audit to the mobile card render**

In the `renderMobileCard` function (line ~1626), between the total line and the action buttons, add the same audit trail pattern.

The web page already has Proforma and Edit — only audit trail is missing.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Orders.tsx
git commit -m "feat(web-orders): add audit trail to mobile cards"
```

---

### Task 8: Update frontend order update calls to set updated_by

**Files:**
- Modify: Various files that UPDATE orders (transfer, edit web, etc.)

- [ ] **Step 1: Search all `.update(` calls on orders table**

Grep for `.from("orders").update(` across the codebase. For each call that doesn't already set `updated_by`, add `updated_by: user.id` alongside the existing updates.

Key locations (other than the shared EditOrderSheet which already does it):
- `AdminOrders.tsx` transfer (line ~377): add `updated_by: user.id`
- `Orders.tsx` transfer (line ~884-887): add `updated_by: user.id`
- `Orders.tsx` edit order (line ~701-713): add `updated_by: user.id`
- `AgentRoutes.tsx` fulfill: handled by RPC (already sets fulfilled_by)
- Cancel operations: These set `cancelled_by` specifically — do NOT override with `updated_by`

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: set updated_by on all order update operations"
```

---

### Task 9: Build and verify APK

**Files:** none

- [ ] **Step 1: Full web build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 2: Copy to Capacitor**

Run: `npx cap copy android`

- [ ] **Step 3: Build APK**

Run: `./gradlew assembleDebug` (in `android/`)

- [ ] **Step 4: Install on device**

Run: `adb uninstall com.aquaprime.app && adb install android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 5: Verify TypeScript has 0 errors**

Run: `npx tsc --noEmit`
Expected: No output (0 errors)
