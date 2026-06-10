# React Query Persist Client — IndexedDB Cache Persistence

## Problem
The app uses `@tanstack/react-query` for data fetching but the query cache is ephemeral — lost on page refresh or app restart. Users see loading spinners on every cold start even for data that hasn't changed. Offline usage is limited to whatever happens to be in memory.

## Solution
Wire `@tanstack/react-query-persist-client` with an IndexedDB backend via `idb-keyval` to persist a curated subset of query data. On cold start, persisted cache hydrates instantly → pages render immediately → `staleTime` (5 min) + realtime subscriptions trigger background refetches to bring data current.

## Architecture

### Files
| File | Purpose |
|------|---------|
| `src/lib/persister.ts` | Async storage adapter wrapping `idb-keyval` |
| `src/lib/persistedQueries.ts` | Curated allowlist of query key prefixes |
| `src/App.tsx` | `PersistQueryClientProvider` + `persistQueryClient()` call |

### Flow
```
App mount
  → PersistQueryClientProvider rehydrates from IndexedDB
  → Pages render with cached data (no loading spinner)
  → staleTime triggers background refetch (queries refetch if stale)
  → Realtime subscriptions push invalidations (refetch if changed)
  → Mutation writes → cache update → persister debounces write to IndexedDB
```

## Persisted Query Allowlist

Persist all core entity keys that provide instant-display value:

```
sales, sale-items, orders, order-items, products, customers, stores,
routes, inventory, transactions, invoices, invoice-items, purchases,
purchase-items, vendors, expenses, expense-categories, stock-transfers,
stock-movements, product-stock, warehouse-stock, staff-stock, agent-stock,
sale-returns, purchase-returns, handovers, company-settings,
business-info, workers, payrolls, raw-materials, bill-of-materials,
production-log, vehicles, notifications, user-roles, my-permissions
```

**Excluded** (realtime-heavy / ephemeral / session-scoped / report data):
- `mobile-*` — single-session scoped
- `*-dashboard`, `dashboard-*` — realtime snapshot, stale on reload
- `daybook-*`, `statement-*`, `report-*` — re-fetched on demand
- `lookup-*`, `*-for-*`, `*-filter-*` — ephemeral helpers
- `all-*` — expensive full-table refetches
- `analytics` — computed data, external source of truth

## Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| `maxAge` | 24 hours | Default TanStack value; matches reasonable offline window |
| `throttleTime` | 1000ms | Debounce IndexedDB writes (avoid thrashing on batch invalidations) |
| `prefix` | `"ap-"` | Distinct prefix scoped to this app |
| `buster` | App version hash | Bust stale cache on deploy |

## Edge Cases

### Cold start (fresh install / cleared storage)
No persisted cache → normal network flow. Loading spinners shown once, cache populated thereafter.

### Stale cache (maxAge exceeded)
Persisted data discarded, fresh network fetch. No risk of showing "old" data.

### Deploy (new app version)
`buster` param changes → persisted cache is discarded, fresh fetch from network. Avoids hydration mismatch after schema/query changes.

### IndexedDB unavailable (private browsing, storage full)
`persistQueryClient` fails gracefully → fall back to no persistence. App operates normally without it.

### Offline mode
Data persists from last online session. Reads from IndexedDB work. Writes go through offline queue (`src/lib/offlineQueue.ts`). On reconnect, realtime + staleTime bring data current.

## Testing
- Unit: adapter functions handle get/set/remove correctly with IndexedDB
- Integration: query cache persists across page reload (manual or via test)
- Existing tests must continue passing (193 tests)
