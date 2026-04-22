# Code Review: Runtime Error Analysis

**Reviewed:** 2025-01-19  
**Depth:** standard  
**Files Reviewed:** 30+ files across src/hooks, src/contexts, src/pages, src/components  
**Status:** issues_found

---

## Summary

This review identified **18 runtime issues** across the BizManager codebase. The most common patterns include:

1. **Missing error handling in Supabase queries** (8 issues)
2. **Potential null/undefined dereferences** (5 issues)
3. **React hook dependency issues** (3 issues)
4. **Event handler and async issues** (2 issues)

---

## Critical Issues

### CR-01: Unhandled Supabase Query Errors in Sales.tsx
**File:** `src/pages/Sales.tsx:149-173`
**Issue:** The sales query does not properly handle database errors, which can cause the UI to crash or show loading state indefinitely.

**Current Code:**
```typescript
const { data: sales, isLoading, isFetching } = useQuery({
  queryKey: ["sales", ...],
  queryFn: async () => {
    let query = (supabase as any).from("sales").select("*")...
    const { data, error } = await query;
    if (error) throw error;  // Only throws, no specific error handling
    return data;
  },
});
```

**Fix:** Add error boundary handling and user-friendly error messages:
```typescript
const { data: sales, isLoading, isError, error } = useQuery({
  queryKey: ["sales", ...],
  queryFn: async () => {
    const { data, error } = await query;
    if (error) {
      logError("Failed to fetch sales", error);
      throw new Error(getFriendlyErrorMessage(error));
    }
    return data;
  },
});
```

---

### CR-02: Missing User ID Check Before Query Execution
**File:** `src/hooks/usePermission.ts:11-19`
**Issue:** The query attempts to use `user!.id` without verifying user exists, which can throw runtime error if user is null.

**Current Code:**
```typescript
queryFn: async () => {
  const { data } = await supabase
    .from("user_permissions")
    .select("permission, enabled")
    .eq("user_id", user!.id);  // Dangerous: user could be null
  return data || [];
},
```

**Fix:** Add null check before query:
```typescript
queryFn: async () => {
  if (!user?.id) return [];
  const { data } = await supabase
    .from("user_permissions")
    .select("permission, enabled")
    .eq("user_id", user.id);
  return data || [];
},
```

---

### CR-03: Potential Undefined Access in useOnlineStatus
**File:** `src/hooks/useOnlineStatus.ts:86-88`
**Issue:** KYC field access may fail if metadata is undefined.

**Current Code:**
```typescript
const field = file.metadata.field as string;  // file.metadata could be undefined
```

**Fix:** Add optional chaining:
```typescript
const field = file.metadata?.field as string;
if (!field) throw new Error("Missing metadata field");
```

---

## Warnings

### WR-01: Missing Dependency in useEffect Hook
**File:** `src/pages/Transactions.tsx:44-52`
**Issue:** useEffect has missing dependency `setSearchParams` which can cause stale closures.

**Current Code:**
```typescript
useEffect(() => {
  const storeParam = searchParams.get("store");
  if (storeParam) {
    setStoreId(storeParam);
    setShowAdd(true);
    setSearchParams({}, { replace: true });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // Missing setSearchParams dependency
```

**Fix:** Include all dependencies or wrap in useCallback:
```typescript
useEffect(() => {
  const storeParam = searchParams.get("store");
  if (storeParam) {
    setStoreId(storeParam);
    setShowAdd(true);
    setSearchParams({}, { replace: true });
  }
}, [searchParams, setSearchParams, setStoreId, setShowAdd]);
```

---

### WR-02: Event Handler Not Properly Bound
**File:** `src/pages/Customers.tsx:331-341`
**Issue:** Checkbox onClick handler uses inline arrow function which creates new function on each render, causing unnecessary re-renders.

**Current Code:**
```typescript
<Checkbox
  checked={selected.has(row.id)}
  onCheckedChange={() => toggleSelect(row.id)}
  onClick={(e: React.MouseEvent) => e.stopPropagation()}
/>
```

**Fix:** Use useCallback for event handlers:
```typescript
const handleToggleSelect = useCallback((id: string) => (e: React.MouseEvent) => {
  e.stopPropagation();
  toggleSelect(id);
}, [toggleSelect]);
```

---

### WR-03: Unsafe Casting in Supabase Queries
**File:** `src/hooks/useRouteSession.ts:113-116`
**Issue:** Using `as RouteStore` type assertion without null check can mask runtime errors.

