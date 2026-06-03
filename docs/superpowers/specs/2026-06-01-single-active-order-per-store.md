# Single Active Order Per Store

## Goal
A store can have at most one order with status `pending` or `confirmed`.
If a user attempts to create a new order for a store that already has one,
show a dialog navigating them to the existing order (View or Edit).

## Design

### DB Layer
Partial unique index on `orders(store_id)` WHERE `status IN ('pending', 'confirmed')`.
Pre-existing duplicates resolved by auto-cancelling older orders.

### App Layer
Before each order INSERT, query for existing active orders for the selected store.
If found, show `ActiveOrderExistsDialog` instead of creating.

### Components

**ActiveOrderExistsDialog** (`src/mobile/components/ActiveOrderExistsDialog.tsx`)
- Reusable alert dialog shared across all mobile order pages
- Props: `open`, `onOpenChange`, `orderDisplayId`, `storeName`, `onView`, `onEdit`
- Three buttons: "View Order", "Edit Order", "Cancel"

**Navigation contract** (each page implements its own):
- `onView(orderId)`: close create sheet, switch to orders view, scroll/focus that order card
- `onEdit(orderId)`: same as onView but also open EditOrderSheet for that order

### Files Affected
| File | Change |
|------|--------|
| `supabase/migrations/20260601000002_single_active_order_per_store.sql` | New — partial unique index + duplicate resolution |
| `src/mobile/components/ActiveOrderExistsDialog.tsx` | New — shared alert dialog |
| `src/mobile/pages/agent/AgentRoutes.tsx` | Add check + navigation before order creation |
| `src/mobile/pages/marketer/MarketerOrders.tsx` | Add check + navigation before order creation |
| `src/mobile/pages/admin/AdminOrders.tsx` | Add check + navigation before order creation |
| `src/mobile/pages/customer/CustomerOrders.tsx` | Add check + navigation before order creation |
| `src/pages/Orders.tsx` (web) | Add check before order creation |
| `src/lib/orders.ts` | New — shared check function |

### Check function (`src/lib/orders.ts`)
```typescript
async function getActiveOrderForStore(supabase: SupabaseClient, storeId: string)
  → { id, display_id, store_id, status } | null
```
Queries `orders` for `store_id = X AND status IN ('pending', 'confirmed')`, returns the first match or null.

### Migration SQL
```sql
-- resolve duplicates (keep newest, cancel older)
WITH duplicates AS (
  SELECT id, store_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at DESC) as rn
  FROM orders WHERE status IN ('pending', 'confirmed')
)
UPDATE orders o SET status = 'cancelled',
  cancellation_reason = 'Auto-cancelled: duplicate active order'
FROM duplicates d WHERE o.id = d.id AND d.rn > 1;

-- enforce going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_single_active_per_store
ON orders(store_id) WHERE status IN ('pending', 'confirmed');
```

### Web Orders.tsx specific
Uses the same check-but-don't-create pattern. The web's order creation dialog shows an alert if an active order exists, with the existing order display_id.
