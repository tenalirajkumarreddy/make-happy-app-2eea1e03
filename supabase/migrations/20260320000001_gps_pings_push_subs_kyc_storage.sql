-- ============================================================
--  Migration: GPS trail pings, web push subscriptions, KYC storage policies
--  Date: 2026-03-20
-- ============================================================

-- ─────────────────────────────────────────────────────────────
--  1. LOCATION PINGS (GPS trail for route sessions)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.location_pings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.route_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  recorded_at timestamptz not null default now()
);

create index if not exists location_pings_session_id_idx on public.location_pings (session_id, recorded_at);
create index if not exists location_pings_user_id_idx    on public.location_pings (user_id, recorded_at);

alter table public.location_pings enable row level security;

-- Agents can insert their own pings
create policy "Agents insert own pings"
  on public.location_pings for insert
  with check (auth.uid() = user_id);

-- Staff (admin/manager) can read all pings; agents can read their own
create policy "Staff read all pings"
  on public.location_pings for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager')
    )
  );

-- Auto-purge pings older than 7 days to control storage
-- (run via pg_cron if available, or manual cleanup)
-- create extension if not exists pg_cron;
-- select cron.schedule('purge-location-pings', '0 2 * * *',
--   'delete from public.location_pings where recorded_at < now() - interval ''7 days''');


-- ─────────────────────────────────────────────────────────────
--  2. PUSH SUBSCRIPTIONS (Web Push / PWA notifications)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage their own subscriptions only
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read all (needed for backend fan-out)
create policy "Admins read all push subscriptions"
  on public.push_subscriptions for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager')
    )
  );


-- ─────────────────────────────────────────────────────────────
--  3. STORAGE BUCKETS + POLICIES
--  Note: bucket creation requires Supabase dashboard or CLI.
--  Run these SQL policies AFTER creating the buckets manually:
--    - kyc-documents  (private, 10MB limit)
--    - entity-photos  (public, 5MB limit)
-- ─────────────────────────────────────────────────────────────

-- KYC DOCUMENTS bucket policies
-- Customers can upload their own documents (folder = their customer ID)
create policy "Customers upload own KYC docs"
  on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- Customers can update/replace their own documents
create policy "Customers update own KYC docs"
  on storage.objects for update
  using (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- Admins and managers can view all KYC documents
create policy "Staff view KYC docs"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('super_admin', 'manager', 'agent')
    )
  );

-- Customers can view their own documents (folder starts with their customer ID)
create policy "Customers view own KYC docs"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and auth.uid() is not null
  );

-- ENTITY PHOTOS bucket policies
create policy "Authenticated users upload entity photos"
  on storage.objects for insert
  with check (
    bucket_id = 'entity-photos'
    and auth.uid() is not null
  );

create policy "Public read entity photos"
  on storage.objects for select
  using (bucket_id = 'entity-photos');

create policy "Authenticated users update entity photos"
  on storage.objects for update
  using (
    bucket_id = 'entity-photos'
    and auth.uid() is not null
  );
