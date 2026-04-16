-- supabase/migrations/20260418000004_staff_payroll.sql

-- 1. Worker Roles Table
create table if not exists worker_roles (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    warehouse_id uuid not null references warehouses(id) on delete cascade,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
comment on table worker_roles is 'Defines different job roles for workers within a warehouse.';

-- 2. Workers Table
create table if not exists workers (
    id uuid primary key default gen_random_uuid(),
    display_id text not null,
    full_name text not null,
    phone text,
    email text,
    address text,
    role_id uuid references worker_roles(id),
    warehouse_id uuid not null references warehouses(id) on delete cascade,
    is_active boolean default true,
    joining_date date,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
comment on table workers is 'Stores information about individual workers/staff.';
create unique index if not exists workers_display_id_idx on workers (display_id, warehouse_id);

-- 3. Payrolls Table
create table if not exists payrolls (
    id uuid primary key default gen_random_uuid(),
    display_id text not null,
    warehouse_id uuid not null references warehouses(id) on delete cascade,
    period_start_date date not null,
    period_end_date date not null,
    status text not null default 'draft', -- draft, processed, paid
    total_amount numeric(10, 2) default 0.00,
    notes text,
    created_by uuid references auth.users(id),
    created_at timestamptz default now(),
    processed_at timestamptz
);
comment on table payrolls is 'Represents a payroll run for a specific period.';
create unique index if not exists payrolls_display_id_idx on payrolls (display_id, warehouse_id);

-- 4. Payroll Items Table
create table if not exists payroll_items (
    id uuid primary key default gen_random_uuid(),
    payroll_id uuid not null references payrolls(id) on delete cascade,
    worker_id uuid not null references workers(id) on delete cascade,
    item_type text not null, -- 'salary', 'bonus', 'deduction'
    amount numeric(10, 2) not null,
    description text,
    created_at timestamptz default now()
);
comment on table payroll_items is 'Line items for each worker within a payroll run.';

-- RLS Policies
alter table worker_roles enable row level security;
alter table workers enable row level security;
alter table payrolls enable row level security;
alter table payroll_items enable row level security;

create policy "Allow all for super_admin" on worker_roles for all using (is_super_admin());
create policy "Allow manager to manage own warehouse roles" on worker_roles for all
    using (is_manager() and warehouse_id in (select managed_warehouse_id from get_managed_warehouses()));

create policy "Allow all for super_admin" on workers for all using (is_super_admin());
create policy "Allow manager to manage own warehouse workers" on workers for all
    using (is_manager() and warehouse_id in (select managed_warehouse_id from get_managed_warehouses()));

create policy "Allow all for super_admin" on payrolls for all using (is_super_admin());
create policy "Allow manager to manage own warehouse payrolls" on payrolls for all
    using (is_manager() and warehouse_id in (select managed_warehouse_id from get_managed_warehouses()));

create policy "Allow all for super_admin" on payroll_items for all using (is_super_admin());
create policy "Allow manager to manage own warehouse payroll items" on payroll_items for all
    using (is_manager() and payroll_id in (select id from payrolls where warehouse_id in (select managed_warehouse_id from get_managed_warehouses())));

-- Grants
grant select, insert, update, delete on table worker_roles to authenticated;
grant select, insert, update, delete on table workers to authenticated;
grant select, insert, update, delete on table payrolls to authenticated;
grant select, insert, update, delete on table payroll_items to authenticated;
