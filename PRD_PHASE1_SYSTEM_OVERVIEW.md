# PRD Phase 1: System Overview & ID Standards

## System Architecture
- **Frontend**: React + Vite + TypeScript + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Runtime Split**: Web layout (`AppLayout.tsx`) for browser; role-specific native UI (`MobileApp.tsx`) for Android APK via Capacitor
- **State Management**: Centralized in `AuthContext.tsx` for `user`, `role`, `profile`
- **Routing**: Layered guards (`ProtectedRoute`, `RoleRoute`, `RoleGuard`)
- **Path Aliasing**: `@/` resolves to `src/` (configured in `vite.config.ts` and `tsconfig.app.json`)

## Environment Configuration
- **Environment Files**:
  - `.env` — Development (git-ignored)
  - `.env.production` — Production (git-ignored)
  - `.env.staging` — Optional staging (git-ignored)
  - `.env.example` — Template (version-controlled)
- **Required Environment Variables**:
  - `VITE_SUPABASE_URL` — Supabase project URL (e.g., `https://project.supabase.co`)
  - `VITE_SUPABASE_PUBLISHABLE_KEY` — Public Supabase key (starts with `sb_`)
  - `VITE_SUPABASE_PROJECT_ID` — Supabase project identifier
  - `VITE_FIREBASE_API_KEY` — Firebase API key for phone OTP
  - `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain (e.g., `project.firebaseapp.com`)
  - `VITE_FIREBASE_PROJECT_ID` — Firebase project ID
  - `VITE_FIREBASE_APP_ID` — Firebase app ID
- **Environment Detection**:
  - `import.meta.env.DEV` — true in development
  - `import.meta.env.PROD` — true in production
  - `import.meta.env.MODE` — `development`, `production`, or `staging`
- **Security Note**: All `VITE_*` variables are exposed in the client bundle; sensitive keys must never be included.

## Build & Deployment
- **Development**: `npm run dev` (Vite server on port 5003)
- **Web Build**: `npm run build` (production), `npm run build:dev` (development)
- **Android APK**:
  - Debug: `npm run build:apk:debug` (uses `.env`)
  - Release: `npm run build:apk:release` (uses `.env.production`)
- **PWA Caching**: Configured in `vite.config.ts` with NetworkFirst for Supabase API calls; caches static assets and Google Fonts
- **Vercel Deployment**: Environment variables configured in Vercel UI; auto-deploys on git push

## Display ID Generation
- **Server-Side** (Primary):
  - Function: `generate_display_id(prefix TEXT)`
  - Source: `supabase/migrations/20260411000003_display_id_generator.sql`
  - Format: `PREFIX-YYYYMMDD-0001`
  - Example: `SALE-20260412-0001`
  - Uses atomic counter table (`display_id_counters`) to ensure uniqueness
- **Client-Side** (Legacy/Backup):
  - Function: `generateDisplayId(prefix: string)`
  - Source: `src/lib/displayId.ts`
  - Format: `PREFIX + 8 random digits`
  - Example: `CUST83749261`
  - Used only in offline queue recovery or fallback scenarios
- **Usage**:
  - `SALE-...` — Sales
  - `PAY-...` — Payments
  - `ORD-...` — Orders
  - `CUST-...` — Customers
  - `STR-...` — Stores
- **Key Rule**: Server-generated IDs are authoritative; client-generated IDs are never persisted without server validation.

## Supabase Client
- Initialized in `src/integrations/supabase/client.ts`
- Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `env.ts`
- Persistent session with auto-refresh and localStorage storage
- TypeScript type definitions generated from Supabase schema

## Mobile Integration
- **Capacitor**: Used for native Android features
- **Plugins Initialized**: StatusBar, SplashScreen via `src/main.tsx`
- **Wrapper Helpers**: `src/lib/capacitorUtils.ts` for platform-specific logic
- **Location**: GPS pings captured via Capacitor Geolocation plugin, logged to `location_pings` table

## Codebase Structure
- `src/` — Frontend React application
- `src/mobile/` — Android-specific UI (ignored if `isNativeApp() === false`)
- `supabase/migrations/` — PostgreSQL schema evolution (source of truth)
- `supabase/functions/` — Edge Functions (Deno runtime)
- `.env.example` — Environment template (must be filled)
- `AGENTS.md` — Architectural conventions and safe-edit checklist
- `business_requirements.md` — Functional requirements
- `aqua_prime_schema.sql` — Final synthesized schema

## Development Workflows
- Install: `npm install`
- Start: `npm run dev`
- Lint: `npm run lint`
- Test: `npm run test`
- Test Watch: `npm run test:watch`
- Build: `npm run build`
- Build APK: `npm run build:apk:debug` or `npm run build:apk:release`
- Build Staging: `npm run build -- --mode staging`

## Key Conventions
- Always use `usePermission(...)` for access checks; never hardcode role strings
- Use `useRouteAccess(...)` for role-based route visibility
- Add new query domains to `useRealtimeSync.ts` for realtime invalidation
- Mobile code lives in `src/mobile/`; ignore `mobile-redesign/`
- Prefer server-enforced logic (RPCs, SQL triggers, RLS) over client validation
- For offline flows: queue in IndexedDB → sync on reconnect → use server-generated IDs
- All RPCs must be defined in Supabase and typed in `src/integrations/supabase/types.ts`

---
**Next Phase**: Phase 2 — User Roles & Permissions Matrix