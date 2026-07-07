-- ============================================================
-- Vehicle Tracking System — Base Tables & Modifications
-- ============================================================

-- 1. vehicle_integrations — links vehicles to Intangles IDs
create table if not exists public.vehicle_integrations (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles(id) on delete cascade,
  intangles_v_id  text,
  is_tracked      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_vehicle_integrations_vehicle
  on public.vehicle_integrations(vehicle_id);

-- 2. vehicle_telemetry — polled telemetry snapshots
create table if not exists public.vehicle_telemetry (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  timestamp         timestamptz not null,
  lat               float8,
  lng               float8,
  speed             float8,
  heading           float8,
  fuel_amount       float8,
  fuel_percentage   float8,
  adblue_level      float8,
  adblue_percentage float8,
  odometer_km       float8,
  engine_hours      float8,
  status            text,
  connection_status boolean,
  dtc_count         int not null default 0,
  has_warning_lamps boolean not null default false,
  raw_payload       jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_vehicle_telemetry_vehicle_time
  on public.vehicle_telemetry(vehicle_id, timestamp desc);

-- 3. vehicle_alert_thresholds — global alert limits
create table if not exists public.vehicle_alert_thresholds (
  id          uuid primary key default gen_random_uuid(),
  metric      text not null unique,
  value       float8 not null,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

insert into public.vehicle_alert_thresholds (metric, value) values
  ('fuel_pct', 15),
  ('adblue_pct', 15),
  ('warehouse_radius_m', 500),
  ('store_radius_m', 200)
on conflict (metric) do nothing;

-- 4. vehicle_fleet_summary — cached fleet state counts
create table if not exists public.vehicle_fleet_summary (
  id             uuid primary key default gen_random_uuid(),
  moving         int not null default 0,
  parked         int not null default 0,
  idling         int not null default 0,
  stopped        int not null default 0,
  out_of_network int not null default 0,
  sleeping       int not null default 0,
  charging       int not null default 0,
  connected      int not null default 0,
  disconnected   int not null default 0,
  updated_at     timestamptz not null default now()
);

-- 5. vehicle_sessions — auto-detected trips
create table if not exists public.vehicle_sessions (
  id                  uuid primary key default gen_random_uuid(),
  vehicle_id          uuid not null references public.vehicles(id) on delete cascade,
  start_time          timestamptz not null,
  end_time            timestamptz,
  start_odometer_km   float8,
  end_odometer_km     float8,
  total_distance_km   float8,
  fuel_used_liters    float8,
  fuel_cost           numeric(12,2),
  origin_warehouse_id uuid references public.warehouses(id),
  store_ids_visited   uuid[],
  stop_count          int,
  status              text not null default 'active',
  created_at          timestamptz not null default now()
);

create index if not exists idx_vehicle_sessions_vehicle
  on public.vehicle_sessions(vehicle_id, start_time desc);

-- 6. vehicle_session_stops — individual stops within sessions
create table if not exists public.vehicle_session_stops (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.vehicle_sessions(id) on delete cascade,
  store_id       uuid references public.stores(id),
  arrival_time   timestamptz not null,
  departure_time timestamptz,
  odometer_km    float8,
  lat            float8,
  lng            float8,
  stop_type      text not null default 'store',
  created_at     timestamptz not null default now()
);

create index if not exists idx_vehicle_session_stops_session
  on public.vehicle_session_stops(session_id, arrival_time);

-- 7. Add vehicle_id and quantity_liters to expenses
alter table public.expenses
  add column if not exists vehicle_id uuid references public.vehicles(id);

alter table public.expenses
  add column if not exists quantity_liters float8;

-- ============================================================
-- RLS Policies
-- ============================================================

alter table public.vehicle_integrations enable row level security;
alter table public.vehicle_telemetry enable row level security;
alter table public.vehicle_alert_thresholds enable row level security;
alter table public.vehicle_fleet_summary enable row level security;
alter table public.vehicle_sessions enable row level security;
alter table public.vehicle_session_stops enable row level security;

-- vehicle_integrations
create policy "staff_select_vehicle_integrations"
  on public.vehicle_integrations for select
  using (auth.role() = 'authenticated');

create policy "super_admin_manage_vehicle_integrations"
  on public.vehicle_integrations for insert
  with check (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  ));

create policy "super_admin_update_vehicle_integrations"
  on public.vehicle_integrations for update
  using (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  ));

-- vehicle_telemetry
create policy "staff_select_vehicle_telemetry"
  on public.vehicle_telemetry for select
  using (auth.role() = 'authenticated');

-- vehicle_alert_thresholds
create policy "staff_select_alert_thresholds"
  on public.vehicle_alert_thresholds for select
  using (auth.role() = 'authenticated');

create policy "super_admin_update_alert_thresholds"
  on public.vehicle_alert_thresholds for update
  using (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  ));

create policy "super_admin_insert_alert_thresholds"
  on public.vehicle_alert_thresholds for insert
  with check (exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  ));

-- vehicle_fleet_summary
create policy "staff_select_fleet_summary"
  on public.vehicle_fleet_summary for select
  using (auth.role() = 'authenticated');

-- vehicle_sessions
create policy "staff_select_vehicle_sessions"
  on public.vehicle_sessions for select
  using (auth.role() = 'authenticated');

-- vehicle_session_stops
create policy "staff_select_vehicle_session_stops"
  on public.vehicle_session_stops for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- Cron: poll Intangles every 60 seconds
-- ============================================================
select cron.schedule(
  'poll-intangles-vehicles',
  '* * * * *',
  
    select net.http_post(
      url := 'https://vrhptrtgrpftycvojaqo.supabase.co/functions/v1/poll-vehicle-telemetry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  
);