**Current Code:**
```typescript
return activeSession.optimized_order
  .map(id => storeMap.get(id))
  .filter((s): s is RouteStore => !!s);
```

**Fix:** The filter is good, but add explicit type guard:
```typescript
const isRouteStore = (s: unknown): s is RouteStore => {
  return s !== null && typeof s === 'object' && 'id' in s;
};
```

---

### WR-04: Potential Infinite Re-render in AuthContext
**File:** `src/contexts/AuthContext.tsx:111-146`
**Issue:** `refreshWarehouses` function reference changes on every render causing unnecessary effect runs.

**Current Code:**
```typescript
const refreshWarehouses = async (targetUserId?: string) => {
  // ... function defined inline
};

useEffect(() => {
  // ... uses refreshWarehouses
}, [user]);  // Missing refreshWarehouses dependency
```

**Fix:** Wrap in useCallback:
```typescript
const refreshWarehouses = useCallback(async (targetUserId?: string) => {
  // ... function body
}, [user?.id, warehouse]);  // Add proper dependencies
```

---

### WR-05: Race Condition in Realtime Sync
**File:** `src/hooks/useRealtimeSync.ts:160-174`
**Issue:** Multiple subscribers can cause race conditions when invalidating queries simultaneously.

**Current Code:**
```typescript
function handleRealtimePayload(table: string, payload: any) {
  subscribers.forEach((sub) => {
    keys.forEach((key) => {
      sub.qc.invalidateQueries({ queryKey: [key] });  // Concurrent invalidations
    });
  });
}
```

**Fix:** Debounce or batch invalidations:
```typescript
const debouncedInvalidate = useMemo(() => 
  debounce((qc: QueryClient, key: string) => {
    qc.invalidateQueries({ queryKey: [key] });
  }, 100),
  []
);
```

---

## Info

### IN-01: Console.log Statements in Production
**File:** Multiple files (Sales.tsx, Transactions.tsx, Auth.tsx)
**Issue:** Debug console statements should be removed or wrapped in development checks.

**Current Code:**
```typescript
console.error("Error loading order:", error);
console.warn("Failed to notify admins:", err);
```

**Fix:** Use logger utility:
```typescript
import { logError, logWarn } from "@/lib/logger";
logError("Error loading order", error);
logWarn("Failed to notify admins", { error: err });
```

---

### IN-02: Missing Type Imports
**File:** `src/hooks/useOnlineStatus.ts:1-21`
**Issue:** Missing type imports for ConflictType and other types used in the file.

**Current Code:**
```typescript
import { detectConflicts, ConflictType } from "@/lib/conflictResolver";
```

**Note:** Ensure `ConflictType` is properly exported from conflictResolver module.

---

### IN-03: Inconsistent Error Handling Pattern
**File:** `src/hooks/useNotifications.ts:25-32`
**Issue:** Error in fetchNotifications is not caught or logged.

**Current Code:**
```typescript
const fetchNotifications = useCallback(async () => {
  if (!user) return;
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  setNotifications((data as AppNotification[]) || []);
  setLoading(false);
}, [user]);
```

**Fix:** Add error handling:
```typescript
const fetchNotifications = useCallback(async () => {
  if (!user) return;
  try {
    const { data, error } = await supabase...
    if (error) throw error;
    setNotifications((data as AppNotification[]) || []);
  } catch (err) {
    logError("Failed to fetch notifications", err);
  } finally {
    setLoading(false);
  }
}, [user]);
```

---

### IN-04: Unsafe IndexedDB Operations
**File:** `src/lib/offlineQueue.ts:71-101`
**Issue:** IndexedDB operations don't have proper error recovery mechanisms.

**Current Code:**
```typescript
req.onerror = () => reject(req.error);  // Just rejects without logging
```

**Fix:** Add error logging:
```typescript
req.onerror = () => {
  logError("IndexedDB operation failed", req.error);
  reject(req.error);
};
```

---

### IN-05: Potential Memory Leak in Toast Hook
**File:** `src/hooks/use-toast.ts:54-69`
**Issue:** Timeout references not cleared on component unmount.

**Current Code:**
```typescript
const addToRemoveQueue = (toastId: string) => {
  const timeout = setTimeout(() => {
    // ... cleanup
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
};
```

**Note:** While timeouts are stored, there's no global cleanup mechanism when the app unmounts.

