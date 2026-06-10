# Realtime Data Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate stale data across web and mobile by adding comprehensive mutation invalidation, fixing role-based realtime subscriptions, and plugging publication gaps.

**Architecture:** A shared `mutationHelpers.ts` centralizes all post-mutation invalidation logic. Every mutation site (11 web + mobile files) delegates to these helpers. Missing `product_stock`/`staff_stock`/`sales` roles are added to `ROLE_TABLE_MAP`. Missing tables added to `supabase_realtime` publication.

**Tech Stack:** React Query, Supabase Realtime, PostgreSQL publication

---

### Task 1: Create shared mutation helpers (`src/lib/mutationHelpers.ts`)

**Files:**
- Create: `src/lib/mutationHelpers.ts`

- [ ] **Step 1: Write the file with all six helpers**

```typescript
import { QueryClient } from "@tanstack/react-query";

export function afterSaleSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  qc.invalidateQueries({ queryKey: ["sales"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["staff-stock"] });
  qc.invalidateQueries({ queryKey: ["product-stock"] });
  qc.invalidateQueries({ queryKey: ["stock-movements"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["pending-orders-for-store"] });
  qc.invalidateQueries({ queryKey: ["mobile-pending-orders-for-store"] });
  qc.invalidateQueries({ queryKey: ["agent-stock"] });
  qc.invalidateQueries({ queryKey: ["store-pricing"] });
  qc.invalidateQueries({ queryKey: ["store-type-pricing"] });
  qc.invalidateQueries({ queryKey: ["store_type_products"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  qc.invalidateQueries({ queryKey: ["marketer-dashboard"] });
  qc.invalidateQueries({ queryKey: ["pos-dashboard"] });
  qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
  qc.invalidateQueries({ queryKey: ["daily-report"] });
  qc.invalidateQueries({ queryKey: ["daybook-sales"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
    qc.invalidateQueries({ queryKey: ["mobile-sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] });
  }
  if (options?.storeId) {
    qc.invalidateQueries({ queryKey: ["sale-items-for-store", options.storeId] });
  }
}

export function afterTransactionSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  qc.invalidateQueries({ queryKey: ["transactions"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["customer-balances"] });
  qc.invalidateQueries({ queryKey: ["customer-transactions"] });
  qc.invalidateQueries({ queryKey: ["store-transactions"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  qc.invalidateQueries({ queryKey: ["marketer-dashboard"] });
  qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] });
  qc.invalidateQueries({ queryKey: ["daybook-transactions"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
    qc.invalidateQueries({ queryKey: ["mobile-transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-tx-timeline"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-balance-tx"] });
  }
}

export function afterSaleReturned(qc: QueryClient, options?: { isMobile?: boolean; saleId?: string }) {
  qc.invalidateQueries({ queryKey: ["sale-returns"] });
  qc.invalidateQueries({ queryKey: ["sales"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["staff-stock"] });
  qc.invalidateQueries({ queryKey: ["product-stock"] });
  qc.invalidateQueries({ queryKey: ["stock-movements"] });
  qc.invalidateQueries({ queryKey: ["inventory-timeline"] });
  qc.invalidateQueries({ queryKey: ["balance-adjustments"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-sales"] });
  }
  if (options?.saleId) {
    qc.invalidateQueries({ queryKey: ["sale-return-detail", options.saleId] });
  }
}

export function afterSaleEdited(qc: QueryClient, options?: { isMobile?: boolean }) {
  qc.invalidateQueries({ queryKey: ["sales"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["sale-items"] });
  qc.invalidateQueries({ queryKey: ["staff-stock"] });
  qc.invalidateQueries({ queryKey: ["product-stock"] });
  qc.invalidateQueries({ queryKey: ["agent-stock"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] });
    qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
    qc.invalidateQueries({ queryKey: ["mobile-sales"] });
  }
}

export function afterSaleCancelled(qc: QueryClient, options?: { isMobile?: boolean }) {
  qc.invalidateQueries({ queryKey: ["sales"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["staff-stock"] });
  qc.invalidateQueries({ queryKey: ["product-stock"] });
  qc.invalidateQueries({ queryKey: ["stock-movements"] });
  qc.invalidateQueries({ queryKey: ["agent-stock"] });
  qc.invalidateQueries({ queryKey: ["agent-stock-holdings"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-recent-activity"] });
  }
}

export function afterPaymentReturned(qc: QueryClient, options?: { isMobile?: boolean }) {
  qc.invalidateQueries({ queryKey: ["transactions"] });
  qc.invalidateQueries({ queryKey: ["stores"] });
  qc.invalidateQueries({ queryKey: ["customer-balances"] });
  qc.invalidateQueries({ queryKey: ["super-admin-dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
  qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] });
  if (options?.isMobile) {
    qc.invalidateQueries({ queryKey: ["mobile-transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-recent-activity"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
  }
}
```

