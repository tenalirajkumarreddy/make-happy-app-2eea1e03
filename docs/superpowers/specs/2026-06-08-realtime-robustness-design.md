# Realtime Robustness Design

## Scope
Two independent improvements to make the system robust for realtime scenarios:
1. **Dashboard** — convert from mount-only fetch to reactive React Query + realtime invalidation
2. **Notification channel** — add reconnection logic to prevent silent notification delivery loss

---

## 1. Dashboard Realtime Refactor

### Problem
`src/pages/Dashboard.tsx` calls raw `supabase.from(...).select(...)` queries on mount and never re-fetches. KPIs are stale from the moment the page loads. `useRealtimeSync`'s query invalidation has no effect because the Dashboard doesn't use React Query.

### Design

Extract each KPI into a standalone `useQuery` hook. Register their query keys in `useRealtimeSync.TABLE_QUERY_MAP` so mutations in other pages (record sale, collect payment, confirm handover) automatically trigger refetch.

### Hooks (new file: `src/hooks/useDashboardRealtime.ts`)

| Hook | Query Key | source Table(s) | Invalidation Trigger |
|---|---|---|---|
| `useTodaySales()` | `["dashboard", "todaySales"]` | `sales` | INSERT/UPDATE/DELETE on sales |
| `useTodayTransactions()` | `["dashboard", "todayTransactions"]` | `transactions` | INSERT/UPDATE/DELETE on transactions |
| `useOutstandingTotal()` | `["dashboard", "outstandingTotal"]` | `stores` | UPDATE on stores.outstanding |
| `useHandoverPending()` | `["dashboard", "handoverPending"]` | `handovers` | INSERT/UPDATE on handovers |
| `useLowStockAlerts()` | `["dashboard", "lowStockAlerts"]` | `product_stock`, `products` | UPDATE on product_stock |
| `useFulfillmentRate()` | `["dashboard", "fulfillmentRate"]` | `orders` | INSERT/UPDATE on orders |
| `useTopStaff()` | `["dashboard", "topStaff"]` | `sales`, `profiles` | INSERT on sales |

### Debouncing
React Query's `invalidateQueries` already coalesces calls within the same microtask. No manual debouncing needed — rapid-fire realtime events produce one refetch per microtask batch.

### Edge cases
- **Page not mounted**: Invalidation fires but no active query → no-op, React Query handles this.
- **Component remount**: Query returns cached data instantly (`staleTime: 30s` for dashboard), refetches in background.
- **Role change**: Dashboard role-gates data via existing warehouse/role filters in the query. Role change already triggers `useRealtimeSync` teardown + rebuild.

---

## 2. Notification Channel Reconnection

### Problem
`src/hooks/useNotifications.ts` subscribes to Postgres changes with no callback handler. If the channel drops (network blip, tab backgrounding, server restart), notifications are silently lost. Channel name uses `Math.random()` causing orphan channels on remount.

### Design

#### Stable channel naming
Replace `notifications-${user.id}-${Math.random()}`
→ `notifications-${user.id}`

The `useEffect` cleanup removes the old channel before creating a new one, so no orphan channels.

#### Subscribe status callback
Add status handler to `.subscribe()`:

| Status | Action |
|---|---|
| `SUBSCRIBED` | Reset retry counter to 0 |
| `CHANNEL_ERROR` | Increment retry. If ≤ 3, schedule reconnect with exponential backoff (1s, 2s, 4s). |
| `CLOSED` | Same as CHANNEL_ERROR |
| `TIMED_OUT` | Same as CHANNEL_ERROR |

Reconnect schedule uses `setTimeout`, cleared on unmount.

#### Visibility change listener
Add `document.addEventListener("visibilitychange", ...)`:
- If tab comes to foreground AND channel status is not `SUBSCRIBED`, trigger reconnect immediately (skip backoff delay).

### Edge cases
- **Double delivery on reconnect**: Notification INSERT handler checks if `notification.id` was already shown in this session (in-memory Set of recent IDs, trimmed to 100 entries).
- **Channel status race**: If reconnect fires while a prior subscribe is still pending, close the old channel first. Use a `channelRef` to track the active channel.
- **Unmount during reconnect**: Cleanup clears the timeout and removes the channel, preventing stale setState.

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Replace raw supabase queries with hook calls, remove `useEffect` fetch |
| `src/hooks/useDashboardRealtime.ts` | **New** — all KPI query hooks |
| `src/hooks/useRealtimeSync.ts` | Add dashboard query keys to `TABLE_QUERY_MAP` |
| `src/hooks/useNotifications.ts` | Add reconnection logic, stable channel names, visibility listener, delivery dedup |

---

## Not in Scope
- Offline queue improvements (separate spec)
- Orders/sale-returns concurrency fixes (separate spec)
- Wiring `queryPersister` (separate spec)
- UseRealtimeSync role bug (separate fix)
