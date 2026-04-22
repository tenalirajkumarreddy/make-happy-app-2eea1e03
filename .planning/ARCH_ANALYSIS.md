# BizManager Architecture Analysis

**Analysis Date:** 2025-01-09

## Executive Summary

BizManager follows a layered architecture with clear separation of concerns. The application supports dual deployment targets (web + mobile APK) through a platform detection abstraction. Data flows from Supabase → React Query → UI components, with real-time synchronization via Supabase Realtime.

---

## Architectural Patterns

### 1. Provider Pattern (React Context)

**Core Providers (in order of nesting):**
```
Sentry.ErrorBoundary
└── QueryClientProvider
    └── AuthProvider
        └── WarehouseProvider
            └── TooltipProvider
                └── ErrorBoundary (component)
                    └── BrowserRouter
                        └── Routes
```

**Key Providers:**

| Provider | File | Responsibility |
|----------|------|----------------|
| AuthContext | `src/contexts/AuthContext.tsx` | User auth, role resolution, profile data |
| WarehouseContext | `src/contexts/WarehouseContext.tsx` | Multi-warehouse scoping |
| QueryClientProvider | `src/App.tsx` | React Query state management |

### 2. Container/Presentational Component Pattern

**Container Components (Pages):**
- Fetch data via React Query hooks
- Handle mutations and side effects
- Pass data to presentational components

**Presentational Components:**
- `DataTable` - Generic table with sorting/filtering
- `PageHeader` - Consistent page headers
- `StatusBadge` - Status indicators
- UI components in `src/components/ui/`

### 3. Custom Hooks Pattern

**Domain Hooks:**
```
src/hooks/
├── useRealtimeSync.ts      # Realtime subscription management
├── usePermission.ts        # Granular permission checks
├── useRouteAccess.ts       # Route/store-type access control
├── useOnlineStatus.ts      # Offline queue sync
├── useNotifications.ts     # Push notifications
├── useCompanySettings.ts   # App configuration
└── inventory/              # Domain-specific hooks
```

### 4. Platform Abstraction Pattern

**Platform Detection:**
```typescript
// src/lib/capacitorUtils.ts
export const isNativeApp = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === "android";
export const isIOS = () => Capacitor.getPlatform() === "ios";
```

**Runtime Split in App.tsx:**
```typescript
const isMobile = isNativeApp();
return (
  <Suspense fallback={<PageLoader />}>
    {isMobile ? <MobileRoutes /> : <WebRoutes />}
  </Suspense>
);
```

---

## Data Flow Architecture

### Standard Data Flow

```
Supabase DB → Supabase Realtime → Query Cache → UI Components
     ↑                                              │
     └────────── Direct Queries ←───────────────────┘
                        │
                   Mutations → Supabase RPC/REST
```

### Offline-First Data Flow

```
User Action → Online Check
                ├── Yes → Direct API Call
                └── No → Queue in IndexedDB
                           │
                    ┌──────┴──────┐
                    ▼             ▼
            Conflict Detection   Retry Logic (3x)
                    │             │
                    └──────┬──────┘
                           ▼
                    Sync on Reconnect
```

### Realtime Synchronization

**Table Subscriptions by Role:**
```typescript
// src/hooks/useRealtimeSync.ts
const ROLE_TABLE_MAP: Record<string, string[]> = {
  super_admin: ["sales", "transactions", "orders", "stores", ...], // 25+ tables
  manager: ["sales", "transactions", "orders", "stores", ...],
  agent: ["sales", "transactions", "orders", "stores", "routes", "expense_claims"],
  marketer: ["orders", "stores", "customers", "transactions"],
  pos: ["sales", "sale_items", "stores", "products"],
  customer: ["orders", "order_items", "stores", "customers"],
};
```

---

## Authentication & Authorization Architecture

### Auth Flow

**Staff Auth (Email/Password):**
1. Supabase email/password login
2. Role lookup from `user_roles` table
3. Profile from `profiles` table
4. Warehouse scoping from `user_roles.warehouse_id`

**Customer Auth (Phone OTP):**
1. Firebase Phone Auth → OTP verification
2. Supabase Edge Function `firebase-phone-exchange` exchanges Firebase token for Supabase token
3. Identity resolution: staff_invitations → staff_directory → customers → onboarding

**File:** `src/pages/Auth.tsx` (648 lines)

### Role-Based Access Control (RBAC)

**Role Hierarchy:**
```
super_admin (5)
    │
manager (4)
    │
┌───┴───┬─────────┐
agent  marketer   pos (3)
    │
customer (1)
```

**Access Control Components:**

| Component | File | Purpose |
|-----------|------|---------|
| ProtectedRoute | `src/components/auth/ProtectedRoute.tsx` | Requires authentication |
| RoleRoute | `src/components/auth/RoleRoute.tsx` | Route-level role routing |
| RoleGuard | `src/components/auth/RoleGuard.tsx` | Component-level role check |

**Permission System:**
```typescript
// src/hooks/usePermission.ts
export function usePermission(key: PermissionKey): { allowed: boolean; loading: boolean }

// Permission sources (in order):
// 1. Super admin: always true
// 2. DB override: user_permissions table
// 3. Role defaults: ROLE_DEFAULTS constant
```

---

## Key Abstractions

### 1. Display ID Generation

**File:** `src/lib/displayId.ts`
```typescript
export function generateDisplayId(prefix: string): string
// Format: PREFIX-YYYYMMDD-XXXX (sequential)
```

### 2. Credit Limit Resolution

**File:** `src/lib/creditLimit.ts`
```typescript
export function resolveCreditLimit(store, storeTypes, customers): { limit, source }
// Priority: customer override > store type KYC > store type non-KYC
```

### 3. Proximity Validation

**File:** `src/lib/proximity.ts`
```typescript
export async function checkProximity(storeLat, storeLng): Promise<ProximityResult>
// Default radius: 100 meters
```

### 4. Conflict Resolution

**File:** `src/lib/conflictResolver.ts`
```typescript
export enum ConflictType {
  CREDIT_EXCEEDED, PRICE_CHANGED, STORE_INACTIVE,
  PRODUCT_UNAVAILABLE, INSUFFICIENT_STOCK, DATA_STALE
}
```

---

## Entry Points

### Web Application

| Entry Point | File | Purpose |
|-------------|------|---------|
| main.tsx | `src/main.tsx` | React root, Capacitor init |
| App.tsx | `src/App.tsx` | Router, providers, routes |
| Auth.tsx | `src/pages/Auth.tsx` | Login, OTP, registration |

### Mobile Application

| Entry Point | File | Purpose |
|-------------|------|---------|
| MobileAppV2.tsx | `src/mobile-v2/MobileAppV2.tsx` | Mobile root with role routing |
| BottomNav | `src/mobile-v2/components/BottomNav.tsx` | Tab navigation |

### Edge Functions

| Function | File | Purpose |
|----------|------|---------|
| invite-staff | `supabase/functions/invite-staff/index.ts` | Staff invitation |
| firebase-phone-exchange | `supabase/functions/firebase-phone-exchange/index.ts` | Phone auth token exchange |
| auto-orders | `supabase/functions/auto-orders/index.ts` | Automated order generation |
| daily-handover-snapshot | `supabase/functions/daily-handover-snapshot/index.ts` | EOD balance snapshots |
| generate-receipt-pdf | `supabase/functions/generate-receipt-pdf/index.ts` | PDF receipt generation |
