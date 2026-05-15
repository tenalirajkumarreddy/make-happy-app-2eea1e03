# Aqua Prime — Business Management System

## Overview
A full-featured business management web app built with React, Vite, TypeScript, and Supabase. It supports multi-role authentication (super_admin, manager, agent, marketer, pos, customer) with role-based access control throughout. Branded as "Aqua Prime" with phone OTP (Firebase) and Google login.

## Architecture
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, React Query
- **Backend/DB**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Phone Auth**: Firebase Phone OTP → exchanges token with Supabase via Edge Function
- **Maps**: Leaflet / React Leaflet
- **Mobile**: Capacitor (Android APK included)

## Key Features
- Multi-role dashboard (Admin, Manager, Agent, Marketer, POS, Customer portals)
- Customer & Store management with KYC document upload
- Sales, Transactions, and Orders management with credit limits
- Route management with GPS tracking and live agent location
- Handovers & daily balance snapshots
- Promotional banners (`/banners`) with image upload management
- Inventory tracking (`/inventory`) with virtual list for large datasets
- Product catalog with pricing tiers and agent-facing product view
- Smart Insights report with AI-powered `forecastEngine` (trend predictions)
- Activity logs, analytics & reports (Smart Insights default)
- Push notifications (Supabase Realtime in-app + Web Push service worker in production)
- GPS route tracking with live agent location markers and historical trail polylines on map
- Customer KYC self-upload (selfie + Aadhaar front/back → auto-submits for review)
- Agent mobile: Product Catalog tab + Add Customer/Store overlay from home screen
- Offline support (PWA service worker + offline queue)
- Android APK via Capacitor (`npm run build:apk:debug` / `npm run build:apk:release`)

## New Pages & Components (integrated from intelj branch)
| File | Description |
|------|-------------|
| `src/pages/Inventory.tsx` | Inventory management page with stock levels and virtual scrolling |
| `src/pages/Banners.tsx` | Promotional banner management with image uploads |
| `src/components/reports/SmartInsightsReport.tsx` | AI-driven sales forecasts and trend insights |
| `src/lib/forecastEngine.ts` | Forecast computation utilities (trend, anomaly detection) |
| `src/components/shared/VirtualDataTable.tsx` | Virtualised table using `@tanstack/react-virtual` |
| `src/mobile/pages/agent/AgentProducts.tsx` | Mobile agent product catalog view |
| `src/mobile/pages/agent/AddCustomerStore.tsx` | Overlay form to add new customers/stores from agent home |
| `src/lib/errorUtils.ts` | Shared error formatting and retry helpers |

## Environment Variables
Set in `.env` and Replit `[userenv.shared]`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID
- `VITE_FIREBASE_API_KEY` — Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` — Firebase project ID
- `VITE_FIREBASE_APP_ID` — Firebase app ID
- `VITE_VAPID_PUBLIC_KEY` — VAPID public key for Web Push (optional, needed for background push)

## Supabase Edge Functions
Located in `supabase/functions/` (deployed to Supabase, not Replit):
- `firebase-phone-exchange` — Validates Firebase phone OTP token and returns Supabase session
- `toggle-user-ban` — Ban/unban users (super_admin only)
- `invite-staff` — Create staff accounts with roles
- `daily-store-reset` — Reset daily route session states
- `daily-handover-snapshot` — Create daily balance snapshots per user
- `auto-orders` — Auto-generate orders for eligible store types

## Development
- Run: `npm run dev` (served on port 5000)
- Workflow: "Start application" → `npm run dev`
- Build web: `npm run build`
- Build Android debug APK: `npm run build:apk:debug`
- Build Android release APK: `npm run build:apk:release`
- Sync Capacitor: `npm run sync:android`

## Database
Supabase PostgreSQL with full RLS policies. Schema migrations in `supabase/migrations/`. The complete consolidated SQL (all migrations combined) is in `aqua_prime_schema.sql` — run this on a fresh Supabase project to set up everything.

### Key tables added in latest migration (20260320000001):
- `location_pings` — GPS trail breadcrumbs per route session (indexed, RLS-protected)
- `push_subscriptions` — Web Push endpoint/keys per user for background notifications

### Storage buckets required (create in Supabase dashboard):
- `kyc-documents` — private, max 10MB, for customer KYC uploads
- `entity-photos` — public, max 5MB, for store/product/customer photos
