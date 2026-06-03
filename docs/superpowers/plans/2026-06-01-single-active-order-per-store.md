# Single Active Order Per Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that each store can have at most one `pending` or `confirmed` order at any time, with a clear UI dialog that guides users to the existing order.

**Architecture:** DB-level partial unique index prevents duplicates. App-level check before every order creation shows a dialog with View/Edit/Cancel. A shared check function and dialog component keep the logic DRY across all roles.

**Tech Stack:** Supabase Postgres (partial unique index), React/TypeScript, shadcn/ui AlertDialog

---

### Task 1: Database Migration — Partial Unique Index

**Files:**
- Create: `supabase/migrations/20260601000002_single_active_order_per_store.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Resolve existing duplicates by cancelling older orders for the same store
WITH ranked AS (
  SELECT id, store_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at DESC) as rn
  FROM orders
  WHERE status IN ('pending', 'confirmed')
)
UPDATE orders o
SET status = 'cancelled',
    cancellation_reason = 'Auto-cancelled: duplicate active order',
    updated_at = now()
FROM ranked r
WHERE o.id = r.id AND r.rn > 1;

-- Enforce: only one active (pending/confirmed) order per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_single_active_per_store
ON public.orders(store_id)
WHERE status IN ('pending', 'confirmed');
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` or apply via the Supabase dashboard SQL editor.
Expected: Index created, any existing duplicates resolved.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601000002_single_active_order_per_store.sql
git commit -m "feat(db): enforce one active order per store with partial unique index"
```

---

### Task 2: Shared Check Function — `src/lib/orders.ts`

**Files:**
- Create: `src/lib/orders.ts`

- [ ] **Step 1: Create the check function**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveOrderInfo {
  id: string;
  display_id: string;
  store_id: string;
  status: string;
}

export async function getActiveOrderForStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<ActiveOrderInfo | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, display_id, store_id, status")
    .eq("store_id", storeId)
    .in("status", ["pending", "confirmed"])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/orders.ts
git commit -m "feat: add getActiveOrderForStore shared check function"
```

---

### Task 3: Shared Dialog — `ActiveOrderExistsDialog`

**Files:**
- Create: `src/mobile/components/ActiveOrderExistsDialog.tsx`

- [ ] **Step 1: Write the dialog component**

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, PencilLine } from "lucide-react";

interface ActiveOrderExistsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderDisplayId: string;
  storeName: string;
  onView: () => void;
  onEdit: () => void;
}

export function ActiveOrderExistsDialog({
  open,
  onOpenChange,
  orderDisplayId,
  storeName,
  onView,
  onEdit,
}: ActiveOrderExistsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Active Order Already Exists</AlertDialogTitle>
          <AlertDialogDescription>
            Store <strong>{storeName}</strong> already has an active order (<strong>{orderDisplayId}</strong>).
            Each store can only have one pending or confirmed order at a time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onEdit} className="gap-2">
            <PencilLine className="h-4 w-4" />
            Edit Order
          </AlertDialogAction>
          <AlertDialogAction onClick={onView} className="gap-2">
            <Eye className="h-4 w-4" />
            View Order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mobile/components/ActiveOrderExistsDialog.tsx
git commit -m "feat: add ActiveOrderExistsDialog shared component"
```

---

### Task 4: AgentRoutes — Active Order Check + Navigation

**Files:**
- Modify: `src/mobile/pages/agent/AgentRoutes.tsx`

- [ ] **Step 1: Add imports for the check function and dialog**

Add after the existing imports:
```typescript
import { getActiveOrderForStore } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
```

- [ ] **Step 2: Add state for the active order dialog**

After existing state declarations (around line 313):
```typescript
const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
const [existingOrderStoreName, setExistingOrderStoreName] = useState("");
```

- [ ] **Step 3: Add the check before order creation in `handleCreateOrder`**

Right after `if (!createStoreId)` validation and before generating display_id (~line 504-505), add:

```typescript
      // Check for existing active order for this store
      const activeOrder = await getActiveOrderForStore(supabase, createStoreId);
      if (activeOrder) {
        const store = routeList.flatMap((r) => r.stores).find((s) => s.id === createStoreId);
        setExistingOrderStoreName(store?.name || "");
        setExistingOrderForStore(activeOrder);
        setCreateSaving(false);
        return;
      }
