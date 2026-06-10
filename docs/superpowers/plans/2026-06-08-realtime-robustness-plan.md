# Realtime Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard reactive to realtime data changes and fix notification channel reconnection.

**Architecture:** Add dashboard query keys to `useRealtimeSync`'s `TABLE_QUERY_MAP` so mutations in other pages automatically invalidate dashboard data. Refactor ManagerDashboard into per-KPI hooks for granular invalidation. Fix `useNotifications` to handle WebSocket drops with exponential backoff.

**Tech Stack:** React Query (`@tanstack/react-query`), Supabase Realtime, Vitest

---

### Task 1: Wire Dashboard query keys into TABLE_QUERY_MAP

**Files:**
- Modify: `src/hooks/useRealtimeSync.ts:8-13`

The SuperAdminDashboard uses `queryKey: ["super-admin-dashboard-stats"]` and ManagerDashboard uses `queryKey: ["manager-dashboard", ...]`. These keys are NOT in the `TABLE_QUERY_MAP`, so realtime events never invalidate them.

- [ ] **Step 1: Add dashboard query keys to the DASHBOARD constant**

In `src/hooks/useRealtimeSync.ts`, add `"super-admin-dashboard-stats"`, `"manager-dashboard"`, and `"default-dashboard"` (fallback) to the DASHBOARD array:

```ts
const DASHBOARD = [
  "dashboard-stats", "agent-dashboard-stats", "manager-dashboard",
  "agent-dashboard", "customer-dashboard", "default-dashboard",
  "super-admin-dashboard-stats", "pos-dashboard", "marketer-dashboard",
  "operator-dashboard",
];
```

(The `"manager-dashboard"` and `"super-admin-dashboard-stats"` entries are what we're adding — the rest already exist.)

- [ ] **Step 2: Verify the fix works**

Run: `npm run build`

Expected: No TypeScript errors. The DASHBOARD array is used by sales, transactions, stores, handovers, orders, customers, and profiles entries in TABLE_QUERY_MAP — any realtime event on those tables now invalidates dashboard queries.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRealtimeSync.ts
git commit -m "fix: wire dashboard query keys into realtime invalidation map"
```

---

### Task 2: Reconnect notification channel on WebSocket drop

**Files:**
- Modify: `src/hooks/useNotifications.ts:117-173`

The notification channel uses `Math.random()` in the channel name (causes orphan channels on remount) and has no `subscribe()` status callback — silent failure on disconnect.

- [ ] **Step 1: Replace the effect with reconnection logic**

Replace lines 114-173 (`useEffect` for realtime subscription) with this:

```tsx
  // Stable channel name + reconnection logic
  useEffect(() => {
    if (!user) return;

    const SEEN = new Set<string>();
    const MAX_SEEN = 100;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const channelName = `notifications-${user.id}`;
    let channel = supabase.channel(channelName);

    function setupChannel() {
      if (!mounted) return;
      if (channel) {
        supabase.removeChannel(channel);
      }

      channel = supabase.channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            if (SEEN.has(newNotif.id)) return;
            SEEN.add(newNotif.id);
            if (SEEN.size > MAX_SEEN) {
              const first = SEEN.values().next().value;
              if (first) SEEN.delete(first);
            }

            queryClient.setQueryData<AppNotification[]>(queryKey, (old) => {
              if (!old) return [newNotif];
              if (old.some((n) => n.id === newNotif.id)) return old;
              return [newNotif, ...old].slice(0, 50);
            });

            if (!Capacitor.isNativePlatform()) {
              showBrowserNotification(newNotif.title, newNotif.message);
            } else {
              fireNativeNotification(newNotif.id, newNotif.title, newNotif.message);
            }
            toast(newNotif.title, { description: newNotif.message, duration: 5000 });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const updated = payload.new as AppNotification;
            queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
              old?.map((n) => (n.id === updated.id ? updated : n))
            );
          }
        )
        .subscribe((status: string) => {
          if (!mounted) return;
          if (status === "SUBSCRIBED") {
            retryCount = 0;
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            if (retryCount >= MAX_RETRIES) return;
            const delay = Math.min(1000 * 2 ** retryCount, 8000);
            retryCount++;
            retryTimer = setTimeout(setupChannel, delay);
          }
        });
    }

    setupChannel();

    // Handle tab visibility change — reconnect if channel dropped while backgrounded
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        const ch = channel;
        if (ch && (ch as any)._state !== "SUBSCRIBED" && (ch as any).state !== "SUBSCRIBED") {
          retryCount = 0;
          if (retryTimer) clearTimeout(retryTimer);
          setupChannel();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryClient]);
```

- [ ] **Step 2: Build to check for errors**

Run: `npm run build`

Expected: No TypeScript errors. The `(ch as any)._state` access is a Supabase internal — if it causes TS errors, change to `(ch as any).state` or suppress with `// @ts-expect-error`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "fix: add notification channel reconnection with exponential backoff"
```

---

### Task 3: Write tests

**Files:**
- Create: `src/test/useNotifications.test.ts`

Test the reconnection logic by exporting the helper functions or testing the effect behavior.

Since `useNotifications` depends on `useAuth` and `useQueryClient`, use the existing mock pattern (same as `guards.test.tsx`).

- [ ] **Step 1: Write test for the effect lifecycle**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNotifications } from "@/hooks/useNotifications";

const mockUser = { id: "user-1" };
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// Minimal component to consume the hook
function NotificationsConsumer() {
  useNotifications();
  return null;
}

function renderConsumer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsConsumer />
    </QueryClientProvider>
  );
}

describe("useNotifications channel lifecycle", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: mockUser });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a channel with stable name based on user id", async () => {
    const channelSpy = vi.spyOn(
      (await import("@/integrations/supabase/client")).supabase,
      "channel"
    );
    renderConsumer();
    expect(channelSpy).toHaveBeenCalledWith("notifications-user-1");
  });

  it("removes the channel on unmount", async () => {
    const removeSpy = vi.spyOn(
      (await import("@/integrations/supabase/client")).supabase,
      "removeChannel"
    );
    const { unmount } = renderConsumer();
    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- src/test/useNotifications.test.tsx`

Expected: Tests pass. Note: The Supabase client mock will need adjustment — the actual Supabase channel/subscribe API may need more mocking. Fix any test failures.

- [ ] **Step 3: Commit**

```bash
git add src/test/useNotifications.test.tsx
git commit -m "test: add notification channel lifecycle tests"
```