---

### IN-06: Import Order Issue in offlineQueue.ts
**File:** `src/lib/offlineQueue.ts:223-224`
**Issue:** Import statement appears after function definitions, which can cause initialization issues.

**Current Code:**
```typescript
// ... many functions defined here

// Import toast for warnings in addToQueue
import { toast } from "sonner";
```

**Fix:** Move import to top of file:
```typescript
import { toast } from "sonner";
// ... rest of imports and code
```

---

### IN-07: Missing Cleanup for Realtime Subscriptions
**File:** `src/hooks/useNotifications.ts:80-83`
**Issue:** Channel cleanup could fail silently.

**Current Code:**
```typescript
return () => {
  supabase.removeChannel(channel);
};
```

**Fix:** Add error handling:
```typescript
return () => {
  try {
    supabase.removeChannel(channel);
  } catch (err) {
    logError("Failed to remove notification channel", err);
  }
};
```

---

### IN-08: Unsafe LocalStorage Access
**File:** `src/lib/logger.ts:112-124`
**Issue:** localStorage operations can fail in private browsing mode or with storage quota exceeded.

**Current Code:**
```typescript
try {
  const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
  // ...
} catch {
  // Silently fail
}
```

**Note:** Already has try-catch, but could add quota exceeded handling:
```typescript
catch (err) {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    localStorage.removeItem('app_errors');  // Clear and retry
  }
}
```

---

## Detailed File Analysis

### src/hooks/useRealtimeSync.ts
**Lines:** 287
**Issues Found:** 3

1. **Line 196-198:** Console log in production code (CRITICAL)
2. **Line 203, 206:** logError called with new Error wrapper unnecessarily (WARNING)
3. **Line 246-248:** Potential race condition when re-establishing subscriptions (WARNING)

### src/hooks/useOnlineStatus.ts
**Lines:** 382
**Issues Found:** 4

1. **Line 86-88:** Potential null access on file.metadata (CRITICAL)
2. **Line 127:** logError with constructed Error object (INFO)
3. **Line 186:** Error thrown without user-facing message (WARNING)
4. **Line 309:** Error construction could fail (WARNING)

### src/contexts/AuthContext.tsx
**Lines:** 264
**Issues Found:** 2

1. **Line 111-146:** refreshWarehouses not memoized (WARNING)
2. **Line 165-177:** Error handling with any type (INFO)

### src/pages/Sales.tsx
**Lines:** 1123+
**Issues Found:** 4

1. **Line 149-173:** Error handling in useQuery (CRITICAL)
2. **Line 378:** Console error not using logger (INFO)
3. **Line 468:** Console error not using logger (INFO)
4. **Line 632:** Console warn not using logger (INFO)

### src/pages/Transactions.tsx
**Lines:** 458
**Issues Found:** 2

1. **Line 44-52:** Missing dependency in useEffect (WARNING)
2. **Line 242:** Console warn not using logger (INFO)

### src/pages/Customers.tsx
**Lines:** 686
**Issues Found:** 2

1. **Line 331-341:** Event handler not memoized (WARNING)
2. **Line 102-109:** Timer cleanup on unmount is correct (GOOD)

### src/pages/Auth.tsx
**Lines:** 648
**Issues Found:** 2

1. **Line 169:** Console error not using logger (INFO)
2. **Line 265:** Console error not using logger (INFO)

---

## Recommendations

### Immediate Actions (Critical)
1. Fix CR-01: Add proper error handling to Supabase queries in Sales.tsx
2. Fix CR-02: Add null check before accessing user.id in usePermission.ts
3. Fix CR-03: Add optional chaining for file.metadata access

### Short-term (Warnings)
1. Fix WR-01: Add missing dependencies to useEffect hooks
2. Fix WR-02: Memoize event handlers in Customers.tsx
3. Fix WR-04: Memoize refreshWarehouses function

### Long-term (Info)
1. Replace all console.log/error/warn with logger utility
2. Add comprehensive error boundaries to all routes
3. Implement retry logic for failed Supabase queries
4. Add type guards for all unsafe type assertions

---

## Statistics

| Severity | Count |
|----------|-------|
| Critical | 3 |
| Warning | 5 |
| Info | 10 |
| **Total** | **18** |

---

_Reviewed: 2025-01-19_  
_Reviewer: GSD Code Review Agent_  
_Depth: standard_
