# BizManager

Business Management System - Sales, Inventory & Customer Management

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend/DB**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Mobile**: Capacitor (Android)
- **Maps**: Leaflet / React Leaflet

## Getting Started

```sh
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Variables

Create a `.env` file with:

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-supabase-project-id>
```

## Supabase Edge Functions

Located in `supabase/functions/`:

- `toggle-user-ban` — Ban/unban users (super_admin only)
- `invite-staff` — Create staff accounts with roles
- `daily-store-reset` — Reset daily route session states
- `daily-handover-snapshot` — Create daily balance snapshots
- `auto-orders` — Auto-generate orders for eligible store types
