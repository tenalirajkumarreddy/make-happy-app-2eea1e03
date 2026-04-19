# BizManager Workflow Gaps & Issues

**Analysis Date:** 2026-04-19

---

## 1. Critical Race Conditions

### 1.1 Outstanding Balance Calculation Race

**Location:** `src/pages/Sales.tsx` lines 311-316, `supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql`

**Issue:** Client-side outstanding calculation can become stale between read and write
```typescript
// PROBLEMATIC CODE (lines 311-316 in Sales.tsx)
const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
const cash = parseFloat(cashAmount) || 0;
const upi = parseFloat(upiAmount) || 0;
const outstandingFromSale = totalAmount - cash - upi;
const oldOutstanding = Number(selectedStore?.outstanding || 0); // May be stale
const newOutstanding = oldOutstanding + outstandingFromSale;
```

**Gap:** Multiple agents can read the same outstanding value simultaneously, leading to incorrect calculations.

**Mitigation:** The RPC function uses FOR UPDATE lock, but the UI still shows potentially stale values.

**Recommendation:** 
- Disable client-side outstanding preview for concurrent access scenarios
- Add optimistic locking with version numbers

### 1.2 Duplicate Sale Risk

**Location:** `src/pages/Sales.tsx` lines 487-535 (offline queue)

**Issue:** Business key generation may not prevent duplicates across offline/online transitions
```typescript
const businessKey = generateBusinessKey('sale', {
  storeId,
  customerId,
  amount: totalAmount,
  // Timestamp precision may cause different keys
  timestamp: saleDate || new Date().toISOString(),
});
```

**Gap:** Same sale submitted twice if user clicks rapidly or network flickers.

**Recommendation:** Add server-side deduplication with unique constraint on business key.

---

## 2. Incomplete Validation Flows

### 2.1 Credit Limit Bypass via Offline Queue

**Location:** `src/lib/offlineQueue.ts`, `src/pages/Sales.tsx` lines 487-535

**Issue:** Sales queued offline bypass credit limit checks
```typescript
if (!navigator.onLine) {
  // Credit check skipped!
  await addToQueue({ ... });
  toast.warning("You're offline — sale queued...");
}
```

**Gap:** Customer could exceed credit limit by going offline.

**Recommendation:** Store credit limit data locally and validate before queuing.

### 2.2 Stock Check Race Condition

**Location:** `src/pages/Sales.tsx` lines 461-485

**Issue:** Stock check happens before sale submission but there's no guarantee stock remains available
```typescript
// Check stock availability
const { data: stockCheck, error: stockError } = await (supabase as any)
  .rpc("check_stock_availability", { ... });

// ... user confirmation dialog ...

// Stock could be taken by another user here!
const { data: result, error } = await supabase.rpc("record_sale", { ... });
```

**Gap:** Time between check and submit allows stock to be consumed by concurrent sales.

**Recommendation:** Move stock check inside atomic RPC transaction.

### 2.3 Missing Store-Customer Link Validation

**Location:** `src/pages/Sales.tsx` lines 446-451

**Issue:** Only checks if customer_id exists, not if it's valid
```typescript
const customerId = selectedStore?.customer_id;
if (!customerId) {
  toast.error("Store has no linked customer");
  setSaving(false);
  return;
}
```

**Gap:** Doesn't validate if customer exists or is active.

**Recommendation:** Add customer lookup and active check before sale.

---

## 3. Data Consistency Issues

### 3.1 Transaction Partial Update Risk

**Location:** `src/mobile/pages/agent/AgentRecord.tsx` lines 960-974

**Issue:** Transaction insert and store update are separate operations
```typescript
// Step 1: Insert transaction
const { error } = await supabase.from("transactions").insert({ ... });

// Step 2: Update store (separate call!)
await supabase.from("stores").update({ outstanding: newOutstanding }).eq("id", store.id);

// Step 3: Backdate recalculation (more updates)
```

**Gap:** If step 2 fails, transaction exists but store balance is wrong.

**Recommendation:** Use RPC for atomic transaction+update.

### 3.2 Handover Balance Calculation Inconsistency

**Location:** `src/pages/Handovers.tsx` lines 190-218

**Issue:** Client-side calculation may differ from server state
```typescript
const sentConfirmed = myHandovers
  .filter((h) => h.user_id === user?.id && h.status === "confirmed")
  .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
```

**Gap:** Based on cached handover data, not real-time server state.

**Recommendation:** Use server-side balance RPC or invalidate cache on open.

