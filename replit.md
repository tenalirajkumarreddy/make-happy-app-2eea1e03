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
- Promotional banners, product categories, pricing tiers
- Activity logs, analytics & reports
- Push notifications (via Supabase Realtime)
- Offline support (PWA + offline queue)

## Environment Variables
Set in `.env` and Replit `[userenv.shared]`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID
- `VITE_FIREBASE_API_KEY` — Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` — Firebase project ID
- `VITE_FIREBASE_APP_ID` — Firebase app ID

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
- Build: `npm run build`

## Database
Supabase PostgreSQL with full RLS policies. Schema migrations in `supabase/migrations/`. The complete SQL is also in `TOTAL_MIGRATION.sql`.
