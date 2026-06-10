# Offline-First APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Capacitor APK load and run entirely offline from first launch, with only data fetch/push requiring internet.

**Architecture:** Three layers — (1) Auth persistence via IndexedDB cache so the app doesn't deadlock on boot, (2) React Query cache persisted to IndexedDB so pages render from local data, (3) enhanced offline queue with FCFS timestamp ordering for deterministic sync. No SQLite, no native plugins beyond what's already installed.

**Tech Stack:** @tanstack/react-query v5, @tanstack/react-query-persist-client, IndexedDB (existing in offlineQueue.ts), Capacitor 8

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Run: `npm install`

- [ ] **Step 1: Install persist client**

```bash
npm install @tanstack/react-query-persist-client
```

- [ ] **Step 2: Verify install**

```bash
npm ls @tanstack/react-query-persist-client
```

Expected output shows `@tanstack/react-query-persist-client@5.x.x`

---

### Task 2: Create Auth Cache Module

**Files:**
- Create: `src/lib/authCache.ts`

Purpose: Store and retrieve auth state (role, profile, warehouses) from IndexedDB so the app can boot offline.

- [ ] **Step 1: Create authCache.ts**

```ts
import { openDB } from "./offlineQueue";

export interface CachedAuthState {
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  } | null;
  role: string | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  customer: { id: string; user_id: string | null; name: string; phone: string | null; email: string | null } | null;
  needsOnboarding: boolean;
  warehouses: string[];
  warehouse: { id: string; name: string } | null;
  cachedAt: string;
}

const AUTH_CACHE_KEY = "auth_cache";

async function getAuthStore(): Promise<IDBObjectStore> {
  const db = await openDB();
  const tx = db.transaction("auth_cache", "readwrite");
  return tx.objectStore("auth_cache");
}

export async function cacheAuthState(state: CachedAuthState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readwrite");
    const store = tx.objectStore("auth_cache");
    store.put({ id: AUTH_CACHE_KEY, ...state, cachedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAuthState(): Promise<CachedAuthState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readonly");
    const store = tx.objectStore("auth_cache");
    const req = store.get(AUTH_CACHE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAuthCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readwrite");
    const store = tx.objectStore("auth_cache");
    store.delete(AUTH_CACHE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: Update IndexedDB schema in offlineQueue.ts**

Modify `openDB()` in `src/lib/offlineQueue.ts` to add the `auth_cache` store.

In the `req.onupgradeneeded` handler, after the existing conflict store creation:

```ts
if (!db.objectStoreNames.contains("auth_cache")) {
  db.createObjectStore("auth_cache", { keyPath: "id" });
}
```

Also bump `DB_VERSION` from `4` to `5`:

```ts
const DB_VERSION = 5;
```

---

### Task 3: Modify AuthContext for Offline Fallback

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

Purpose: On boot, try network first, fall back to cached auth state if offline. Add a 2-second timeout so the app never deadlocks on `loading=true`.

- [ ] **Step 1: Add imports at top of AuthContext.tsx**

After the existing imports:

```ts
import { cacheAuthState, getCachedAuthState, clearAuthCache, type CachedAuthState } from "@/lib/authCache";
import { isNativeApp } from "@/lib/capacitorUtils";
```

- [ ] **Step 2: Add cached state fallback in fetchUserData**

Wrap the entire try block in `fetchUserData` function. After the catch block for `resolverError`, add:

```ts
// Inside fetchUserData, wrap the try block
try {
  // ... existing RPC + DB query code ...
} catch (resolverError) {
  logError("Resolver RPC failed, falling back to legacy user resolution", resolverError);
  // ... existing fallback code ...
}
// After setRole, setProfile, etc on success:
try {
  await cacheAuthState({
    session: session ? { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at } : null,
    role: resolvedRole,
    profile: profile ?? null,
    customer: resolvedCustomer,
    needsOnboarding: resolvedNeedsOnboarding,
    warehouses,
    warehouse,
    cachedAt: new Date().toISOString(),
  } as CachedAuthState);
} catch (e) {
  logError("Failed to cache auth state", e);
}
```

- [ ] **Step 3: Add offline fallback in initAuth and onAuthStateChange**

In both `initAuth` and the `onAuthStateChange` callback, add a timeout + fallback. Modify the `fetchUserData` call path:

In `initAuth`, after the try block in `fetchUserData`, add this catch:

```ts
// In initAuth, modify the try block
try {
  const { data: { session } } = await supabase.auth.getSession();
  // ... existing code ...
  if (session?.user) {
    await fetchUserData(session.user.id);
  }
} catch (error) {
  logError("Auth context initialization error", error);
  // If offline and we have cached auth, use it
  if (!navigator.onLine) {
    const cached = await getCachedAuthState();
    if (cached && cached.role) {
      setRole(cached.role as any);
      setProfile(cached.profile as any);
      setCustomer(cached.customer as any);
      setNeedsOnboarding(cached.needsOnboarding);
      setWarehouses(cached.warehouses);
      if (cached.warehouse) setWarehouseState(cached.warehouse);
    }
  }
} finally {
  if (mounted) setLoading(false);
}
```

And add a 2-second timeout to prevent permanent loading:

```ts
// After setLoading(true) at the start, set a timeout
const loadingTimeout = setTimeout(() => {
  if (mounted && loading) {
    logDebug("[Auth] Loading timeout reached, checking cache");
    getCachedAuthState().then((cached) => {
      if (cached && mounted) {
        setRole(cached.role as any);
        setProfile(cached.profile as any);
        setCustomer(cached.customer as any);
        setNeedsOnboarding(cached.needsOnboarding);
        setWarehouses(cached.warehouses);
        if (cached.warehouse) setWarehouseState(cached.warehouse);
      }
      if (mounted) setLoading(false);
    });
  }
}, 2000);
```

And clear it when loading resolves:

```ts
// Inside fetchUserData success path, and inside the finally block
clearTimeout(loadingTimeout);
```

- [ ] **Step 4: Update signOut to clear auth cache**

In the `signOut` function, add:

```ts
await clearAuthCache();
```

---

### Task 4: Create React Query Persister

**Files:**
- Create: `src/lib/queryPersister.ts`
- Modify: `src/App.tsx`

Purpose: Persist React Query cache to IndexedDB so page data is available offline.

- [ ] **Step 1: Create queryPersister.ts**

```ts
import { type PersistedClient, type Persister } from "@tanstack/react-query-persist-client";
import { openDB } from "./offlineQueue";