- [ ] **Step 2: TSC check**

Run: `npx tsc --noEmit 2>&1 | Select-String "error"`
Expected: No errors (pure data, no imports needed yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/mutationHelpers.ts
git commit -m "feat: add shared mutation invalidation helpers"
```

---

### Task 2: Fix `ROLE_TABLE_MAP` gaps in `useRealtimeSync.ts`

**Files:**
- Modify: `src/hooks/useRealtimeSync.ts:336-395`

- [ ] **Step 1: Add missing roles**

Edit `src/hooks/useRealtimeSync.ts`:

- `agent`: add `"product_stock"`, `"stock_movements"`, `"sale_return_items"`
- `marketer`: add `"staff_stock"`, `"product_stock"`, `"stock_transfers"`
- `customer`: add `"sales"`, `"sale_returns"`

Replace the `agent`, `marketer`, and `customer` arrays:

```typescript
  agent: [
    "sales", "sale_items", "sale_returns", "sale_return_items",
    "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products", "store_types",
    "store_visits", "customers", "products",
    "routes", "route_sessions", "agent_routes", "agent_store_types",
    "handovers", "handover_snapshots", "expense_claims",
    "expense_categories", "expense_category_access",
    "profiles", "stock_transfers", "staff_stock",
    "product_stock", "stock_movements",
    "notifications", "receipts",
  ],
  marketer: [
    "sales", "sale_items", "sale_returns", "sale_return_items",
    "orders", "order_items", "stores", "store_type_products", "store_types",
    "customers", "products", "routes", "route_sessions",
    "transactions", "agent_store_types", "profiles",
    "handovers", "handover_snapshots", "expense_claims",
    "expense_categories", "expense_category_access",
    "staff_stock", "product_stock", "stock_transfers",
    "notifications",
  ],
  customer: [
    "orders", "order_items", "stores", "customers", "profiles",
    "transactions", "sales", "sale_returns",
    "notifications",
  ],
```

- [ ] **Step 2: Add `sale_return_items` to `shouldSkipForSubscriber` filter**

Add after the `staff_stock` block (line 449):

```typescript
  if (table === "sale_return_items") {
    // Filter via parent sale (joined in query)
    return false;
  }
```

- [ ] **Step 3: TSC check**

Run: `npx tsc --noEmit 2>&1 | Select-String "error"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRealtimeSync.ts
git commit -m "fix: add missing roles to ROLE_TABLE_MAP (agent:product_stock, marketer:staff_stock, customer:sales)"
```

---

### Task 3: Update web Sales.tsx invalidation

**Files:**
- Modify: `src/pages/Sales.tsx`

- [ ] **Step 1: Add import at top of file**

```typescript
import { afterSaleSaved, afterSaleEdited, afterSaleCancelled, afterSaleReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace sale record invalidation (lines 886-916)**

Replace:
```typescript
    if (pendingCount > 0) {
      toast.success(`Sale recorded. ${pendingCount} pending order(s) auto-marked as delivered.`);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } else {
      toast.success("Sale recorded successfully");
    }
    ...
    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["sales"] });
```

With:
```typescript
    if (pendingCount > 0) {
      toast.success(`Sale recorded. ${pendingCount} pending order(s) auto-marked as delivered.`);
    } else {
      toast.success("Sale recorded successfully");
    }
    ...
    setSaving(false);
    setShowAdd(false);
    resetForm();
    afterSaleSaved(qc, { storeId });
```

- [ ] **Step 3: Replace edit sale invalidation (lines 579-580)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
```

With:
```typescript
      afterSaleEdited(qc);
```

- [ ] **Step 4: Replace cancel sale invalidation (lines 1727-1730)**

Replace:
```typescript
              qc.invalidateQueries({ queryKey: ["sales"] });
              qc.invalidateQueries({ queryKey: ["stores"] });
              qc.invalidateQueries({ queryKey: ["agent-stock"] });
              qc.invalidateQueries({ queryKey: ["product-stock"] });
```

With:
```typescript
              afterSaleCancelled(qc);
```

- [ ] **Step 5: Replace return onSuccess invalidation (lines 1684-1687)**

Replace:
```typescript
    onSuccess={() => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['stores'] });
    }}
