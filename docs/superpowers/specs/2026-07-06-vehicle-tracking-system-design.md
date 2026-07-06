# Vehicle Tracking System — Design Spec

**Date:** 2026-07-06
**Status:** Draft
**Roles affected:** super_admin, manager

---

## 1. Overview

Replace the existing basic `AdminVehicles.tsx` CRUD page with an Intangles API-powered
vehicle tracking system that provides real-time telemetry, geofence-based alerts,
auto-detected vehicle sessions (route analytics), and support for manual (directory-only)
vehicles.

Two new frontend routes are added — `/admin/vehicles` (tracking dashboard) and
`/admin/vehicles/sessions` (session analytics). The existing `/admin/vehicles` route
path is reused but the page is replaced entirely. Old page fields (mileage, capacity,
etc.) are removed.

---

## 2. Data Model

### 2.1 Existing `vehicles` table

The `vehicles` table (plate, capacity, status) remains as the base entity. It is
**not modified**.

### 2.2 New table: `vehicle_integrations`

Links our `vehicles` to Intangles API IDs and distinguishes tracked vs manual vehicles.

```sql
create table vehicle_integrations (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  intangles_v_id text,          -- Intangles vehicle ID (null for manual)
  is_tracked  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

- `is_tracked = true` → real-time polling, alerts, sessions, map
- `is_tracked = false` → manual vehicle (directory-only, expense tracking)
- `intangles_v_id` is null for manual vehicles

### 2.3 New table: `vehicle_telemetry`

Stores every polled snapshot from the Intangles API. One row per vehicle per poll cycle.

```sql
create table vehicle_telemetry (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references vehicles(id) on delete cascade,
  timestamp         timestamptz not null,
  lat               float8,
  lng               float8,
  speed             float8,            -- km/h
  heading           float8,            -- degrees
  fuel_amount       float8,            -- liters
  fuel_percentage   float8,
  adblue_level      float8,            -- liters
  adblue_percentage float8,
  odometer_km       float8,
  engine_hours      float8,
  status            text,              -- PARKED | MOVING | IDLING
  connection_status boolean,
  dtc_count         int default 0,
  has_warning_lamps boolean default false,
  raw_payload       jsonb,             -- full API response preserved
  created_at        timestamptz not null default now()
);

create index idx_vehicle_telemetry_vehicle_time
  on vehicle_telemetry(vehicle_id, timestamp desc);
