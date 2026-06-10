# Server-Side Search-As-You-Type — Design

## Problem
Five large datasets (Products, Customers, Sales, Orders, Transactions) use client-side `.toLowerCase().includes()` filtering on fetched data. Users type and wait for in-memory filter on potentially thousands of records. No debounce, no server-side query, wasted bandwidth fetching unfiltered data.

## Solution
Add a reusable `useDebounce` hook and upgrade `VirtualDataTable` to support an `onSearch` prop. Each page wires debounced search input → query key parameter → Supabase `.ilike()` filter. Server returns only matching records.

## Building Blocks

### `src/hooks/useDebounce.ts`
Extracted from GlobalSearch.tsx's inline implementation (only debounce in the app).

```ts
function useDebounce<T>(value: T, delay?: number): T
```
Default delay: 300ms.

### VirtualDataTable upgrade (`src/components/shared/VirtualDataTable.tsx`)
Two new optional props:

```ts
interface VirtualDataTableProps<T> {
  // ... existing props
  onSearch?: (value: string) => void;
  searchValue?: string;
}
```

When `onSearch` is provided:
- Search input renders as before, calls `onSearch(value)` on change
- Internal `search` state + `searchKey` filtering are disabled
- Table passes all `data` through unfiltered
- Parent owns filtering via query params

When `onSearch` is omitted (backward compatible): behavior unchanged.

## Per-Page Changes

### Products (`src/pages/Products.tsx`)
| Aspect | Current | New |
|--------|---------|-----|
| Query | `["products", warehouseId]`, fetches all | Add `search` to queryKey |
| Filter | `filteredProducts` useMemo client-side | `.or("name.ilike.%${s}%,sku.ilike.%${s}%,category.ilike.%${s}%")` in queryFn |
| Search UI | Desktop: explicit `<Input>`, Mobile: DataTable `searchKey="name"` | Debounced `search` state → query param |
| Remove | `filteredProducts` useMemo | Replace with `products` (now server-filtered) |

Search fields: name, sku, category.

### Sales (`src/hooks/useSalesList.ts` + `src/pages/Sales.tsx`)

| Aspect | Current | New |
|--------|---------|-----|
| Query | `["sales", ...filters]` | Add `filterSearch` to queryKey |
| Filter | VirtualDataTable `searchKey="display_id"` client-side | `.or("display_id.ilike.%${s}%,stores.name.ilike.%${s}%")` in queryFn |
| UI | VirtualDataTable internal search input | `onSearch` + `searchValue` props, debounced |

Search fields: display_id, store name.

### Customers (`src/pages/Customers.tsx`)

| Aspect | Current | New |
|--------|---------|-----|
| Query | `get_accessible_customers` RPC | When `search` non-empty: switch to Supabase query with `.or("name.ilike.%${s}%,display_id.ilike.%${s}%,phone.ilike.%${s}%")`. When empty: RPC as before. |
| Filter | VirtualDataTable `searchKey="name"` | `onSearch` + `searchValue` props |
| Search fields | name | name, display_id, phone |

### Orders (`src/pages/Orders.tsx`)

| Aspect | Current | New |
|--------|---------|-----|
| Query | `useInfiniteQuery` with existing filters | Add `search` to queryKey |
| Filter | VirtualDataTable `searchKey="display_id"` client-side | `.or("display_id.ilike.%${s}%,stores.name.ilike.%${s}%")` in queryFn |
| UI | VirtualDataTable internal search input | `onSearch` + `searchValue` props |

Search fields: display_id, store name.

### Transactions (`src/pages/Transactions.tsx`)

| Aspect | Current | New |
|--------|---------|-----|
| Query | `useInfiniteQuery` with existing filters | Add `search` to queryKey |
| Filter | VirtualDataTable `searchKey="display_id"` client-side | `.or("display_id.ilike.%${s}%,description.ilike.%${s}%")` in queryFn |
| UI | VirtualDataTable internal search input | `onSearch` + `searchValue` props |

Search fields: display_id, description.

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty search string | `.ilike("%")` returns all records (no filter) |
| Search < 2 chars? | Send to server immediately (ilike handles short strings well, no need to gate) |
| Debounce during typing previous results stale? | Query key changes → new fetch → stale results replaced. `keepPreviousData` not needed given 300ms debounce |
| RPC-based pages (Customers) | Fallback to direct Supabase query when search non-empty. RPC used when no search. |
| Backward compatibility | `VirtualDataTable` without `onSearch` — unchanged. Pages that don't opt in — unchanged. |

## Testing
- `useDebounce` — value updates after delay, intermediate values skipped
- `VirtualDataTable` — with `onSearch`: calls callback, does not filter internally. Without `onSearch`: unchanged.
- Each page — search term appears in Supabase query, results filtered server-side
- Full suite: 197+ tests pass
