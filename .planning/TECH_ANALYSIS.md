# BizManager Technical Stack Analysis

**Analysis Date:** 2025-01-09

## Executive Summary

BizManager (Aqua Prime) is a React-based sales/route/collections management application built with a modern TypeScript stack. It features dual-target deployment: web (browser) and mobile (Android APK via Capacitor). The backend is entirely Supabase-based (PostgreSQL, Auth, Edge Functions, Realtime).

---

## Core Technology Stack

### Frontend Framework & Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 5.4.19 | Build tool & dev server |
| SWC | via @vitejs/plugin-react-swc | Fast compilation |

**Build Configuration:**
- Entry: `src/main.tsx`
- Dev server port: 5003 (configured in `vite.config.ts`)
- Build modes: production (`vite build`), development (`vite build --mode development`)
- Path alias: `@/*` maps to `src/*`

### Mobile Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| Capacitor Core | 8.2.0 | Native bridge |
| Capacitor Android | 8.2.0 | Android platform |
| Capacitor Camera | 8.0.2 | Native camera access |
| Capacitor Geolocation | 8.1.0 | GPS/location services |

**Key Files:**
- `src/lib/capacitorUtils.ts` - Native feature wrappers
- `src/mobile-v2/` - Mobile-specific UI components
- Platform detection: `isNativeApp()` from `@capacitor/core`

### State Management & Data Fetching

| Technology | Version | Purpose |
|------------|---------|---------|
| TanStack Query | 5.83.0 | Server state management |
| React Context | Built-in | Auth, Warehouse context |

**Patterns:**
- React Query query keys are domain-named (e.g., `["sales", warehouseId, userId, ...filters]`)
- Realtime invalidation via `useRealtimeSync.ts` - subscribes to Supabase changes and invalidates query caches
- Default staleTime: 30 seconds
- Retry: 1 attempt on failure

### UI Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | 3.4.17 | Utility-first styling |
| shadcn/ui | via components | Component library |
| Radix UI | various | Headless UI primitives |
| Framer Motion | 12.35.1 | Animations |
| Lucide React | 0.462.0 | Icons |

**UI Architecture:**
- Web: `AppLayout.tsx` with sidebar (`AppSidebar.tsx`) + top bar
- Mobile: `MobileAppV2.tsx` with bottom navigation role-based tabs
- Theme: Dark/light via `next-themes`

### Backend Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| Supabase JS Client | 2.98.0 | Database & Auth |
| Firebase | 12.10.0 | Phone OTP authentication |

**Key Integration Files:**
- `src/integrations/supabase/client.ts` - Supabase client singleton
- `src/integrations/supabase/types.ts` - Database TypeScript types (1,698 lines)
- `src/lib/firebaseAuth.ts` - Firebase phone auth
- `supabase/functions/` - 13 Edge Functions (Deno runtime)

### Form Handling & Validation

| Technology | Version | Purpose |
|------------|---------|---------|
| React Hook Form | 7.61.1 | Form state management |
| Zod | 3.25.76 | Schema validation |
| @hookform/resolvers | 3.10.0 | Zod integration |

**Validation Utilities:** `src/lib/validation.ts`
- Phone: Indian mobile format (10 digits, 6-9)
- GST: 15-character format
- IFSC: 11-character bank code
- PAN: 10-character format
- Aadhar: 12 digits
- UPI ID: username@provider

### Additional Libraries

| Library | Purpose |
|---------|---------|
| Leaflet + React-Leaflet | Maps (store locations, routes) |
| Recharts | Charts/graphs |
| JSPDF + jspdf-autotable | PDF generation (receipts, reports) |
| html5-qrcode | QR code scanning |
| qrcode.react | QR code generation |
| xlsx | Excel export |
| date-fns | Date formatting |
| embla-carousel-react | Carousels |
| sonner | Toast notifications |

---

## Project Structure

