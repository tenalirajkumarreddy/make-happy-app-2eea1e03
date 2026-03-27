-- Unified auth foundation: staff directory + customer phone constraints + profile edit restrictions

-- 1) Staff directory (staff are NOT customers)
create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  phone text not null,
  full_name text not null,
  avatar_url text,
  role app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_directory_role_check check (role in ('super_admin','manager','agent','marketer','pos'))
);

create unique index if not exists staff_directory_phone_key_idx
  on public.staff_directory (right(regexp_replace(phone, '\\D', '', 'g'), 10));

create index if not exists staff_directory_user_id_idx
  on public.staff_directory (user_id);

-- 2) Customer phone must exist and be unique by normalized phone key
alter table public.customers
  alter column phone set not null;

create unique index if not exists customers_phone_key_idx
  on public.customers (right(regexp_replace(phone, '\\D', '', 'g'), 10));

-- 3) RLS for staff_directory (admin managed; staff can view own row)
alter table public.staff_directory enable row level security;

drop policy if exists "Staff can view own staff directory row" on public.staff_directory;
create policy "Staff can view own staff directory row"
  on public.staff_directory
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can view all staff directory rows" on public.staff_directory;
create policy "Admins can view all staff directory rows"
  on public.staff_directory
  for select
  to authenticated
  using (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'));

drop policy if exists "Super admin can insert staff directory rows" on public.staff_directory;
create policy "Super admin can insert staff directory rows"
  on public.staff_directory
  for insert
  to authenticated
  with check (has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin can update staff directory rows" on public.staff_directory;
create policy "Super admin can update staff directory rows"
  on public.staff_directory
  for update
  to authenticated
  using (has_role(auth.uid(), 'super_admin'))
  with check (has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin can delete staff directory rows" on public.staff_directory;
create policy "Super admin can delete staff directory rows"
  on public.staff_directory
  for delete
  to authenticated
  using (has_role(auth.uid(), 'super_admin'));

-- 4) Staff cannot self-edit profile
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Customers can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id and has_role(auth.uid(), 'customer'))
  with check (auth.uid() = user_id and has_role(auth.uid(), 'customer'));
