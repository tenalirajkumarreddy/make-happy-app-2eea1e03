# Real-time Data Consistency Overhaul

**Date:** 2026-05-30
**Status:** Approved for implementation

## Problem

After mutations (record sale, edit sale, cancel sale, return sale, record transaction, return payment, fulfill order), many related query keys are not invalidated, causing stale data across web and mobile APK. Each page independently duplicates invalidation logic with inconsistent coverage. No optimistic cache updates exist, so the UI always waits for a refetch.

## Solution

### Phase 1: Shared mutation helpers

Create `src/lib/mutationHelpers.ts` — a central file with named functions that invalidate ALL related query keys after each mutation type. Both web and mobile call these helpers, ensuring consistent coverage.

```typescript
afterSaleSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string })
```
Invalidates:
- `sales`, `stores` (outstanding), `staff-stock`, `product-stock`, `stock-movements`
- `orders`, `pending-orders-for-store`, `mobile-pending-orders-for-store`
- `mobile-agent-sales-today`, `mobile-sales`, `mobile-history-sales-timeline`, `mobile-history-balance-sales`
- Dashboard keys (`super-admin-dashboard-stats`, `manager-dashboard`, `marketer-dashboard`, `pos-dashboard`, `mobile-admin-dashboard`)
- `sale-items` (if storeId provided: `sale-items-for-store-{storeId}`)
- `analytics`, `daily-report`, `daybook-sales`
- `store-pricing`, `store-type-pricing`, `store_type_products`

```typescript
afterTransactionSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string })
```
Invalidates:
- `transactions`, `stores` (outstanding), `customer-balances`
- `mobile-agent-tx-today`, `mobile-transactions`, `mobile-history-tx-timeline`, `mobile-history-balance-tx`
- Dashboard keys
- `daybook-transactions`, `analytics`

```typescript
afterSaleReturned(qc: QueryClient, options?: { isMobile?: boolean; saleId?: string })
```
Invalidates:
- `sale-returns`, `sales`, `stores`, `staff-stock`, `product-stock`
- `inventory-timeline`, `stock-movements`
- `mobile-history-sales-timeline`, `mobile-history-balance-sales`, `mobile-sales`
- Dashboard keys
- `balance-adjustments`
- `sale-return-detail` (if saleId provided)

```typescript
afterSaleEdited(qc: QueryClient, options?: { isMobile?: boolean })
```
Invalidates:
- `sales`, `stores`, `sale-items`, `staff-stock`, `product-stock`
- `mobile-history-sales-timeline`, `mobile-history-balance-sales`
- `mobile-agent-sales-today`, `mobile-sales`
- Dashboard keys

```typescript
afterSaleCancelled(qc: QueryClient, options?: { isMobile?: boolean })
```
Invalidates:
- `sales`, `stores`, `staff-stock`, `product-stock`, `stock-movements`
- `mobile-sales`, `mobile-admin-dashboard`, `mobile-recent-activity`
- Dashboard keys
- `agent-stock`, `agent-stock-holdings`

```typescript
afterPaymentReturned(qc: QueryClient, options?: { isMobile?: boolean })
```
Invalidates:
- `transactions`, `stores`, `customer-balances`
- `mobile-transactions`, `mobile-admin-dashboard`, `mobile-recent-activity`
- `mobile-agent-tx-today`
- Dashboard keys

### Phase 2: Optimistic cache updates (`setQueryData`)

After mutations, update React Query cache immediately rather than waiting for refetch:

- **Record Sale**: Prepend returned sale to `["sales"]` cache; update `staff_stock` cache for affected products
- **Record Transaction**: Prepend to `["transactions"]` cache; update `stores` outstanding cache
- **Cancel Sale**: Mark sale as deleted in cache; update `staff_stock`/`product_stock` cache
- **Return Sale**: Prepend to `["sale-returns"]` cache; update sale status in `["sales"]` cache

### Phase 3: Fix role-based realtime subscription gaps

In `src/hooks/useRealtimeSync.ts`:

- Add `product_stock` to agent's `ROLE_TABLE_MAP` (agents need warehouse stock visibility for transfers)
- Add `staff_stock` to marketer's `ROLE_TABLE_MAP`
- Add `sale_returns`, `sale_return_items` to marketer's `ROLE_TABLE_MAP`
- Add `transactions` to customer's `ROLE_TABLE_MAP` (customers already query transactions)
- Add `sales` to customer's `ROLE_TABLE_MAP` (customers see their own sales)

### Phase 4: Add missing tables to publication

Migration: add tables from `TABLE_QUERY_MAP` that are missing from `supabase_realtime` publication:

```sql
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

## Files to modify

| File | Change |
|------|--------|
| `src/lib/mutationHelpers.ts` | NEW — shared invalidation helpers |
| `src/pages/Sales.tsx` | Replace inline `qc.invalidateQueries` with `afterSaleSaved`, `afterSaleEdited`, `afterSaleCancelled`, `afterSaleReturned` |
| `src/pages/Transactions.tsx` | Replace inline with `afterTransactionSaved`, `afterPaymentReturned` |
| `src/pages/SaleReturns.tsx` | Replace inline with `afterSaleReturned` |
| `src/components/sales/SaleReturnDialog.tsx` | Replace inline with `afterSaleReturned` |
| `src/components/orders/OrderFulfillmentDialog.tsx` | Replace inline with `afterSaleSaved` |
| `src/mobile/pages/agent/AgentRecord.tsx` | Replace inline with `afterSaleSaved`, `afterTransactionSaved` |
| `src/mobile/pages/agent/AgentRecordSale.tsx` | Replace inline with `afterSaleSaved` |
| `src/mobile/pages/agent/AgentRecordPayment.tsx` | Replace inline with `afterTransactionSaved` |
| `src/mobile/pages/agent/AgentHistory.tsx` | Replace inline with `afterSaleEdited`, `afterSaleReturned` |
| `src/mobile/pages/admin/AdminSales.tsx` | Replace inline with `afterSaleCancelled` |
| `src/mobile/components/ReturnPaymentDialog.tsx` | Replace inline with `afterPaymentReturned` |
| `src/hooks/useRealtimeSync.ts` | Fix `ROLE_TABLE_MAP` gaps (agent:product_stock, marketer:staff_stock, customer:transactions+sales) |
| `supabase/migrations/20260530000011_add_tables_to_realtime_publication.sql` | NEW — add missing tables to publication |

## Migration sequence

1. Create `mutationHelpers.ts`
2. Replace invalidation in each file (web pages → components → mobile pages)
3. Fix `ROLE_TABLE_MAP` in `useRealtimeSync.ts`
4. Add `setQueryData` for immediate cache updates
5. Create and apply publication migration
6. Run lint + tsc verification