```

With:
```typescript
    onSuccess={() => {
      afterSaleReturned(qc, { saleId: returnSale?.id });
    }}
```

- [ ] **Step 6: TSC check**

Run: `npx tsc --noEmit 2>&1 | Select-String "error"`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/Sales.tsx
git commit -m "fix: use shared mutation helpers in Sales.tsx"
```

---

### Task 4: Update web Transactions.tsx invalidation

**Files:**
- Modify: `src/pages/Transactions.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterTransactionSaved, afterPaymentReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace record transaction invalidation (line 342)**

Replace:
```typescript
    qc.invalidateQueries({ queryKey: ["transactions"] });
```

With:
```typescript
    afterTransactionSaved(qc);
```

- [ ] **Step 3: Replace payment return invalidation (line 881)**

Replace:
```typescript
                qc.invalidateQueries({ queryKey: ["transactions"] });
```

With:
```typescript
                afterPaymentReturned(qc);
```

- [ ] **Step 4: TSC check**

Run: `npx tsc --noEmit 2>&1 | Select-String "error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/Transactions.tsx
git commit -m "fix: use shared mutation helpers in Transactions.tsx"
```

---

### Task 5: Update SaleReturnDialog.tsx

**Files:**
- Modify: `src/components/sales/SaleReturnDialog.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 174-176)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["sale-returns"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
      onSuccess?.();
```

With:
```typescript
      afterSaleReturned(qc, { saleId: sale.id });
      onSuccess?.();
```

- [ ] **Step 3: TSC check + Commit**

---

### Task 6: Update SaleReturns.tsx

**Files:**
- Modify: `src/pages/SaleReturns.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace create return invalidation (lines 326-328)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["sale-returns"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
```

With:
```typescript
      afterSaleReturned(qc);
```

- [ ] **Step 3: Replace status update invalidation (lines 365-368)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["sale-returns"] });
      qc.invalidateQueries({ queryKey: ["sale-return-detail", id] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
```

With:
```typescript
      afterSaleReturned(qc, { saleId: id });
```

- [ ] **Step 4: TSC check + Commit**

---

### Task 7: Update OrderFulfillmentDialog.tsx

**Files:**
- Modify: `src/components/orders/OrderFulfillmentDialog.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleSaved } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 557-560)**

Replace:
```typescript
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balances"] });
```

With:
```typescript
      afterSaleSaved(queryClient, { storeId });
```

(Note: check if `storeId` is available in this scope from the fulfilled order)

- [ ] **Step 3: TSC check + Commit**

---

### Task 8: Update mobile AgentRecord.tsx

**Files:**
- Modify: `src/mobile/pages/agent/AgentRecord.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleSaved, afterTransactionSaved } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace sale record invalidation (lines 372-373)**

Replace:
```typescript
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
```

With:
```typescript
    afterSaleSaved(qc, { isMobile: true, storeId: store?.id });
```

- [ ] **Step 3: Replace payment record invalidation (lines 947-948)**

Replace:
```typescript
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
```

With:
```typescript
    afterTransactionSaved(qc, { isMobile: true, storeId: store?.id });
```

- [ ] **Step 4: TSC check + Commit**

---

### Task 9: Update mobile AgentRecordSale.tsx

**Files:**
- Modify: `src/mobile/pages/agent/AgentRecordSale.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleSaved } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 376-377)**

Replace:
```typescript
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
```

With:
```typescript
    afterSaleSaved(qc, { isMobile: true });
```

- [ ] **Step 3: TSC check + Commit**

---

### Task 10: Update mobile AgentRecordPayment.tsx

**Files:**
- Modify: `src/mobile/pages/agent/AgentRecordPayment.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterTransactionSaved } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 141-142)**

