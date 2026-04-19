# Half-Implemented Features

**Analysis Date:** 2025-01-19

## Overview

This document identifies features that are partially implemented with TODO/FIXME comments, placeholder implementations, or incomplete error handling.

## 1. Feature Configuration System (`src/lib/featureConfig.ts`)

**Status:** Framework Complete, Integration Incomplete

### Issues:
- Lines 347-350: `useFeature()` hook always returns empty permissions array:
```typescript
const userPermissions = useMemo(() => {
  // This would come from your permissions system
  return [] as PermissionKey[];  // PLACEHOLDER - NOT IMPLEMENTED
}, [profile]);
```
- Lines 369-371: `useInventoryFeatures()` also has empty permissions:
```typescript
const userPermissions = useMemo(() => {
  return [] as PermissionKey[];  // PLACEHOLDER - NOT IMPLEMENTED
}, [profile]);
```

**Impact:** Feature flags exist but the permission integration is stubbed, making tenant-level feature control non-functional.

## 2. Conflict Resolution System (`src/lib/conflictResolver.ts`)

**Status:** Core Logic Complete, UI Integration Incomplete

### Issues:
- Conflict detection logic exists but manual resolution UI in `ConflictResolver.tsx` may not expose all resolution strategies
- Lines 223: `storeConflict()` function warns about missing store:
```typescript
console.warn("Conflict store not yet available, logging conflict for action:", actionId);
```
- The conflict store (IndexedDB) is created in DB version 4 but the migration logic may not handle all edge cases

## 3. Inventory Refactored Page (`src/pages/InventoryRefactored.tsx`)

**Status:** New Architecture, Not Fully Wired

### Issues:
- This is a refactored version of Inventory using the feature config system
- Original `src/pages/Inventory.tsx` is still the active version
- The refactored version is not used in the app - remains as work-in-progress

## 4. Real-time Sync Hook (`src/hooks/useRealtimeSync.ts`)

**Status:** Functional with Retry Logic

### Issues:
- Lines 195-197: Development-only logging:
```typescript
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log('[Realtime] Subscribed to tables:', tables);
}
```
- Lines 219: Max retry reached message logged but no user-facing notification

## 5. Offline Queue (`src/lib/offlineQueue.ts`)

**Status:** Core Functional, Some Edge Cases

### Issues:
- Lines 202: Uses `toast.warning()` before toast is imported (import at line 224)
- Lines 526: Warning about conflict store not available - graceful degradation

## 6. Mobile V2 System (`src/mobile-v2/`)

**Status:** Active Development, Some Placeholders

### Files with Incomplete Features:

#### `src/mobile-v2/pages/pos/PosHome.tsx`
- POS mobile interface is minimal - only basic home page exists
- Full POS functionality not ported from web version

#### `src/mobile-v2/pages/agent/AgentScan.tsx`
- Lines 85: Error handling just logs to console:
```typescript
console.error(err);
```

#### `src/mobile-v2/pages/agent/AgentRecord.tsx`
- Lines 303: Error handling incomplete:
```typescript
console.error(err);
```

## 7. Route Session Hook (`src/hooks/useRouteSession.ts`)

**Status:** Functional

### Minor Issues:
- Some console.error calls for debugging (acceptable for error tracking)

## 8. Proximity Validation (`src/lib/proximity.ts`)

**Status:** Complete Implementation

### Note:
- Hardcoded radius of 100 meters (line 6): `const PROXIMITY_RADIUS_METERS = 100;`
- Should be configurable per-organization

## 9. Staff Directory Page (`src/pages/StaffProfile.tsx`)

**Status:** Mixed Implementation

### Issues:
- Lines 623: Commented out role restrictions:
```typescript
disabled={isSA || !isAdmin}  // Some role checks may be incomplete
```

## 10. Warehouse Context (`src/contexts/WarehouseContext.tsx`)

**Status:** Functional but Incomplete Edge Cases

### Issues:
- Lines 141-145: Silent error handling:
```typescript
} catch (error) {
  logError("Error fetching user warehouses", error);
  setWarehouses([]);
  setWarehouseState(null);
}
```

## 11. Permission System (`src/hooks/usePermission.ts`)

**Status:** Core Functional

### Design Note:
- Always returns `false` during loading state - may cause UI flicker
- Super admin bypass is hardcoded, not configurable

## 12. SMS Gateway Settings (`src/components/settings/SmsGatewayTab.tsx`)

**Status:** Placeholder Implementation

### Issues:
- UI exists but backend integration may be incomplete
- OpenSMS integration referenced but may not be fully deployed

## 13. Production Features (`src/pages/Production.tsx`, `src/pages/admin/ProductionLog.tsx`)

**Status:** Recent Additions, May Have Gaps

### Issues:
- BOM (Bill of Materials) feature is new and may have incomplete validation
- Cost calculation features may have edge cases not handled

## 14. Delivery Feasibility (`src/pages/admin/DeliveryFeasibility.tsx`)

**Status:** Functional but Hardcoded

### Issues:
- Lines 166: OSRM API error handling:
```typescript
console.error("OSRM Route fetching failed:", err);
```
- No fallback if OSRM service is unavailable

## Summary Table

| Feature | File | Status | Priority |
|---------|------|--------|----------|
| Permission Integration | `featureConfig.ts` | Placeholder | High |
| Conflict Resolution UI | `conflictResolver.ts` | Partial | Medium |
| Inventory Refactor | `InventoryRefactored.tsx` | Unused | Low |
| Mobile V2 POS | `mobile-v2/pages/pos/` | Incomplete | Medium |
| Agent Scan Error Handling | `AgentScan.tsx` | Incomplete | Medium |
| Toast Import Order | `offlineQueue.ts` | Bug | Low |
| POS Mobile Home | `PosHome.tsx` | Minimal | Medium |
| SMS Gateway | `SmsGatewayTab.tsx` | Unverified | Low |

---

*Analysis completed: 2025-01-19*
