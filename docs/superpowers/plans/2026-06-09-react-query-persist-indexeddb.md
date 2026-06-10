# React Query Persist — IndexedDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire `@tanstack/react-query-persist-client` with IndexedDB to persist ~35 core query keys across page reloads and enable instant display on cold start.

**Architecture:** Thin `idb-keyval` adapter implements TanStack's `Persister` interface; `PersistQueryClientProvider` in `App.tsx` orchestrates rehydration/persistence; curated allowlist in `persistedQueries.ts` limits scope.

**Tech Stack:** `@tanstack/react-query-persist-client@5.100.14` (installed), `idb-keyval` (to install), vitest, TypeScript

---

### Task 1: Install idb-keyval

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install idb-keyval**

Run: `npm install idb-keyval`

Expected: Added to `package.json` dependencies.

---

### Task 2: Create persisted query key allowlist

**Files:**
- Create: `src/lib/persistedQueries.ts`
- Test: (tested implicitly by persister filter)

- [ ] **Step 1: Create allowlist module**

```typescript
export const PERSISTED_QUERY_PREFIXES = new Set([
  "sales", "sale-items",
  "orders", "order-items",
  "products", "product-categories",
  "customers", "customer",
  "stores", "store",
  "routes",
  "inventory",
  "transactions",
  "invoices", "invoice", "invoice-items",
  "purchases", "purchase-items",
  "vendors", "vendor",
  "expenses", "expense-categories",
  "stock-transfers", "stock-movements",
  "product-stock", "warehouse-stock", "staff-stock", "agent-stock",
  "sale-returns", "purchase-returns",
  "handovers",
  "company-settings", "business-info",
  "workers", "payrolls", "payroll",
  "raw-materials", "bill-of-materials", "boms", "production-log",
  "vehicles",
  "notifications",
  "user-roles", "my-permissions",
]);

export function isQueryPersisted(queryKey: string[]): boolean {
  return PERSISTED_QUERY_PREFIXES.has(queryKey[0]);
}
```

---

### Task 3: Create IndexedDB persister adapter

**Files:**
- Create: `src/lib/persister.ts`

- [ ] **Step 1: Create the persister module**

```typescript
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { isQueryPersisted } from "./persistedQueries";

const APP_PREFIX = "ap";

export function createIndexedDbPersister(): Persister {
  return {
    async persistClient(client: PersistedClient) {
      const filtered: PersistedClient = {
        ...client,
        clientState: {
          ...client.clientState,
          queries: client.clientState.queries.filter((q) =>
            isQueryPersisted(q.queryKey),
          ),
        },
      };
      await set(APP_PREFIX, filtered);
    },
    async restoreClient(): Promise<PersistedClient | undefined> {
      return await get<PersistedClient>(APP_PREFIX);
    },
    async removeClient() {
      await del(APP_PREFIX);
    },
  };
}
```

---

### Task 4: Wire PersistQueryClientProvider in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Add after the existing `@tanstack/react-query` import:
```typescript
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIndexedDbPersister } from "@/lib/persister";
```

- [ ] **Step 2: Create persister instance outside component**

Add after the `queryClient` declaration (around line 112):
```typescript
const indexedDbPersister = createIndexedDbPersister();
```

- [ ] **Step 3: Replace QueryClientProvider with PersistQueryClientProvider**

Change:
```tsx
<QueryClientProvider client={queryClient}>
```
To:
```tsx
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister: indexedDbPersister,
    maxAge: 1000 * 60 * 60 * 24,
    buster: "v1",
    prefix: "ap",
  }}
>
```

- [ ] **Step 4: Close PersistQueryClientProvider**

Change the closing tag:
```tsx
</QueryClientProvider>
```
To:
```tsx
</PersistQueryClientProvider>
```

---

### Task 5: Persister unit tests

**Files:**
- Create: `src/test/persister.test.ts`
- Test utility: set up `fake-indexeddb` in test setup

- [ ] **Step 1: Write persister adapter test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIndexedDbPersister } from "@/lib/persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

describe("createIndexedDbPersister", () => {
  const persister = createIndexedDbPersister();
  const mockClient: PersistedClient = {
    timestamp: Date.now(),
    buster: "v1",
    clientState: {
      queries: [
        {
          queryKey: ["sales"],
          state: { data: [{ id: 1 }], dataUpdateCount: 1, dataUpdatedAt: Date.now() },
        },
      ],
      mutations: [],
    },
  };

  it("persists and restores a client", async () => {
    await persister.persistClient(mockClient);
    const restored = await persister.restoreClient();
    expect(restored).toEqual(mockClient);
  });

  it("removes a persisted client", async () => {
    await persister.persistClient(mockClient);
    await persister.removeClient();
    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
  });

  it("returns undefined when nothing persisted", async () => {
    await persister.removeClient();
    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/test/persister.test.ts --no-coverage`

Expected: 3 passed

---

### Task 6: Verify full test suite still passes

- [ ] **Step 1: Run everything**

Run: `npx vitest run --no-coverage`

Expected: 193+ tests passed (existing + new persister tests)