const CACHE_KEY = "react_query_cache";

async function getPersisterStore(): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction("query_cache", "readwrite").objectStore("query_cache");
}

export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readwrite");
        tx.objectStore("query_cache").put({ id: CACHE_KEY, value: JSON.stringify(client), updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    restoreClient: async () => {
      const db = await openDB();
      return new Promise<PersistedClient | undefined>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readonly");
        const req = tx.objectStore("query_cache").get(CACHE_KEY);
        req.onsuccess = () => {
          const result = req.result;
          if (result?.value) {
            try { resolve(JSON.parse(result.value)); }
            catch { resolve(undefined); }
          } else {
            resolve(undefined);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },
    removeClient: async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readwrite");
        tx.objectStore("query_cache").delete(CACHE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}
```

- [ ] **Step 2: Update IndexedDB schema**

In `openDB()` in `src/lib/offlineQueue.ts`, add `query_cache` store (already bumping to v5 with auth_cache above):

```ts
if (!db.objectStoreNames.contains("query_cache")) {
  db.createObjectStore("query_cache", { keyPath: "id" });
}
```

- [ ] **Step 3: Configure persistence in App.tsx**

At the top of `src/App.tsx`, add imports:

```ts
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createIndexedDbPersister } from "@/lib/queryPersister";
```

After creating `queryClient` (around line 100-112), add:

```ts
const persister = createIndexedDbPersister();

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  buster: import.meta.env.VITE_APP_VERSION || "1",
});
```

Update QueryClient default options:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 60 * 1000, // 30 min — don't refetch aggressively
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days — keep in cache
      networkMode: "offlineFirst", // try cache before network
    },
    mutations: {
      onError: (error) => {
        logError("Global mutation error", error);
      },
    },
  },
});
```

---

### Task 5: Enhance Offline Queue with FCFS Ordering

**Files:**
- Modify: `src/lib/offlineQueue.ts`

Purpose: Add deterministic FCFS ordering by `createdAt` for sync processing.

- [ ] **Step 1: Add sorted retrieval function**

Add to `src/lib/offlineQueue.ts`:

```ts
export async function getQueuedActionsOrdered(): Promise<PendingAction[]> {
  const actions = await getQueuedActions();
  return actions.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function getRetryableActionsOrdered(): Promise<PendingAction[]> {
  const actions = await getRetryableActions();
  return actions.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
```

---

### Task 6: Update Sync Hook for Sequential FCFS Processing

**Files:**
- Modify: `src/hooks/useOnlineStatus.ts`

Purpose: Sync queued actions sequentially in FCFS order (oldest first), with each action completing before the next starts.

- [ ] **Step 1: Update import**

Replace:
```ts
  getRetryableActionsExcludingConflicts,
```
With:
```ts
  getRetryableActionsExcludingConflicts,
  getRetryableActionsOrdered,
```

- [ ] **Step 2: Modify syncQueue to use ordered processing**

In the `syncQueue` function, replace the action processing loop with ordered processing:

```ts
// Get actions ordered by createdAt (FCFS)
const actions = await getRetryableActionsOrdered();
const conflicted = await getConflictedActions();
const conflictIds = new Set(conflicted.map(a => a.id));
const orderedActions = actions.filter(a => !conflictIds.has(a.id));

for (const action of orderedActions) {
  // ... existing per-action processing logic (unchanged) ...
}
```

---

### Task 7: Update Service Worker Strategy

**Files:**
- Modify: `vite.config.ts`

Purpose: Ensure API caching uses stale-while-revalidate or cache-first when offline, and static assets are always served from cache.

- [ ] **Step 1: Update runtime caching in vite.config.ts**

In the `VitePWA` config, update the `workbox.runtimeCaching` entries to use `StaleWhileRevalidate` instead of `NetworkFirst` for API calls (faster offline fallback):

```ts
runtimeCaching: [
  {
    urlPattern: /^https?:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "supabase-api-cache",
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * SUPABASE_CACHE_DAYS,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: /^https?:\/\/.*\.supabase\.co\/auth\/v1\/.*/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "supabase-auth-cache",
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * AUTH_CACHE_HOURS,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  // Cache static assets with CacheFirst (already covered by globPatterns)
],
```

---

### Task 8: Build and Test APK

**Files:**
- Run: `npm run build` then `npm run build:apk:debug`

- [ ] **Step 1: Lint and type-check**

```bash
npm run lint
npx tsc --noEmit
```

Fix any issues.

- [ ] **Step 2: Build web app**

```bash
npm run build
```

- [ ] **Step 3: Sync Capacitor**

```bash
npx cap sync android
```

- [ ] **Step 4: Build debug APK**

```bash
cd android && .\gradlew.bat assembleDebug
```

APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`