Replace:
```typescript
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
```

With:
```typescript
    afterTransactionSaved(qc, { isMobile: true });
```

- [ ] **Step 3: TSC check + Commit**

---

### Task 11: Update mobile AgentHistory.tsx

**Files:**
- Modify: `src/mobile/pages/agent/AgentHistory.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleEdited, afterSaleReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace edit sale invalidation (lines 829-830)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] });
      qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] });
```

With:
```typescript
      afterSaleEdited(qc, { isMobile: true });
```

- [ ] **Step 3: Replace return sale invalidation (lines 905-906)**

Replace:
```typescript
      setReturningSale(null);
      qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] });
      qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] });
```

With:
```typescript
      setReturningSale(null);
      afterSaleReturned(qc, { isMobile: true, saleId: returningSale?.id });
```

- [ ] **Step 4: TSC check + Commit**

---

### Task 12: Update mobile AdminSales.tsx

**Files:**
- Modify: `src/mobile/pages/admin/AdminSales.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterSaleCancelled } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 743-745)**

Replace:
```typescript
                      qc.invalidateQueries({ queryKey: ["mobile-sales"] });
                      qc.invalidateQueries({ queryKey: ["sales"] });
                      qc.invalidateQueries({ queryKey: ["stores"] });
```

With:
```typescript
                      afterSaleCancelled(qc, { isMobile: true });
```

- [ ] **Step 3: TSC check + Commit**

---

### Task 13: Update mobile ReturnPaymentDialog.tsx

**Files:**
- Modify: `src/mobile/components/ReturnPaymentDialog.tsx`

- [ ] **Step 1: Add import**

```typescript
import { afterPaymentReturned } from "@/lib/mutationHelpers";
```

- [ ] **Step 2: Replace invalidation (lines 65-67)**

Replace:
```typescript
      qc.invalidateQueries({ queryKey: ["mobile-transactions"] })
      qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] })
      qc.invalidateQueries({ queryKey: ["mobile-recent-activity"] })
```

With:
```typescript
      afterPaymentReturned(qc, { isMobile: true })
```

- [ ] **Step 3: TSC check + Commit**

---

### Task 14: Add missing tables to `supabase_realtime` publication

**Files:**
- Create: `supabase/migrations/20260530000011_add_tables_to_realtime_publication.sql`

- [ ] **Step 1: Check which tables are already in publication**

Run in Supabase SQL:
```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

- [ ] **Step 2: Create migration to add missing tables**

```sql
-- Add tables that are in TABLE_QUERY_MAP but missing from supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.kyc_documents,
  public.purchase_orders,
  public.payrolls,
  public.payroll_items,
  public.worker_roles,
  public.income,
  public.income_entries,
  public.stock_requests,
  public.handover_requests,
  public.staff_performance_logs,
  public.staff_cash_accounts,
  public.receipts,
  public.vehicles,
  public.bill_of_materials,
  public.production_log,
  public.wac_cost_history,
  public.unit_conversions,
  public.fcm_tokens,
  public.raw_material_categories,
  public.vendor_transactions;
```

- [ ] **Step 3: Apply migration via Supabase MCP**

```typescript
supabase_apply_migration({
  project_id: "vrhptrtgrpftycvojaqo",
  name: "20260530000011_add_tables_to_realtime_publication",
  query: "..."
})
```

- [ ] **Step 4: Verify**

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```
Expected: All 87+ tables now present.

- [ ] **Step 5: Commit**

---

### Task 15: Verify everything compiles

- [ ] **Step 1: Run lint**

```bash
npm run lint 2>&1 | Select-String "error" -NotMatch "ESLint couldn't"
```
Expected: No new errors (only pre-existing warnings)

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | Select-String "error"
```
Expected: No errors

- [ ] **Step 3: Commit all remaining**

```bash
git add -A
git commit -m "fix: comprehensive realtime data consistency overhaul"
```
