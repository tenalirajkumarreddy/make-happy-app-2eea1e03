# BizManager Code Quality Analysis

**Analysis Date:** 2025-01-09

## Executive Summary

This analysis identifies code quality issues, anti-patterns, and areas for improvement in the BizManager codebase. The codebase shows a mix of well-structured patterns and technical debt accumulated from rapid development.

---

## TypeScript Configuration Issues

### Relaxed Type Safety

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "noImplicitAny": false,
    "strictNullChecks": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

**Impact:**
- Implicit `any` types allowed throughout the codebase
- Null/undefined values not strictly checked
- Unused variables and parameters not flagged

**Recommendation:** Gradually enable these flags:
1. Start with `noUnusedLocals: true` and `noUnusedParameters: true`
2. Then enable `strictNullChecks: true`
3. Finally enable `noImplicitAny: true`

---

## Widespread Use of `any` Type

### High-Frequency `any` Usage

**Grep Results:** 42+ occurrences of `any` type across the codebase

**Critical Files:**

| File | Line | Issue |
|------|------|-------|
| `src/lib/errorUtils.ts` | 3 | `export function getFriendlyErrorMessage(error: any)` |
| `src/lib/toastManager.ts` | 47 | `export const showApiError = (error: any) => {...}` |
| `src/hooks/useRealtimeSync.ts` | 124 | `function shouldSkipForSubscriber(... payload: any)` |
| `src/hooks/useOnlineStatus.ts` | 111 | `await (supabase as any).rpc(...)` |
| `src/hooks/useRouteAccess.ts` | 81 | `await (supabase as any).from(...)` |
| `src/hooks/inventory/useWarehouseStock.ts` | 45 | `.map((item: any) => ({...}))` |

**Pattern Analysis:**
```typescript
// Anti-pattern: Supabase client cast to any
const { data, error } = await (supabase as any).rpc("record_sale", {...});

// Anti-pattern: Function parameters typed as any
export function getFriendlyErrorMessage(error: any): string {...}

// Anti-pattern: Map/filter with any
const items = data.map((item: any) => ({...}));
```

**Recommendation:** Use proper Supabase types and define interfaces for data transformations.

---

## Code Duplication

### Sales Recording Logic Duplication

**Web vs Mobile:** The sales recording logic exists in both web and mobile implementations with similar but not identical validation.

**Web:** `src/pages/Sales.tsx` (lines 385-586)
**Mobile:** `src/mobile-v2/pages/agent/AgentRecord.tsx`

**Duplicated Logic:**
- Credit limit validation
- Stock availability check
- Proximity validation
- Offline queue handling
- Display ID generation

**Recommendation:** Extract shared validation and submission logic into composable hooks.

### Role-Based Route Definitions

**File:** `src/App.tsx` and `src/mobile-v2/MobileAppV2.tsx`

Route definitions are duplicated between web and mobile with different paths but similar structure.

---

## Missing Error Boundaries

### Incomplete Error Boundary Coverage

**File:** `src/components/shared/ErrorBoundary.tsx`
```typescript
// Only re-exports from another file
export { default as ErrorBoundary } from "../error/ErrorBoundary";
export { default } from "../error/ErrorBoundary";
```

**Issue:** Error boundaries exist but are inconsistently applied. Mobile app wraps main content, but web layout has error boundaries only around main content, not sidebar or header.

**Recommendation:** Implement error boundaries at route level for each major section.

---

## Hardcoded Values

### Magic Numbers and Strings

**File:** `src/pages/Sales.tsx`
```typescript
const POS_STORE_ID = "00000000-0000-0000-0000-000000000001";  // Line 64
const PAGE_SIZE = 100;  // Line 65
```

**File:** `src/lib/proximity.ts`
```typescript
const PROXIMITY_RADIUS_METERS = 100;  // Line 6
```

**File:** `src/hooks/useOnlineStatus.ts`
```typescript
const MAX_RETRIES = 3;  // Implicit in logic
const RETRY_DELAYS = [1000, 5000, 15000];  // Line 13
```

**Recommendation:** Move these to a constants file or configuration.

---

## Inconsistent Naming Conventions

### File Naming Inconsistencies

| Pattern | Examples | Issue |
|---------|----------|-------|
| camelCase | `useOnlineStatus.ts`, `useRouteAccess.ts` | Standard for hooks |
| PascalCase | `Sales.tsx`, `Auth.tsx` | Standard for components |
| kebab-case | None found | Not used |
| Mixed | `src/mobile-v2/` vs `src/components/` | Directory naming inconsistent |

### Variable Naming

**Inconsistent Patterns:**
```typescript
// Mix of snake_case and camelCase
const sale_items = [...];      // Line in Sales.tsx
const saleItems = [...];       // Elsewhere

const oldOutstanding = ...;   // camelCase
const new_outstanding = ...;    // snake_case in some places
```

---

## Test Coverage Gaps

### Existing Tests (12 files)

| Test File | Coverage |
|-----------|----------|
| `authRoles.test.ts` | Role logic only |
| `routeAccess.test.ts` | Route access helpers |
| `validation.test.ts` | Input validation utilities |
| `offlineQueue.test.ts` | Offline queue operations |
| `proximity.test.ts` | Distance calculations |
| `errorUtils.test.ts` | Error message formatting |
| `displayIds.test.ts` | ID generation |
| `creditLimit.test.ts` | Credit limit resolution |
| `upiParser.test.ts` | UPI ID parsing |

