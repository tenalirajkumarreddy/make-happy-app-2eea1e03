# AGENTS.md

## Project quick map
- BizManager is a multi-role sales/route/collections app: staff (`super_admin`, `manager`, `agent`, `marketer`, `pos`) + `customer` portal.
- Frontend is React + Vite + TypeScript + shadcn/ui; backend is Supabase (Auth, Postgres, Realtime, Edge Functions).
- Runtime split is intentional: web layout for browser, role-specific native UI for APK.

## Architecture that matters first
- Entry and providers are centralized in `src/App.tsx` (React Query, auth context, route guards, full route table).
- `src/components/layout/AppLayout.tsx` switches to `src/mobile/MobileApp.tsx` when `isNativeApp()` is true.
- `src/contexts/AuthContext.tsx` is the source of truth for `user`, `role`, `profile`; role comes from `user_roles`, default fallback is `customer`.
- Route access is layered: `ProtectedRoute` (signed-in), `RoleRoute` (dashboard fork), `RoleGuard` (page-level role allowlists).

## Data flow + business rules
- Prefer React Query + Supabase in pages/hooks; query keys are domain-named and invalidated by realtime (`src/hooks/useRealtimeSync.ts`).
- Sales creation is RPC-first (`record_sale`) in `src/pages/Sales.tsx`; this is the canonical path for atomic sale + items + credit-limit checks.
- Offline-first behavior is explicit for field flows: queue in IndexedDB via `src/lib/offlineQueue.ts`, sync via `src/hooks/useOnlineStatus.ts`.
- DB owns outstanding recalculation via triggers/functions in `supabase/migrations/20260311120001_atomic_sale_balance_trigger.sql`.
- IDs are generated with `generate_display_id` RPC (examples in `src/pages/Sales.tsx`, `src/pages/Transactions.tsx`).

## Auth and identity specifics
- Staff auth uses Supabase email/password; customer auth uses Firebase phone OTP -> Supabase token exchange (`src/pages/Auth.tsx`, `src/lib/firebaseAuth.ts`, `supabase/functions/firebase-phone-exchange/index.ts`).
- New customer self-registration relies on RLS policies in `supabase/migrations/20260317000001_customer_self_register_rls.sql`.
- Staff invitation + role assignment is done by edge function `supabase/functions/invite-staff/index.ts` (super_admin gated).

## Conventions to follow in changes
- Use `@/` path alias (configured in `vite.config.ts` and `tsconfig.app.json`).
- Keep role strings and permission keys consistent with existing unions/constants (`AuthContext`, `UserPermissionsPanel`).
- For permissions, use `usePermission(...)` instead of hardcoding capability checks in components.
- For staff-scoped route visibility, use `useRouteAccess` (`src/hooks/useRouteAccess.ts`), and preserve its matrix semantics.
- If you add new query domains, update invalidation mapping in `src/hooks/useRealtimeSync.ts`.

## Developer workflows
- Install/start: `npm install`, `npm run dev` (Vite dev server uses port 5000 in `vite.config.ts`).
- Quality checks: `npm run lint`, `npm run test`, `npm run build`.
- Tests currently include focused unit tests (example: `src/test/routeAccess.test.ts`); add colocated `src/test/*` tests for pure logic.

## Integrations and boundaries
- Supabase client is in `src/integrations/supabase/client.ts` and expects `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Capacitor native plugins are initialized in `src/main.tsx` (StatusBar/SplashScreen) and wrapped via helpers in `src/lib/capacitorUtils.ts`.
- PWA caching is configured in `vite.config.ts` with NetworkFirst runtime caching for Supabase API calls.
- Notification writes are DB inserts (`src/lib/notifications.ts`), not external push services.

## Safe-edit checklist for agents
- Confirm whether the target flow is web-only, native-only, or shared (`AppLayout` switch).
- Preserve role-based behavior: update guard allowlists and mobile tab/menu mappings together.
- Prefer server-enforced invariants (RPC/SQL trigger/RLS) over duplicating business rules in UI.
- For offline-capable mutations, add queue + sync handling instead of online-only writes.
- After schema/query-key changes, verify realtime invalidation and affected role dashboards.