```

### 2.4 New table: `vehicle_alert_thresholds`

Global threshold values shared across all tracked vehicles.

```sql
create table vehicle_alert_thresholds (
  id            uuid primary key default gen_random_uuid(),
  metric        text not null unique,  -- fuel_pct | adblue_pct | warehouse_radius_m | store_radius_m
  value         float8 not null,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
```

Defaults seeded by the edge function or migration:
- `fuel_pct` = 15
- `adblue_pct` = 15
- `warehouse_radius_m` = 500
- `store_radius_m` = 200

### 2.5 New table: `vehicle_sessions`

An auto-detected trip: vehicle leaves warehouse geofence, visits stores, returns.

```sql
create table vehicle_sessions (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references vehicles(id) on delete cascade,
  start_time         timestamptz not null,
  end_time           timestamptz,
  start_odometer_km  float8,
  end_odometer_km    float8,
  total_distance_km  float8,           -- end_odometer - start_odometer
  fuel_used_liters   float8,           -- computed from telemetry
  fuel_cost          numeric(12,2),    -- fuel_used × last unit price from expenses
  origin_warehouse_id uuid references warehouses(id),
  store_ids_visited   uuid[],          -- stores stopped at
  stop_count          int,
  status              text not null default 'active',  -- active | completed
  created_at          timestamptz not null default now()
);
```

### 2.6 New table: `vehicle_session_stops`

Individual stops within a session.

```sql
create table vehicle_session_stops (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references vehicle_sessions(id) on delete cascade,
  store_id        uuid references stores(id),  -- null if stop is unexplained
  arrival_time    timestamptz not null,
  departure_time  timestamptz,
  odometer_km     float8,
  lat             float8,
  lng             float8,
  stop_type       text not null default 'store',  -- store | warehouse | unexplained
  created_at      timestamptz not null default now()
);
```

### 2.7 Modifications to `expenses`

```sql
alter table expenses add column vehicle_id uuid references vehicles(id);
alter table expenses add column quantity_liters float8;
```

Fuel expenses recorded against a vehicle get the vehicle_id set. The `quantity_liters`
field captures volume, so unit price = `amount / quantity_liters`.

### 2.8 New table: `vehicle_fleet_summary`

Cached fleet-level state counts, updated by the edge function each poll.

```sql
create table vehicle_fleet_summary (
  id               uuid primary key default gen_random_uuid(),
  moving           int not null default 0,
  parked           int not null default 0,
  idling           int not null default 0,
  stopped          int not null default 0,
  out_of_network   int not null default 0,
  sleeping         int not null default 0,
  charging         int not null default 0,
  connected        int not null default 0,
  disconnected     int not null default 0,
  updated_at       timestamptz not null default now()
);
```

Only the latest row is used by the frontend.

### 2.9 Notification types

New notification type values used with the existing `notifications` table:
- `fuel_low`
- `adblue_low`
- `parked_unauthorized`
- `stopped_unauthorized`
- `at_store_delivery`
- `intangles_token_expired`

---

## 3. Polling Architecture (Edge Function)

### 3.1 `poll-vehicle-telemetry` Edge Function

- **Trigger:** Supabase cron job, every 60 seconds
- **Environment variables:**
  - `INTANGLES_TOKEN` (string)
  - `INTANGLES_CLIENT` (string, e.g. `imaxx_app`)
  - `INTANGLES_ACCOUNT_ID` (string)
- **Flow:**
  1. Read env vars + fetch `vehicle_integrations` where `is_tracked = true`
  2. Call `GET /vehicle/getlist?lastloc=true&proj=commands&acc_id=...`
  3. Call `GET /vehicle/getstatescount?vehicle_states=stopped&acc_id=...`
  4. For each vehicle in response:
     - Insert row into `vehicle_telemetry`
     - Run alert rules against thresholds
     - Run geofence checks (warehouse, stores)
     - Session detection: load any `status = 'active'` sessions from DB
       (recovers sessions if edge function restarted mid-trip)
     - If vehicle just re-entered warehouse geofence → finalize open session
     - If vehicle just left warehouse geofence → create new session
  5. If API returns 401 → insert `intangles_token_expired` notification
  6. Store fleet summary into `vehicle_fleet_summary` table
     (single row per poll: moving, parked, idling, out_of_network counts)

### 3.2 Token Expiry Handling

- 401 response → insert notification `type = 'intangles_token_expired'`
- Frontend vehicle page shows a dismissible banner: "Intangles API token expired. Update in Supabase Edge Function environment variables."
- Admin updates env var in Supabase dashboard → function picks it up on next invocation

---

## 4. Alert System

### 4.1 Alert rules (evaluated per poll)

| Alert type | Condition | Notes |
|---|---|---|
| `fuel_low` | `fuel_percentage < threshold_fuel_pct` | Fires once per vehicle per session (debounced per threshold crossing) |
| `adblue_low` | `adblue_percentage < threshold_adblue_pct` | Same debounce logic |
| `parked_unauthorized` | Status = PARKED AND location outside warehouse AND outside all store geofences | Debounce: >2 min |
| `stopped_unauthorized` | Speed = 0 AND location outside warehouse AND outside store geofences AND >5 min | Debounce: >5 min |
| `at_store_delivery` | Vehicle stopped (speed=0) within store geofence for >2 min (delivery in progress) | |
| `intangles_token_expired` | API returns 401 | |

### 4.2 Debounce

Each alert type has a cooldown per vehicle to avoid flooding:
- Insert notification only if no identical notification exists for this vehicle + type within the last 30 minutes

### 4.3 Delivery

Alerts go to the existing `notifications` table with:
- `type` = alert type string
- `title` + `message` describing the event
- `recipient_role` = `['super_admin', 'manager']`
- `link` pointing to `/admin/vehicles`

The existing `useNotifications.ts` + `useRealtimeSync.ts` handle delivery:
- In-app: toast + bell icon badge
- Push: Capacitor LocalNotifications (via existing `useNotifications` hook)

---

## 5. Vehicle Sessions

### 5.1 Detection lifecycle

Sessions are detected purely from telemetry logs (independent of agent routes).

1. **Vehicle exits warehouse geofence** (lat/lng moves outside warehouse radius)
   → Insert `vehicle_sessions` row with `status = 'active'`, `start_time`, `start_odometer_km`, `origin_warehouse_id`

2. **Vehicle stops at a store** (location within store geofence for >2 min)
   → Insert `vehicle_session_stops` with `store_id`, `arrival_time`, `stop_type = 'store'`
   → Fire `at_store_delivery` alert

3. **Vehicle stops at an unknown location** (not warehouse, not any store)
   → Insert `vehicle_session_stops` with `store_id = null`, `stop_type = 'unexplained'`
   → Fire `stopped_unauthorized` alert if >5 min

4. **Vehicle re-enters warehouse geofence**
   → Update session: `end_time`, `end_odometer_km`, `total_distance_km`, `fuel_used_liters`, `status = 'completed'`
   → Compute `fuel_used_liters` from telemetry snapshot deltas (accounting for mid-trip refuels)
   → Look up last fuel expense for this vehicle → derive unit price → compute `fuel_cost`

### 5.2 Storage

Detection runs inside the edge function after each poll. On every invocation, the
edge function queries `vehicle_sessions` for any `status = 'active'` rows and
loads them into memory. This naturally recovers sessions if the function restarts
mid-trip — active sessions resume tracking from the most recent telemetry snapshot.

### 5.3 Fuel cost calculation

```sql
-- Find the most recent fuel expense for this vehicle
select e.amount / nullif(e.quantity_liters, 0) as unit_price
from expenses e
where e.vehicle_id = :vehicle_id
  and e.quantity_liters is not null
  and e.quantity_liters > 0
order by e.created_at desc
limit 1;

-- fuel_cost = fuel_used_liters * unit_price
```

---

## 6. Frontend

### 6.1 Route structure

| Route | Page | Access |
|---|---|---|
| `/admin/vehicles` | Tracking dashboard (replaces old AdminVehicles) | super_admin, manager |
| `/admin/vehicles/sessions` | Vehicle sessions table with analytics | super_admin, manager |
| `/admin/vehicles/settings` | Alert threshold configuration | super_admin |

### 6.2 Vehicle Tracking Dashboard (`/admin/vehicles`)

**Layout:** Left sidebar (vehicle list) + right side split vertically (metric cards top, map bottom).

**Left sidebar:**
- Search input to filter vehicles by plate/tag
- Scrollable list of vehicles, one per row:
  - Tracked vehicles: show tag, status badge (PARKED/MOVING), fuel %, AdBlue %
  - Manual vehicles: greyed styling with "(Manual)" tag, no telemetry data shown
- Selected vehicle is highlighted
- Footer links: "Alert Settings" → `/admin/vehicles/settings`, "Vehicle Sessions" → `/admin/vehicles/sessions`
- Fleet summary card at top: Moving/Parked/Idling/Out-of-network counts

**Metric cards row** (right top):
- Cards for: Fuel (L + %), AdBlue (L + %), Odometer (km), Engine Hours, Status (with speed), Health (DTC count + lamp status), Last Seen timestamp
- Cards use existing shadcn/ui Card components styled per app theme
- Red/orange coloring for low values, green for normal

**Map** (right bottom):
- Leaflet map reusing the existing tile config from `MapPage.tsx`
- Marker for selected vehicle at its current lat/lng
- Heading arrow indicator on marker (rotated by `hd` value)
- Polyline showing last N location points (recent path)

**Auto-refresh:** React Query `refetchInterval: 10000` (10s) on the telemetry query. Uses the `vehicle_telemetry` table (latest row per vehicle).

**Add Vehicle (manual/tracked) button:**
- A button in the sidebar header opens a dialog to add a vehicle
- For tracked vehicles: enter plate/tag → system creates a `vehicles` row + `vehicle_integrations` row (Intangles v_id auto-matched from API)
- For manual vehicles: enter plate/tag + optional details → creates a `vehicles` row + `vehicle_integrations` with `is_tracked = false`

**Token expired banner:** When `intangles_token_expired` notification exists, a yellow banner appears at the top: "Intangles API token has expired. Update it in Supabase settings to resume tracking."

### 6.3 Vehicle Sessions Page (`/admin/vehicle-sessions`)

- Table: Date | Vehicle | Origin Warehouse | Stores Visited | Distance (km) | Fuel Used (L) | Fuel Cost (₹) | Duration
- Expandable rows: click to show list of stops with store name, arrival/departure time
- Filters: date range, vehicle select, warehouse select
- Sorting by date descending (default)

### 6.4 Alert Settings Page (`/admin/vehicles/settings`)

Simple form with numeric inputs for each metric in `vehicle_alert_thresholds`:
- Low Fuel (%) — default 15
- Low AdBlue (%) — default 15
- Warehouse Geofence Radius (m) — default 500
- Store Geofence Radius (m) — default 200

Uses React Hook Form + Zod, saves to `vehicle_alert_thresholds` via Supabase upsert.

### 6.5 Sidebar / Navigation updates

- `AppSidebar.tsx`: Change "Vehicles" link for `super_admin` and `manager` to point to new `/admin/vehicles`
- Consider adding sub-links or a dropdown: Dashboard | Sessions | Settings

### 6.6 Mobile

The existing mobile AdminVehicles route (`src/mobile/pages/admin/AdminVehicles.tsx`) should follow the same pattern — vehicle list → detail view with telemetry data. Mobile page can skip the map and show a simpler card layout.

---

## 7. Security & RLS

Policies mirror the existing patterns in the codebase (warehouse-scoped where applicable):

- `vehicle_integrations`: SELECT for all authenticated staff, INSERT/UPDATE for super_admin only
- `vehicle_telemetry`: SELECT for authenticated staff, INSERT by edge function (service_role)
- `vehicle_alert_thresholds`: SELECT for all staff, UPDATE for super_admin only
- `vehicle_sessions`: SELECT for authenticated staff, INSERT/UPDATE by edge function (service_role)
- `vehicle_session_stops`: SELECT for authenticated staff, INSERT/UPDATE by edge function (service_role)

---

## 8. Testing

- Unit tests for session detection logic (geofence transitions, stop matching)
- Unit tests for alert rule evaluation
- Edge function unit tests (mock Intangles API, verify telemetry inserts)
- Frontend component tests for vehicle list, metric cards, map integration
- E2E: poll → telemetry row → UI displays data

---

## 9. Out of Scope (for this spec)

- Driver assignment / driver management
- Vehicle maintenance scheduling
- Fuel efficiency reporting dashboards (beyond per-session cost)
- Integration with existing agent routes (different system per user confirmation)
- Historical data backfill (starts fresh after deployment)