### Missing Test Coverage

**High Priority:**
- `AuthContext.tsx` - Authentication flows
- `useOnlineStatus.ts` - Sync logic
- `usePermission.ts` - Permission resolution
- `Sales.tsx` - Sales recording (main business logic)
- `offlineQueue.ts` - IndexedDB operations
- `conflictResolver.ts` - Conflict detection

**Medium Priority:**
- `useRealtimeSync.ts` - Realtime subscriptions
- `useRouteAccess.ts` - Access control
- `useRouteSession.ts` - Route sessions

---

## Large File Sizes

### Files Exceeding 500 Lines

| File | Lines | Issue |
|------|-------|-------|
| `src/pages/Sales.tsx` | 1,098 | Complex sales logic, needs splitting |
| `src/lib/offlineQueue.ts` | 641 | Offline queue implementation |
| `src/lib/conflictResolver.ts` | 564 | Conflict detection |
| `src/pages/Auth.tsx` | 648 | Authentication flows |
| `src/hooks/useOnlineStatus.ts` | 328 | Sync orchestration |

**Recommendation:**
- Extract components from Sales.tsx
- Split offline queue into smaller modules
- Move conflict resolution UI to separate components

---

## Loading State Inconsistencies

### Mixed Loading Patterns

**Pattern 1:** Inline loaders
```typescript
if (loading) return <Loader2 className="animate-spin" />;
```

**Pattern 2:** Skeleton loaders
```typescript
if (isLoading) return <TableSkeleton columns={7} />;
```

**Pattern 3:** No loading state
```typescript
// Some queries don't handle loading state explicitly
const { data } = useQuery({...});
```

**Recommendation:** Standardize on skeleton loaders for lists/tables and inline spinners for buttons/actions.

---

## Prop Drilling

### Warehouse Context Access

**File:** Multiple pages access warehouse context directly
```typescript
const { currentWarehouse } = useWarehouse();
// Used in 20+ files
```

**Issue:** Each component fetches its own data rather than receiving it via props. This makes testing harder and creates multiple query cache entries.

---

## Inconsistent Import Organization

### Import Order Issues

**Current Pattern (inconsistent):**
```typescript
// Some files: React imports first
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Other files: External libs first
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
```

**Recommendation:** Enforce import order:
1. React imports
2. Third-party libraries
3. Absolute imports (@/)
4. Relative imports (./)
5. CSS imports

---

## Form Validation Inconsistencies

### Validation Approaches

**Approach 1:** Zod schemas (preferred)
```typescript
const schema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
});
```

**Approach 2:** Manual validation
```typescript
if (!storeId || items.some((i) => !i.product_id)) {
  toast.error("Please fill all required fields");
  return;
}
```

**Approach 3:** No validation
```typescript
// Some forms lack validation before submission
```

**Recommendation:** Standardize on Zod + React Hook Form for all forms.

---

## Console Usage

### Console Statements in Production Code

**File:** `src/hooks/useRealtimeSync.ts`
```typescript
console.log('[Realtime] Subscribed to tables:', tables);
console.error('[Realtime] Channel error');
```

**File:** `src/lib/conflictResolver.ts`
```typescript
console.error("Error capturing operation context:", error);
console.error("Error detecting conflicts:", error);
```

**Recommendation:** Replace with structured logging via `logError` or remove in production builds.

---

## Missing Documentation

### Undocumented Functions

**File:** `src/lib/offlineQueue.ts`
- 25+ exported functions, minimal JSDoc
- Complex conflict resolution logic lacks documentation

**File:** `src/hooks/useRealtimeSync.ts`
- Role-based subscription logic needs better documentation

---

## CSS/Style Inconsistencies

### Tailwind Usage

**Inconsistent class ordering:**
```typescript
// Some files: alphabetical-ish
className="flex items-center justify-between"

// Others: logical grouping
className="flex justify-between items-center"
```

**Inconsistent spacing utilities:**
```typescript
// Mix of exact and scale values
className="p-3 sm:p-4 lg:p-6"  // Scale
className="p-[10px]"           // Arbitrary
className="px-2.5 py-1.5"       // Fine-grained
```

**Recommendation:** Use `prettier-plugin-tailwindcss` for consistent class ordering.

---

## Type Definition Issues

### Supabase Types Generation

**File:** `src/integrations/supabase/types.ts` (1,698 lines)

**Issue:** Manually maintained types may drift from database schema.

**Recommendation:** Use Supabase CLI to generate types:
```bash
npx supabase gen types typescript --project-id <id> --schema public > src/integrations/supabase/types.ts
```

### Missing Type Exports

**File:** `src/lib/types.ts`
```typescript
// Only 43 lines, minimal type definitions
export interface StaffHolding {...}
export interface Product {...}
export interface StockTransfer {...}
```

Most types are inline or in `supabase/types.ts`.

---

## Error Handling Patterns

### Inconsistent Error Handling

**Pattern 1:** Toast notification
```typescript
try {
  await operation();
} catch (error) {
  toast.error(error.message);
}
```

**Pattern 2:** Silent failure
```typescript
try {
  await operation();
} catch (error) {
  console.error(error);  // User not notified
}
```

**Pattern 3:** Throw and let boundary handle
```typescript
const { data, error } = await supabase.rpc(...);
if (error) throw error;  // Rely on global handler
```

**Recommendation:** Standardize error handling with `showErrorToast()` utility.