```
src/
├── components/
│   ├── layout/           # AppLayout, AppSidebar, TopBar
│   ├── ui/              # shadcn/ui components (100+ files)
│   ├── shared/          # Reusable: DataTable, ErrorBoundary, etc.
│   ├── auth/            # ProtectedRoute, RoleGuard, RoleRoute
│   ├── sales/           # Sale-specific components
│   ├── inventory/       # Inventory management
│   └── ...
├── contexts/
│   ├── AuthContext.tsx   # Auth state, role resolution
│   └── WarehouseContext.tsx # Multi-warehouse support
├── hooks/
│   ├── useRealtimeSync.ts  # Supabase realtime → query invalidation
│   ├── usePermission.ts    # Granular permissions
│   ├── useRouteAccess.ts   # Route/store-type matrix access
│   ├── useOnlineStatus.ts  # Offline queue sync
│   └── inventory/          # Domain-specific hooks
├── lib/
│   ├── offlineQueue.ts     # IndexedDB offline queue
│   ├── conflictResolver.ts # Conflict detection for offline ops
│   ├── proximity.ts        # GPS distance calculations
│   ├── validation.ts       # Input validation
│   ├── errorUtils.ts       # Error handling utilities
│   └── ...
├── pages/                 # Web pages (80+ files)
├── mobile-v2/            # Mobile-specific pages & components
│   ├── components/
│   └── pages/
│       ├── agent/
│       ├── marketer/
│       ├── pos/
│       ├── customer/
│       └── admin/
├── integrations/
│   └── supabase/
│       ├── client.ts
│       └── types.ts       # Generated DB types
└── test/                  # Vitest tests (12 test files)
```

---

## Build & Development

### NPM Scripts

```bash
npm run dev              # Start dev server (port 5003)
npm run build            # Production build
npm run build:dev        # Development build
npm run lint             # ESLint check
npm run test             # Vitest run
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report
npm run build:android    # Build + sync + open Android Studio
npm run build:apk:debug  # Build debug APK
npm run build:apk:release # Build release APK
```

### TypeScript Configuration

**tsconfig.json settings:**
- `strictNullChecks: false` - ⚠️ Relaxed null safety
- `noImplicitAny: false` - ⚠️ Implicit any allowed
- `noUnusedLocals: false` - Unused variables allowed
- `noUnusedParameters: false` - Unused parameters allowed

**⚠️ CONCERN:** Relaxed TypeScript settings reduce type safety.

---

## Environment Configuration

### Required Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_SENTRY_DSN=         # Optional
VITE_SENTRY_ENVIRONMENT= # Optional
```

**Validation:** `src/lib/env.ts` validates env vars at startup with clear error messages.

---

## PWA Configuration

**Vite PWA Plugin settings:**
- Register type: autoUpdate
- Caches: js, css, html, images, fonts
- Runtime caching:
  - Supabase Storage: CacheFirst (7 days)
  - Google Fonts: CacheFirst (365 days)
- Navigate fallback denylist: `/~oauth`, `/auth/callback`, `/auth/confirm`

---

## Testing Setup

| Technology | Version | Purpose |
|------------|---------|---------|
| Vitest | 3.2.4 | Test runner |
| @testing-library/react | 16.0.0 | Component testing |
| @testing-library/jest-dom | 6.6.0 | DOM assertions |
| jsdom | 25.0.1 | Browser environment |
| fake-indexeddb | 6.2.5 | IndexedDB mocking |

**Test files:** 12 files covering:
- Route access logic (`routeAccess.test.ts`)
- Auth roles (`authRoles.test.ts`)
- Validation (`validation.test.ts`)
- Offline queue (`offlineQueue.test.ts`)
- Proximity calculations (`proximity.test.ts`)
- Display IDs (`displayIds.test.ts`)
- Error utilities (`errorUtils.test.ts`)
- Credit limits (`creditLimit.test.ts`)
- UPI parsing (`upiParser.test.ts`)
- Environment (`env.test.ts`)

---

## Key Dependencies at Risk

| Package | Risk | Mitigation |
|---------|------|------------|
| vite-plugin-pwa | Pinned to 0.19.8 | Locked version for stability |
| @anthropic-ai/claude-code | Dev dependency | Remove from production deps |

---

## Offline Capabilities

**IndexedDB Schema (v4):**
- `pending_actions` - Queued mutations (sales, transactions, visits, customers, stores)
- `pending_files` - File uploads (KYC, photos)
- `conflict_info` - Conflict tracking for offline operations

**Features:**
- Max retries: 3 with exponential backoff (1s, 5s, 15s)
- Business key deduplication
- Conflict detection on sync
- Context capture for stale data detection

**Files:**
- `src/lib/offlineQueue.ts` - Queue management (641 lines)
- `src/lib/conflictResolver.ts` - Conflict detection/resolution (564 lines)
- `src/hooks/useOnlineStatus.ts` - Sync orchestration
