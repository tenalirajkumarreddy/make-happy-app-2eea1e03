# Code Smells

**Analysis Date:** 2025-01-19

## Overview

Implementation issues including code duplication, inconsistent patterns, magic numbers/strings, hardcoded values, and mixing of patterns.

## 1. Magic Numbers and Strings

### Hardcoded Values

**File:** `src/lib/proximity.ts` line 6
```typescript
const PROXIMITY_RADIUS_METERS = 100; // Should be configurable
```

**File:** `src/lib/offlineQueue.ts` lines 12-13
```typescript
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Should be configurable
```

**File:** `src/hooks/useRealtimeSync.ts` lines 125-128
```typescript
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
};
```

**File:** `src/pages/Sales.tsx` line 64
```typescript
const PAGE_SIZE = 100; // Should be constant or setting
```

**File:** `src/pages/Auth.tsx` (various lines)
- OTP timeout hardcoded
- Phone validation patterns duplicated

### Hardcoded Role Checks

**File:** `src/pages/Inventory.tsx` lines 67-75
```typescript
const isSuperAdmin = role === "super_admin";
const isManager = role === "manager";
const isPos = role === "pos";
// Duplicated in many files - should use feature flags
```

## 2. Code Duplication

### Permission Checking Pattern

**Duplicated across:**
- `src/hooks/usePermission.ts`
- `src/lib/featureConfig.ts` (useFeature hook)
- Various pages with inline checks

### Role-Based Access Control

**Pattern duplicated in:**
- `src/pages/Inventory.tsx` lines 67-84
- `src/pages/InventoryRefactored.tsx` (uses feature system - better!)
- `src/mobile/MobileApp.tsx` lines 67-82

### Console Error Logging

**File:** `src/mobile-v2/pages/agent/AgentScan.tsx` line 85
```typescript
console.error(err); // Just logs error, no user feedback
```

**File:** `src/mobile-v2/pages/agent/AgentRecord.tsx` line 303
```typescript
console.error(err); // Same pattern
```

### Sales Recording Logic

**Duplicated between:**
- `src/pages/Sales.tsx` (web version)
- `src/mobile/pages/agent/AgentRecord.tsx` (mobile version)
- `src/mobile-v2/pages/agent/AgentRecord.tsx` (v2 mobile)

All three implement similar sale recording with slight variations.

## 3. Inconsistent Patterns

### Import Organization

**Inconsistent import grouping:**

Some files group by:
```typescript
// React imports
import { useState } from "react";

// Third-party
import { useQuery } from "@tanstack/react-query";

// Local components
import { Button } from "@/components/ui/button";

// Local hooks
import { useAuth } from "@/contexts/AuthContext";
```

Others mix freely without grouping.

### Error Handling

**Three different patterns:**

1. **Toast notifications:**
```typescript
try {
  await operation();
} catch (error) {
  toast.error(error.message);
}
```

2. **Console logging:**
```typescript
try {
  await operation();
} catch (error) {
  console.error("Operation failed:", error);
}
```

3. **Logger utility:**
```typescript
import { logError } from "@/lib/logger";
try {
  await operation();
} catch (error) {
  logError("Operation failed", error);
}
```

### Query Keys

**Inconsistent naming:**
- `sales`, `sale-items`, `dashboard-stats`
- Some use camelCase, some use kebab-case
- No centralized query key registry

### Type Assertions

**Overuse of `as any`:**

**File:** `src/pages/Sales.tsx` line 152
```typescript
let query = (supabase as any)
```

**File:** `src/hooks/useRouteAccess.ts` line 81
```typescript
const { data, error } = await (supabase as any)
```

## 4. Unused Code

### Unused Variables

**File:** `src/pages/Inventory.tsx` line 98
```typescript
const [preselectedStaff, setPreselectedStaff] = useState<any>(null); // Never used
```

### Unused Imports

Many files have unused imports from refactoring.

### Old Inventory Page

