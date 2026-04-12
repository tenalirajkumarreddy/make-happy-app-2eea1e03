# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Important: Use code-review-graph MCP tools first

Before exploring the codebase with Grep/Glob/Read, you MUST use the code-review-graph MCP tools (semantic_search_nodes, query_graph, detect_changes, etc.) as they are faster, cheaper, and provide structural context (callers, dependents, test coverage) that file scanning cannot. Fall back to Grep/Glob/Read only when the graph doesn't cover what you need.

## 🛠️ Common Commands

All commands are run from the repository root.

- **Install dependencies**: `npm install`
- **Start development server**: `npm run dev` (Vite dev server on port 5000)
- **Preview production build**: `npm run preview`
- **Build for production**: `npm run build`
- **Build for development**: `npm run build:dev`
- **Lint code**: `npm run lint` (ESLint)
- **Run tests**: `npm run test` (Vitest)
- **Run tests in watch mode**: `npm run test:watch`
- **Run tests with coverage**: `npm run test:coverage`
- **Run a single test**: `vitest run path/to/test-file.test.ts -t "test name"` or use Vitest's inline `test.only()`
- **Verify build (lint + test + build)**: `npm run verify:build`
- **Android development**:
  - Sync & open Android Studio: `npm run build:android`
  - Sync only: `npm run sync:android`
  - Open Android Studio: `npm run open:android`
- **Build Android APK**:
  - Debug: `npm run build:apk:debug`
  - Release: `npm run build:apk:release`
- **Version bumping** (remember to update android/app/build.gradle versionCode/versionName):
  - Patch: `npm run version:patch`
  - Minor: `npm run version:minor`
  - Major: `npm run version:major`

## 🏗️ High-Level Architecture

Summary from AGENTS.md:

- **Multi-role app**: Staff (`super_admin`, `manager`, `agent`, `marketer`, `pos`) + `customer` portal.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage).
- **Mobile**: Capacitor (Android) – runtime split: web layout for browser, role-specific native UI for APK.
- **Maps**: Leaflet / React Leaflet.

### Core Architecture Details

- **Entry & Providers**: Centralized in `src/App.tsx` (React Query, auth context, route guards, full route table).
- **Layout Switch**: `src/components/layout/AppLayout.tsx` switches to `src/mobile/MobileApp.tsx` when `isNativeApp()` is true.
- **Auth Context**: `src/contexts/AuthContext.tsx` is the source of truth for `user`, `role`, `profile`; role comes from `user_roles`, default fallback is `customer`.
- **Route Access Layering**:
  - `ProtectedRoute` (signed-in)
  - `RoleRoute` (dashboard fork)
  - `RoleGuard` (page-level role allowlists)
- **Data Flow**:
  - Prefer React Query + Supabase in pages/hooks; query keys are domain-named and invalidated by realtime (`src/hooks/useRealtimeSync.ts`).
  - Sales creation is RPC-first via `record_sale` (web: `src/pages/Sales.tsx`, mobile: `src/mobile/pages/agent/AgentRecord.tsx`).
  - Offline-first behavior: queue in IndexedDB via `src/lib/offlineQueue.ts`, sync via `src/hooks/useOnlineStatus.ts`.
  - DB owns outstanding recalculation via triggers/functions (see `supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql`).
  - Display IDs generated via `generate_display_id` RPC.
  - Proximity checks (`src/lib/proximity.ts`) enforce location constraints on sales and route visits; GPS pings logged to `location_pings`.

### Auth & Identity

- **Staff Auth**: Supabase email/password.
- **Customer Auth**: Firebase phone OTP → Supabase token exchange (`src/pages/Auth.tsx`, `src/lib/firebaseAuth.ts`, `supabase/functions/firebase-phone-exchange/index.ts`).
- **Customer Self-Registration**: Relies on RLS policies (`supabase/migrations/20260317000001_customer_self_register_rls.sql`).
- **KYC Documents**: Stored in `kyc-documents` bucket (private) with RLS policies (`supabase/migrations/20260320000001_gps_pings_push_subs_kyc_storage.sql`).
- **Staff Invitations**: Edge function `invite-staff` (super_admin gated).

## 📦 Supabase Edge Functions

Located in `supabase/functions/`:
- `toggle-user-ban` — Ban/unban users (super_admin only)
- `invite-staff` — Create staff accounts with roles
- `daily-store-reset` — Reset daily route session states
- `daily-handover-snapshot` — Create daily balance snapshots
- `auto-orders` — Auto-generate orders for eligible store types
- `firebase-phone-exchange` — Firebase OTP to Supabase token exchange
- `google-staff-exchange` — Google account linking
- `firebase-phone-exchange` — Verify OTP via OpenSMS
- `expense-manager` — Expense claim processing
- `send-otp-opensms` — Send OTP via OpenSMS
- `verify-otp-opensms` — Verify OTP via OpenSMS

## 🔧 Environment Variables

Create a `.env` file with:
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-supabase-project-id>
```

## 📜 Code Conventions

- Use `@/` path alias (configured in `vite.config.ts` and `tsconfig.app.json`).
- Keep role strings and permission keys consistent with existing unions/constants (`AuthContext`, `UserPermissionsPanel`).
- For permissions, use `usePermission(...)` instead of hardcoding capability checks in components.
- For staff-scoped route visibility, use `useRouteAccess` (`src/hooks/useRouteAccess.ts`).
- If you add new query domains, update invalidation mapping in `src/hooks/useRealtimeSync.ts`.
- Mobile code lives in `src/mobile/`; ignore `mobile-redesign/` unless explicitly refactoring towards it.

## ✅ Safe-edit Checklist for Agents

- Confirm whether the target flow is web-only, native-only, or shared (`AppLayout` switch).
- Preserve role-based behavior: update guard allowlists and mobile tab/menu mappings together.
- Prefer server-enforced invariants (RPC/SQL trigger/RLS) over duplicating business rules in UI.
- For offline-capable mutations, add queue + sync handling instead of online-only writes.
- After schema/query-key changes, verify realtime invalidation and affected role dashboards.

## 📚 Documentation Links (do not duplicate)

- Product and feature requirements: `src/docs/business_requirements.md`.
- Role UX references: `wireframes/ui_wireframes_agent.md`, `wireframes/ui_wireframes_marketer.md`, `wireframes/ui_wireframes_pos.md`, `wireframes/ui_wireframes_customer.md`.
- DB evolution/source of truth: `supabase/migrations/*.sql`, `TOTAL_MIGRATION.sql`, `aqua_prime_schema.sql`.
- Additional docs: `PRODUCTION_READY.md`, `DEPLOYMENT.md`, `SECURITY_SETUP.md`, `ENVIRONMENT_CONFIG.md`, `VERSIONING.md`, `SENTRY_SETUP.md`, `AGENTS.md`.

## 🧪 Testing Guidelines

- Tests are Vitest-based; colocate tests with implementation (`src/test/*` for pure logic).
- Use React Testing Library for component tests.
- Mock Supabase client where appropriate.
- Test both web and mobile-specific logic where applicable.
- Ensure offline-first behaviors are tested (queue/sync).
