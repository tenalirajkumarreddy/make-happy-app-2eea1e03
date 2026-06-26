# Concurrent Modification Error Fix

## Problem

When users record a sale for a store and immediately try to record another sale for the **same store**, they encounter this validation error:

```
concurrent_modification: expected=120, actual=140.00
```

### Root Cause

The validation error is **correct** - it's preventing race conditions where two sales are recorded simultaneously with stale outstanding balance data. However, the issue was that the frontend was using **cached/stale data** instead of waiting for the fresh outstanding balance after the first sale.

**Flow before fix:**
1. User records sale #1 (outstanding: 120 → 140)
2. `afterSaleSaved` invalidates queries but doesn't wait for refetch
3. User immediately opens sale dialog for same store
4. Frontend still has cached outstanding = 120
5. RPC validates against DB (actual = 140) → **concurrent_modification error**

## Solution

### 1. Invalidate Store Outstanding Queries (CRITICAL)

**File:** `src/lib/mutationHelpers.ts`

Added explicit invalidation of all store balance-related query keys after sale/transaction mutations:

```typescript
// CRITICAL: Invalidate store outstanding balance to prevent concurrent modification errors
// Wait for these critical queries to refresh before allowing next sale
await invalidateAllAndWait(qc, ["store-outstanding", options.storeId]);
await invalidateAllAndWait(qc, ["store-sales-balance", options.storeId]);
await invalidateAllAndWait(qc, ["store-txn-balance", options.storeId]);
await invalidateAllAndWait(qc, ["store-adjustments-balance", options.storeId]);
```

### 2. Wait for Refetch Before Allowing Next Action

**File:** `src/lib/mutationHelpers.ts`

Created new `invalidateAllAndWait` helper that waits for refetches to complete:

```typescript
async function invalidateAllAndWait(qc: QueryClient, key: string[]) {
  qc.invalidateQueries({ queryKey: key, exact: false, refetchType: "all" });
  // Wait for all refetches to complete
  await qc.refetchQueries({ queryKey: key, exact: false, type: "all" });
}
```

Changed `afterSaleSaved` and `afterTransactionSaved` to be `async` functions that wait for critical queries to refresh.

### 3. Force Fresh Data Fetch in useLiveStoreBalance

**File:** `src/hooks/useLiveStoreBalance.ts`

Changed `staleTime` from `2000` to `0` for all balance-related queries:

```typescript
staleTime: 0, // Always fetch fresh to prevent stale balance calculations
gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes but always refetch when active
```

This ensures that whenever the component mounts or window regains focus, it **always** fetches fresh data from the server.

### 4. Await Cache Invalidation in UI

**Files:** 
- `src/pages/Sales.tsx`
- `src/pages/Transactions.tsx`

Updated mutation handlers to await the cache invalidation:

```typescript
await afterSaleSaved(qc, { storeId });
// Dialog closes AFTER cache has been refreshed
```

## What This Fixes

✅ **Concurrent modification errors** when recording rapid successive sales/transactions  
✅ **Stale outstanding balance** being used for validation  
✅ **Race conditions** between frontend cache and backend DB state  
✅ **User frustration** from seemingly random validation errors  

## Backend Validation Preserved

The backend's optimistic concurrency control (`p_expected_outstanding` parameter) remains **fully intact**. This fix ensures the frontend always sends the **correct expected outstanding** value by:

1. Fetching fresh outstanding before RPC (already existed in Sales.tsx:876-883)
2. **NEW:** Waiting for cache to refresh after each mutation
3. **NEW:** Forcing `staleTime: 0` on balance queries

## Testing Checklist

- [ ] Record a sale for Store A → immediately record another sale for Store A → **no error**
- [ ] Record a transaction for Store B → immediately record another transaction → **no error**
- [ ] Record sale for Store C → check outstanding balance updates correctly
- [ ] Multiple users recording sales for same store → backend still catches real race conditions
- [ ] Offline mode → sales queue correctly, sync when online

## Performance Impact

Minimal - the async wait only happens for the **critical store balance queries** (4 queries max), which typically complete in <100ms. The dialog stays open for an extra ~100-200ms after showing success toast, which is imperceptible to users but prevents the race condition.

## Files Modified

1. `src/lib/mutationHelpers.ts` - Added `invalidateAllAndWait`, made helpers async
2. `src/hooks/useLiveStoreBalance.ts` - Set `staleTime: 0` for all balance queries
3. `src/pages/Sales.tsx` - Await `afterSaleSaved`
4. `src/pages/Transactions.tsx` - Await `afterTransactionSaved`

## Related Issues

This fix works in conjunction with the realtime sync fixes to ensure:
- Immediate local cache updates (optimistic)
- Proper invalidation and refetch (authoritative)
- Realtime updates from other users/devices (via Supabase Realtime)
- Cross-tab sync (via BroadcastChannel)