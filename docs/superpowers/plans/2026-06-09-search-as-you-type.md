# Server-Side Search-As-You-Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add debounced server-side `.ilike()` search to Products, Customers, Sales, Orders, and Transactions pages using a shared `useDebounce` hook and `VirtualDataTable` upgrade.

**Architecture:** `useDebounce` hook + `VirtualDataTable` `onSearch` prop + per-page debounced search params wired into query keys and Supabase `.ilike()` filters. Server returns only matching records.

**Tech Stack:** `@tanstack/react-query`, Supabase, vitest, TypeScript

---

**File Map:**
- Create: `src/hooks/useDebounce.ts`
- Create: `src/test/useDebounce.test.ts`
- Modify: `src/components/shared/VirtualDataTable.tsx`
- Modify: `src/pages/Products.tsx`
- Modify: `src/hooks/useSalesList.ts`
- Modify: `src/pages/Sales.tsx`
- Modify: `src/pages/Customers.tsx`
- Modify: `src/pages/Orders.tsx`
- Modify: `src/pages/Transactions.tsx`

---

### Task 1: Create useDebounce hook

**Files:**
- Create: `src/hooks/useDebounce.ts`
- Create: `src/test/useDebounce.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update before delay", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "hello" } },
    );
    rerender({ val: "world" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("hello");
  });

  it("updates after delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "hello" } },
    );
    rerender({ val: "world" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("world");
  });

  it("resets timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val, 300),
      { initialProps: { val: "a" } },
    );
    rerender({ val: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ val: "abc" });
    act(() => vi.advanceTimersByTime(200));
    // 200ms after last change = only 400ms from start, no debounce fire yet
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(100));
    // 300ms after "abc" — now it should update
    expect(result.current).toBe("abc");
  });

  it("uses default delay of 300ms", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val),
      { initialProps: { val: "one" } },
    );
    rerender({ val: "two" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("two");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/useDebounce.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/useDebounce.test.ts --no-coverage`
Expected: PASS (5 tests)

---

### Task 2: Upgrade VirtualDataTable with onSearch prop

**Files:**
- Modify: `src/components/shared/VirtualDataTable.tsx`

- [ ] **Step 1: Add onSearch and searchValue to interface**

Change the `VirtualDataTableProps` interface to add:
```typescript
interface VirtualDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onRowClick?: (row: T) => void;
  height?: string | number;
  emptyMessage?: string;
  renderMobileCard?: (row: T) => React.ReactNode;
  keyExtractor?: (row: T) => string | number;
  getRowClassName?: (row: T) => string | undefined;
  onSearch?: (value: string) => void;
  searchValue?: string;
}
```

- [ ] **Step 2: Update destructured props**

Change the destructuring to add:
```typescript
export function VirtualDataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  onRowClick,
  height = "600px",
  emptyMessage = "No results found.",
  renderMobileCard,
  keyExtractor,
  getRowClassName,
  onSearch,
  searchValue,
}: VirtualDataTableProps<T>) {
```

- [ ] **Step 3: Replace internal search state with conditional logic**

Change:
```typescript
const [search, setSearch] = useState("");
```
To:
```typescript
const [internalSearch, setInternalSearch] = useState("");
const search = onSearch ? (searchValue ?? "") : internalSearch;
const setSearch = onSearch ? onSearch : setInternalSearch;
```

- [ ] **Step 4: Disable internal filtering when onSearch is provided**

Change the `filteredData` useMemo to skip filtering when `onSearch` is set:
```typescript
const filteredData = useMemo(() => {
  if (onSearch) return data; // server-side search — parent controls filtering
  if (!searchKey || !search) return data;
  const lowerSearch = search.toLowerCase();
  return data.filter((row) => {
    const val = row[searchKey];
    return String(val).toLowerCase().includes(lowerSearch);
  });
}, [data, search, searchKey, onSearch]);
```

- [ ] **Step 5: Remove the records count message when using server-side search**

No change needed — the count shows `filteredData.length` which equals `data.length` when `onSearch` is set. The count reflects what's displayed.

---

### Task 3: Products page — server-side search