### 3.3 Order Status Inconsistency

**Location:** `supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql` lines 227-230

**Issue:** Auto-delivery updates ALL pending orders for store
```sql
UPDATE public.orders
SET status = 'delivered', delivered_at = now()
WHERE store_id = p_store_id AND status = 'pending';
```

**Gap:** Multiple pending orders for same store all marked delivered, even if sale doesn't cover all.

**Recommendation:** Only mark orders whose items are in the sale.

---

## 4. User Experience Gaps

### 4.1 No Retry for Failed Offline Sync

**Location:** `src/lib/offlineQueue.ts`

**Issue:** Failed sync items stay in queue indefinitely without user notification
- No visibility into queue status
- No retry mechanism with backoff
- Failed items block subsequent items

**Recommendation:** Add sync status UI and automatic retry with exponential backoff.

### 4.2 Missing GPS Fallback

**Location:** `src/mobile/pages/agent/AgentRecord.tsx` lines 277-297

**Issue:** Proximity check failure blocks sale with no override path for agents
```typescript
if (locSetting?.value === "true") {
  const result = await checkProximity(store.lat, store.lng);
  if (!result.withinRange) {
    toast.error(result.message);
    setSaving(false);
    return; // Hard block
  }
}
```

**Gap:** Agent cannot proceed if GPS is wrong or store moved.

**Recommendation:** Add "Request Manager Override" flow.

### 4.3 Silent Notification Failures

**Location:** `src/pages/Sales.tsx` lines 593-609

**Issue:** Notification failures caught and silently logged
```typescript
getAdminUserIds()
  .then((ids) => { ... })
  .catch((err) => {
    console.warn("Failed to notify admins:", err); // Silent
  });
```

**Gap:** User doesn't know if notifications were sent.

**Recommendation:** Show notification status or retry option.

---

## 5. Security Gaps

### 5.1 Permission Check Timing

**Location:** `src/hooks/usePermission.ts`

**Issue:** Permission check happens after component render
```typescript
export function usePermission(key: PermissionKey): { allowed: boolean; loading: boolean } {
  const { user, role } = useAuth();
  const { data: permissions, isLoading } = useQuery({ ... });
  // Component may render with stale permission data
}
```

**Gap:** User may briefly see/access features they don't have permission for.

**Recommendation:** Gate routes at Router level, not just component level.

### 5.2 Route Access Matrix Caching

**Location:** `src/hooks/useRouteAccess.ts` lines 60-109

**Issue:** Route access data cached with staleTime
```typescript
const { data: routeRows, isLoading: loadingRoutes } = useQuery({
  queryKey: ["route-access-matrix", userId, role],
  staleTime: 30_000, // 30 seconds of potentially stale data
});
```

**Gap:** User retains access to revoked routes for 30 seconds.

**Recommendation:** Set staleTime to 0 for access control data.

### 5.3 Store Data Leakage via Search

**Location:** `src/pages/Stores.tsx`

**Issue:** Store search happens server-side without filtering
```typescript
const { data: stores } = useQuery({
  queryFn: async () => {
    let query = supabase.from("stores").select("...");
    // No route/store_type filtering in query
    const { data } = await query;
    return data;
  },
});
```

**Gap:** Client-side filtering applied after fetch - stores briefly visible.

**Recommendation:** Apply RLS policies or server-side filtering.

---

## 6. Missing Error Handling

### 6.1 Unhandled Network Errors in Queries

**Location:** Multiple files using useQuery

**Issue:** Many queries don't handle errors gracefully
```typescript
const { data: stores } = useQuery({
  queryKey: ["stores"],
  queryFn: async () => {
    const { data } = await supabase.from("stores").select();
    return data || []; // Error silently swallowed
  },
});
```

**Gap:** Network errors show empty state instead of error message.

**Recommendation:** Add error handling and retry UI.

### 6.2 Silent Failures on Notification Send

**Location:** `src/lib/notifications.ts`

**Issue:** Notification insert failures not propagated
```typescript
export async function sendNotification(...) {
  const { error } = await supabase.from("notifications").insert({ ... });
  if (error) {
    console.error("Failed to send notification:", error); // Silent
  }
}
```

**Gap:** Critical notifications may fail without user knowledge.

**Recommendation:** Return success status and retry on failure.

---

## 7. Data Integrity Issues

### 7.1 Orphaned Sale Items

**Location:** `supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql` lines 217-224

