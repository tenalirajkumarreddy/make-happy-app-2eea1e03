# BizManager - Business Management System

## Overview
A full-featured business management web app built with React, Vite, TypeScript, and Supabase. It supports multi-role authentication (super_admin, manager, agent, marketer, pos, customer) with role-based access control throughout.

## Architecture
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, React Query
- **Backend/DB**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Maps**: Leaflet / React Leaflet
- **Mobile**: Capacitor (Android support)

## Key Features
- Multi-role dashboard (Admin, Manager, Agent, Marketer, POS, Customer portals)
- Customer & Store management with KYC
- Sales, Transactions, and Orders management
- Route management with GPS tracking
- Handovers & daily snapshots
- Promotional banners, product categories, pricing tiers
- Activity logs, analytics & reports
- Push notifications (via Supabase Realtime)

## Environment Variables
Stored in Replit shared environment:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

## Supabase Edge Functions
Located in `supabase/functions/`:
- `toggle-user-ban` — Ban/unban users (super_admin only)
- `invite-staff` — Create staff accounts with roles
- `daily-store-reset` — Reset daily route session states
- `daily-handover-snapshot` — Create daily balance snapshots
- `auto-orders` — Auto-generate orders for eligible store types

## Development
- Run: `npm run dev` (served on port 5000)
- Workflow: "Start application" → `npm run dev`