```

- [ ] **Step 4: Implement scroll-to-order navigation helper**

Add a function to scroll to a specific order in the orders list:
```typescript
  const scrollToOrder = (orderId: string) => {
    setView("orders");
    setTimeout(() => {
      const el = document.getElementById(`order-card-${orderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };
```

- [ ] **Step 5: Add the dialog JSX at the bottom of the component**

Before the closing `</div>` tag of the component, add:
```tsx
      <ActiveOrderExistsDialog
        open={!!existingOrderForStore}
        onOpenChange={(o) => { if (!o) setExistingOrderForStore(null); }}
        orderDisplayId={existingOrderForStore?.display_id || ""}
        storeName={existingOrderStoreName}
        onView={() => {
          const id = existingOrderForStore?.id;
          setExistingOrderForStore(null);
          if (id) scrollToOrder(id);
        }}
        onEdit={() => {
          const order = existingOrderForStore;
          if (!order) return;
          setExistingOrderForStore(null);
          setView("orders");
          setTimeout(() => {
            const found = allOrders?.find((o: any) => o.id === order.id);
            if (found) setEditOrder(found as any);
          }, 100);
        }}
      />
```

- [ ] **Step 6: Add `id` attribute to order cards for scroll target**

Find the order card wrapper div and add `id={`order-card-${order.id}`}`.

- [ ] **Step 7: Commit**

```bash
git add src/mobile/pages/agent/AgentRoutes.tsx
git commit -m "feat: add active order check to agent order creation"
```

---

### Task 5: MarketerOrders — Active Order Check + Navigation

**Files:**
- Modify: `src/mobile/pages/marketer/MarketerOrders.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { getActiveOrderForStore } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
```

- [ ] **Step 2: Add state**

```typescript
const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
const [existingOrderStoreName, setExistingOrderStoreName] = useState("");
```

- [ ] **Step 3: Add check before order creation**

Find the `handleCreateOrder` function. After the `createStoreId` validation and before the display_id RPC call, add:
```typescript
      const activeOrder = await getActiveOrderForStore(supabase, createStoreId);
      if (activeOrder) {
        // resolve store name from local state or from the stores list
        const store = storesList?.find((s: any) => s.id === createStoreId);
        setExistingOrderStoreName(store?.name || "");
        setExistingOrderForStore(activeOrder);
        setCreateSaving(false);
        return;
      }
```
(Use whatever store list variable is available in the component — adjust the lookup accordingly.)

- [ ] **Step 4: Add scroll-to-order function**

```typescript
  const scrollToOrder = (orderId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`order-card-${orderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };
```

- [ ] **Step 5: Add dialog JSX**

```tsx
      <ActiveOrderExistsDialog
        open={!!existingOrderForStore}
        onOpenChange={(o) => { if (!o) setExistingOrderForStore(null); }}
        orderDisplayId={existingOrderForStore?.display_id || ""}
        storeName={existingOrderStoreName}
        onView={() => {
          const id = existingOrderForStore?.id;
          setExistingOrderForStore(null);
          if (id) scrollToOrder(id);
        }}
        onEdit={() => {
          const order = existingOrderForStore;
          if (!order) return;
          setExistingOrderForStore(null);
          setTimeout(() => {
            const found = orders?.find((o: any) => o.id === order.id);
            if (found) setEditOrder(found as any);
          }, 100);
        }}
      />
```

- [ ] **Step 6: Add `id` attribute to order card wrapper**

- [ ] **Step 7: Commit**

```bash
git add src/mobile/pages/marketer/MarketerOrders.tsx
git commit -m "feat: add active order check to marketer order creation"
```

---

### Task 6: AdminOrders — Active Order Check + Navigation

**Files:**
- Modify: `src/mobile/pages/admin/AdminOrders.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { getActiveOrderForStore } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
```

- [ ] **Step 2: Add state**

```typescript
const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
const [existingOrderStoreName, setExistingOrderStoreName] = useState("");
```

- [ ] **Step 3: Add check before order creation**

Find `handleCreateOrder` and after the validation but before the insert:
```typescript
      const activeOrder = await getActiveOrderForStore(supabase, createStoreId);
      if (activeOrder) {
        const store = allStores?.find((s: any) => s.id === createStoreId);
        setExistingOrderStoreName(store?.name || "");
        setExistingOrderForStore(activeOrder);
        setCreateSaving(false);
        return;
      }
```
(Adjust `allStores` to whatever store list variable name is used.)

- [ ] **Step 4: Add scroll-to-order + dialog (same pattern as Tasks 4-5)**

- [ ] **Step 5: Add `id` attribute to order card wrapper**

- [ ] **Step 6: Commit**

```bash
git add src/mobile/pages/admin/AdminOrders.tsx
git commit -m "feat: add active order check to admin order creation"
```

---

### Task 7: CustomerOrders — Active Order Check + Navigation

**Files:**
- Modify: `src/mobile/pages/customer/CustomerOrders.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { getActiveOrderForStore } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
```

- [ ] **Step 2: Add state + check + dialog** (same pattern as Tasks 4-6)

CustomerOrders may only allow simple orders. Adapt the store selection / order creation accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/mobile/pages/customer/CustomerOrders.tsx
git commit -m "feat: add active order check to customer order creation"
```

---

### Task 8: Web Orders.tsx — Active Order Check

**Files:**
- Modify: `src/pages/Orders.tsx`

- [ ] **Step 1: Add import**

```typescript
import { getActiveOrderForStore } from "@/lib/orders";
```

- [ ] **Step 2: Add check before order creation**

Find the order creation handler (likely `handleAdd` or similar). After store selection validation and before the insert:
```typescript
      const activeOrder = await getActiveOrderForStore(supabase, selectedStoreId);
      if (activeOrder) {
        toast.error("Store already has an active order", {
          description: `Order ${activeOrder.display_id} is pending or confirmed for this store. Please fulfill or cancel it first.`,
        });
        return;
      }
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Orders.tsx
git commit -m "feat: add active order check to web orders page"
```

---

### Task 9: Verify — Lint + Tests

- [ ] **Step 1: Run lint**

```bash
npm run lint
```
Expected: No new errors from changed files (pre-existing warnings only).

- [ ] **Step 2: Run tests**

```bash
npm run test
```
Expected: All 159 tests pass.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git commit -m "fix: lint/test adjustments for active order enforcement"
```