**File:** `src/pages/Inventory_old.tsx`
- 589 lines
- Not imported anywhere
- Superseded by `Inventory.tsx` and `InventoryRefactored.tsx`

## 5. Commented Code

### Large Blocks

**File:** `src/pages/Settings.tsx` (various locations)
```typescript
// Disabled features
// const feature = ...
```

## 6. Type Safety Issues

### Any Types

**File:** `src/pages/Sales.tsx`
```typescript
const selectedSale = sales?.find((s) => s.id === selectedSaleId); // s is any
const [items, setItems] = useState<SaleItem[]>(...); // Good
```

**File:** `src/lib/offlineQueue.ts` line 15
```typescript
payload: unknown; // Should be more specific
```

### Missing Return Types

Many hooks don't explicitly define return types.

## 7. Mix of Async Patterns

### Promise vs Async/Await

**File:** `src/lib/offlineQueue.ts` - Uses Promises directly:
```typescript
return new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  // ...
});
```

**File:** `src/hooks/inventory/useWarehouseStock.ts` - Uses async/await:
```typescript
const { data, error } = await supabase.from(...)
```

Both patterns valid but should be consistent within a module.

## 8. Component Complexity

### Large Components

**File:** `src/pages/Sales.tsx` - 1200+ lines
- Handles listing, filtering, creation, receipt viewing
- Should be split into smaller components

**File:** `src/pages/Inventory.tsx` - 1000+ lines
- Multiple tabs with complex state
- Could be modularized

### Props Drilling

**File:** `src/pages/Inventory.tsx` lines 628-700
- Many props passed down through component tree
- Could use context for warehouse selection

## 9. Missing Error Boundaries

### Async Operations Without Catch

**File:** `src/pages/Sales.tsx` lines 616-633
```typescript
getAdminUserIds()
  .then((ids) => {
    // ...
  })
  .catch((err) => {
    console.warn("Failed to notify admins:", err); // Silent failure
  });
```

## 10. State Management Issues

### Multiple Sources of Truth

**File:** `src/contexts/AuthContext.tsx` and `src/contexts/WarehouseContext.tsx`
- Warehouse data in both contexts
- Potential for sync issues

### Derived State

**File:** `src/pages/Sales.tsx`
```typescript
const filteredSales = sales || []; // Derived but not memoized properly
```

## 11. Accessibility Issues

### Missing Labels

Many form inputs lack proper labels or aria-labels.

### Focus Management

Modals may not trap focus properly.

## 12. Performance Issues

### Inline Function Definitions

**File:** `src/pages/Sales.tsx` line 651
```typescript
{ header: "Store", accessor: (row: any) => ( // Inline arrow function
```

### Unnecessary Re-renders

Components may re-render due to inline callbacks.

## 13. Inconsistent Naming

### Variable Naming

- Some use camelCase: `saleItems`
- Some use snake_case in objects: `sale_items`
- Some mix: `isLoadingWarehouse` vs `loadingRoutes`

### File Naming

- Some use PascalCase: `Sales.tsx`
- Some use camelCase: `useRealtimeSync.ts`
- Some use snake_case: `offlineQueue.ts`

## Summary Table

| Smell | Severity | Files | Fix Priority |
|-------|----------|-------|--------------|
| Hardcoded magic numbers | Medium | proximity.ts, offlineQueue.ts | Medium |
| Code duplication (permissions) | High | Multiple | High |
| Code duplication (sales) | High | Sales.tsx, AgentRecord.tsx | High |
| Console.error only | Medium | AgentScan.tsx, AgentRecord.tsx | Medium |
| Mixed error patterns | Medium | Multiple | Medium |
| Overuse of `any` | High | Multiple | High |
| Large components | Medium | Sales.tsx, Inventory.tsx | Low |
| Inline function callbacks | Low | Multiple | Low |
| Unused imports/vars | Low | Multiple | Low |
| Missing error boundaries | High | Multiple | High |

---

*Analysis completed: 2025-01-19*