**Issue:** Sale items inserted separately from sale
```sql
INSERT INTO public.sales (...); -- May succeed
INSERT INTO public.sale_items (...); -- May fail
```

**Gap:** In RPC but still two separate INSERT statements.

**Mitigation:** Wrapped in same function but could use explicit transaction.

### 7.2 Inconsistent Timestamp Handling

**Location:** Multiple files

**Issue:** Mix of client and server timestamps
```typescript
// Some places use client time
await supabase.from("orders").insert({ created_at: new Date().toISOString() });

// Some use server default
created_at timestamptz NOT NULL DEFAULT now()
```

**Gap:** Clock skew can cause ordering issues.

**Recommendation:** Always use server timestamps for consistency.

### 7.3 Missing Soft Delete for Critical Entities

**Location:** `TOTAL_MIGRATION.sql`

**Issue:** No deleted_at fields on customers, stores, products
```sql
CREATE TABLE public.customers (
  -- No deleted_at column
  is_active boolean NOT NULL DEFAULT true
);
```

**Gap:** Hard deletes lose history; is_active doesn't prevent FK references.

**Recommendation:** Add deleted_at for audit and prevent accidental data loss.

---

## 8. Performance Concerns

### 8.1 N+1 Query in Sales List

**Location:** `src/pages/Sales.tsx` lines 149-173

**Issue:** Sales query + separate profile lookups
```typescript
const { data: sales } = useQuery({ ... }); // Gets sales

// Then for each sale:
const { data: profiles } = useQuery({ ... }); // Separate query
```

**Gap:** Profile data fetched separately for recorder names.

**Recommendation:** Use joined query or server-side view.

### 8.2 Unbounded Query Results

**Location:** `src/pages/Handovers.tsx` lines 112-124

**Issue:** No pagination on handovers query
```typescript
const { data: handovers } = useQuery({
  queryFn: async () => {
    const { data } = await supabase
      .from("handovers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500); // Large limit
  },
});
```

**Gap:** Will slow down as data grows.

**Recommendation:** Implement proper cursor pagination.

### 8.3 Realtime Subscription Scope

**Location:** `src/hooks/useRealtimeSync.ts` lines 175-212

**Issue:** All staff subscribe to all relevant tables
```typescript
const tables = getTablesForRole(role);
tables.forEach((table) => {
  sharedChannel = sharedChannel.on(
    "postgres_changes",
    { event: "*", schema: "public", table },
    (payload) => handleRealtimePayload(table, payload)
  );
});
```

**Gap:** High connection count may hit Supabase limits.

**Recommendation:** Scope subscriptions to user-specific data where possible.

---

## 9. Mobile-Specific Issues

### 9.1 No Background Sync

**Location:** `src/lib/offlineQueue.ts`

**Issue:** Queue only processes when app is foreground
- No service worker for background sync
- Queue may grow large if app not opened

**Recommendation:** Implement service worker or periodic sync.

### 9.2 Camera Permission Not Validated

**Location:** `src/mobile/pages/agent/AgentScan.tsx`

**Issue:** Assumes camera permission granted
- No graceful fallback if permission denied
- Scanner fails silently

**Recommendation:** Add permission gate and manual entry fallback.

### 9.3 GPS Data Not Validated

**Location:** `src/mobile/pages/agent/AgentRoutes.tsx`

**Issue:** Store distance calculation fails with invalid GPS
```typescript
// No validation of lat/lng before distance calculation
const distance = calculateDistance(userLat, userLng, store.lat, store.lng);
```

**Gap:** NaN distances break sorting.

**Recommendation:** Validate coordinates before calculation.

---

## 10. Summary of Critical Issues

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| HIGH | Outstanding calculation race | Sales.tsx | Financial inaccuracy |
| HIGH | Credit limit bypass offline | offlineQueue.ts | Over-credit risk |
| HIGH | Stock check race | Sales.tsx | Overselling |
| HIGH | Transaction partial update | AgentRecord.tsx | Data inconsistency |
| MEDIUM | Order status inconsistency | SQL trigger | Incorrect fulfillment |
| MEDIUM | Permission check timing | usePermission.ts | Unauthorized access |
| MEDIUM | Store data leakage | Stores.tsx | Data exposure |
| MEDIUM | Missing error handling | Multiple | Poor UX |
| LOW | Orphaned sale items | SQL RPC | Data integrity |
| LOW | Unbounded queries | Multiple | Performance |

---

*Workflow gaps analysis: 2026-04-19*