**Files:**
- Modify: `src/pages/Products.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:
```typescript
import { useDebounce } from "@/hooks/useDebounce";
```

- [ ] **Step 2: Replace client-side searchTerm with debounced version**

Change:
```typescript
const [searchTerm, setSearchTerm] = useState("");
```
To:
```typescript
const [searchTerm, setSearchTerm] = useState("");
const debouncedSearch = useDebounce(searchTerm);
```

- [ ] **Step 3: Add search to query key and queryFn**

Change the `useQuery` call to add `debouncedSearch` to queryKey and add `.or()` filter:
```typescript
const { data: products, isLoading } = useQuery({
  queryKey: ["products", currentWarehouse?.id, debouncedSearch],
  queryFn: async () => {
    let query = supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (currentWarehouse?.id) {
      query = query.eq("warehouse_id", currentWarehouse.id);
    }

    if (debouncedSearch.trim()) {
      const term = `%${debouncedSearch.trim()}%`;
      query = query.or(
        `name.ilike.${term},sku.ilike.${term},category.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
});
```

- [ ] **Step 4: Remove client-side filter**

Delete the `filteredProducts` useMemo block (lines 93-102) and replace all `filteredProducts` references with `products || []`:
- Line 308: `<div className="entity-grid">` iterates over `filteredProducts` → change to `{(products || []).map(...)}`
- Line 387: `{filteredProducts.length === 0 &&` → change to `{(products || []).length === 0 &&`

---

### Task 4: useSalesList hook — add search filter

**Files:**
- Modify: `src/hooks/useSalesList.ts`
- Modify: `src/pages/Sales.tsx`

- [ ] **Step 1: Add filterSearch state to useSalesList**

Add after the existing filter states:
```typescript
const [filterSearch, setFilterSearch] = useState("");
```

- [ ] **Step 2: Add search to query key**

Change the queryKey to include `filterSearch`:
```typescript
queryKey: ["sales", currentWarehouse?.id, isAdmin ? "all" : user?.id,
  filterFrom, filterTo, filterStore, filterStoreType, filterRoute,
  filterUser, filterPayment, filterSearch, loadedPages],
```

- [ ] **Step 3: Add .or() filter to queryFn**

Add before the `.range()` call:
```typescript
if (filterSearch.trim()) {
  const term = `%${filterSearch.trim()}%`;
  q = q.or(`display_id.ilike.${term},stores.name.ilike.${term}`);
}
```

- [ ] **Step 4: Add filterSearch to return object**

Add to the return object:
```typescript
filterSearch, setFilterSearch,
```

- [ ] **Step 5: Wire debounced search in Sales.tsx**

In `src/pages/Sales.tsx`, add imports:
```typescript
import { useDebounce } from "@/hooks/useDebounce";
```

After destructuring the hook, add:
```typescript
const debouncedFilterSearch = useDebounce(filterSearch);
```

Add a `useEffect` to sync debounced value to hook:
```typescript
useEffect(() => {
  setFilterSearch(debouncedFilterSearch);
}, [debouncedFilterSearch, setFilterSearch]);
```

Wait, this is messy. Better approach: keep `filterSearch` as the local search state, and pass `debouncedFilterSearch` to `useSalesList` somehow. But `useSalesList` owns the state currently.

Actually, the cleanest approach: instead of adding `filterSearch` as state inside `useSalesList`, keep the search state in `Sales.tsx` and pass it as a parameter. Let me reconsider...

Actually, since `useSalesList` owns `setFilterSearch`, and the debounce needs to happen in the component, the simplest pattern is:
- Add `filterSearch` state to `useSalesList` (for the debounced value)
- Add `filterSearchInput` as a new state (for the raw input)
- Add `setFilterSearchInput` to the return
- In the hook, debounce `filterSearchInput` to set `filterSearch`
- Use `filterSearch` in the query

Actually, even simpler: don't put the search state inside useSalesList. Put it in Sales.tsx:

In Sales.tsx:
```typescript
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);
```

Pass `debouncedSearch` to `useSalesList` as a parameter. But useSalesList is a hook that doesn't accept params...

Let me look at the current Sales.tsx to see how useSalesList is used.

Actually, I don't need to read it again. I know the pattern. The cleanest approach:

In `useSalesList`: add `searchTerm` as a parameter (an optional string):
```typescript
export function useSalesList(searchTerm?: string) {
```

Add it to the query key and query filter. The hook's consumer passes the debounced value.

In `Sales.tsx`:
```typescript
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);
const { ..., filterSearch: debouncedSearch, setFilterSearch: setSearchInput } = useSalesList();
```

No actually, that won't work cleanly. Let me think about this differently.

The simplest approach that requires minimal changes:

1. In `useSalesList.ts` — add `filterSearch` state
2. In the return, expose `filterSearch` and `setFilterSearch`
3. In `Sales.tsx`:
   - Create a local `searchInput` state
   - Use `useDebounce` to get `debouncedSearch`
   - Use `useEffect` to sync `debouncedSearch` → `setFilterSearch`

This is clean. Let me write it that way.

In useSalesList.ts, add `filterSearch` state:
```typescript
const [filterSearch, setFilterSearch] = useState("");
```

Add to queryKey and queryFn as above.

In Sales.tsx:
```typescript
import { useDebounce } from "@/hooks/useDebounce";

// Inside component:
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);

const {
  // ... existing destructuring
  setFilterSearch,
  // ...
} = useSalesList();

useEffect(() => {
  setFilterSearch(debouncedSearch);
}, [debouncedSearch, setFilterSearch]);
```

And the VirtualDataTable gets:
```typescript
onSearch={setSearchInput}
searchValue={searchInput}
```

This is clean. Let me write it this way.

- [ ] **Step 6: Wire VirtualDataTable in Sales.tsx**

The VirtualDataTable currently has `searchKey="display_id"`. Replace with:
```typescript
<VirtualDataTable
  ...
  searchKey="display_id"
  onSearch={setSearchInput}
  searchValue={searchInput}
/>
```

The `searchKey` can be removed since it's no longer used for filtering, but keeping it doesn't hurt. Actually, since `onSearch` is provided, `searchKey` is ignored. I'll keep it for now.

---

### Task 5: Customers page — search with RPC fallback

**Files:**
- Modify: `src/pages/Customers.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:
```typescript
import { useDebounce } from "@/hooks/useDebounce";
```

- [ ] **Step 2: Add search state + debounce**

Add after the existing `const [filters, setFilters]`:
```typescript
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);
```

- [ ] **Step 3: Modify useInfiniteQuery to conditionally use search**

Change the queryKey to include `debouncedSearch`:
```typescript
queryKey: ["customers", currentWarehouse?.id, user?.id, role, debouncedSearch],
```

Change the queryFn to use Supabase query when search is non-empty:
```typescript
queryFn: async ({ pageParam = 0 }) => {
  if (debouncedSearch.trim()) {
    const term = `%${debouncedSearch.trim()}%`;
    const { data, error } = await supabase
      .from("customers")
      .select("id, display_id, name, phone, email, kyc_status, is_active, created_at")
      .or(`name.ilike.${term},display_id.ilike.${term},phone.ilike.${term}`)
      .eq("warehouse_id", currentWarehouse?.id || "")
      .order("created_at", { ascending: false })
      .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    return data || [];
  }
  // ... existing RPC call ...
},
```

- [ ] **Step 4: Wire VirtualDataTable**

Find the VirtualDataTable usage and add:
```typescript
<VirtualDataTable
  ...
  searchKey="name"
  onSearch={setSearchInput}
  searchValue={searchInput}
/>
```

---

### Task 6: Orders page — server-side search

**Files:**
- Modify: `src/pages/Orders.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:
```typescript
import { useDebounce } from "@/hooks/useDebounce";
```

- [ ] **Step 2: Find the search state**

Search for `useState` declarations near the top of the component. Look for existing search-related state or the query key. Add:
```typescript
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);
```

- [ ] **Step 3: Add search to query key**

Find the `useInfiniteQuery` call and add `debouncedSearch` to its queryKey:
```typescript
queryKey: [..., debouncedSearch],
```

- [ ] **Step 4: Add .or() filter to queryFn**

Before the final `.range()` call, add:
```typescript
if (debouncedSearch.trim()) {
  const term = `%${debouncedSearch.trim()}%`;
  q = q.or(`display_id.ilike.${term},stores.name.ilike.${term}`);
}
```

- [ ] **Step 5: Wire VirtualDataTable**

Find the VirtualDataTable usage (around line 1587) and add:
```typescript
<VirtualDataTable
  ...
  searchKey="display_id"
  onSearch={setSearchInput}
  searchValue={searchInput}
/>
```

---

### Task 7: Transactions page — server-side search

**Files:**
- Modify: `src/pages/Transactions.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:
```typescript
import { useDebounce } from "@/hooks/useDebounce";
```

- [ ] **Step 2: Add search state + debounce**

Add:
```typescript
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput);
```

- [ ] **Step 3: Add search to query key**

Find the `useInfiniteQuery` call and add `debouncedSearch` to its queryKey.

- [ ] **Step 4: Add .or() filter to queryFn**

Before the `.range()` call, add:
```typescript
if (debouncedSearch.trim()) {
  const term = `%${debouncedSearch.trim()}%`;
  q = q.or(`display_id.ilike.${term},description.ilike.${term}`);
}
```

- [ ] **Step 5: Wire VirtualDataTable**

Around the VirtualDataTable usage, add:
```typescript
<VirtualDataTable
  ...
  searchKey="display_id"
  onSearch={setSearchInput}
  searchValue={searchInput}
/>
```

---

### Task 8: Verify full test suite

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --no-coverage`
Expected: 202+ tests passed (197 existing + 5 new useDebounce tests)
