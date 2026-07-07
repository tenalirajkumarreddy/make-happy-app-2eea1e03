-- ==============================================
-- CRM Target & Follow-up System Migration
-- Phase 1: Core Tables, RLS, and Triggers
-- ==============================================

-- ==============================================
-- 1. STORE_TARGETS
-- Monthly sales targets per store
-- ==============================================
create table if not exists store_targets (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references stores(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  target_amount int not null check (target_amount > 0),
  created_by uuid references profiles(id),
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, month, year)
);

-- Index for fast lookup of active targets by store
create index idx_store_targets_store_id_status on store_targets(store_id, status) where status = 'active';
create index idx_store_targets_month_year on store_targets(month, year) where status = 'active';

-- RLS
alter table store_targets enable row level security;

create policy "Marketers and admins can view store targets"
  on store_targets for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('marketer', 'admin', 'super_admin', 'manager')
    )
  );

create policy "Admins and managers can create/update store targets"
  on store_targets for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 2. MARKETER_TARGETS
-- Monthly targets per marketer (units or collection)
-- ==============================================
create table if not exists marketer_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  target_type text not null default 'units' check (target_type in ('units', 'collection')),
  target_amount int not null check (target_amount > 0),
  current_progress int default 0 check (current_progress >= 0),
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, month, year)
);

-- Index for fast lookup
create index idx_marketer_targets_user_id on marketer_targets(user_id, status) where status = 'active';
create index idx_marketer_targets_month_year on marketer_targets(month, year) where status = 'active';

-- RLS
alter table marketer_targets enable row level security;

create policy "Users can view their own targets and admins can view all"
  on marketer_targets for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

create policy "Admins and managers can create/update marketer targets"
  on marketer_targets for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 3. FOLLOW_UP_SCHEDULE
-- The core follow-up scheduling table
-- ==============================================
create type follow_up_reason as enum ('low_stock', 'run_out', 'must_order', 'target_at_risk', 'overdue_payment');
create type follow_up_priority as enum ('low', 'medium', 'high', 'critical');
create type follow_up_status as enum ('pending', 'done', 'snoozed', 'auto_resolved', 'cancelled_by_sale', 'expired');

create table if not exists follow_up_schedule (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references stores(id) on delete cascade,
  marketer_id uuid references profiles(id) on delete set null,
  reason follow_up_reason not null,
  priority follow_up_priority not null default 'medium',
  status follow_up_status default 'pending',
  scheduled_date date not null,
  snooze_until date,
  depletion_date date, -- when the stock is projected to run out
  last_sale_date date, -- the sale this follow-up is based on
  last_sale_amount int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id)
);

-- Indexes for performance
create index idx_follow_up_schedule_store_id on follow_up_schedule(store_id, status) where status in ('pending', 'snoozed');
create index idx_follow_up_schedule_marketer_id on follow_up_schedule(marketer_id, scheduled_date) where status in ('pending', 'snoozed');
create index idx_follow_up_schedule_scheduled on follow_up_schedule(scheduled_date, status) where status in ('pending', 'snoozed');

-- RLS
alter table follow_up_schedule enable row level security;

create policy "Marketers can view follow-ups for their assigned stores"
  on follow_up_schedule for select
  using (
    marketer_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

create policy "Marketers can update their own follow-ups"
  on follow_up_schedule for update
  using (
    marketer_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

create policy "Admins can manage all follow-ups"
  on follow_up_schedule for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 4. FOLLOW_UP_ACTIONS
-- Audit log of actions taken on each follow-up
-- ==============================================
create type action_type as enum ('call', 'visit', 'whatsapp', 'mark_done', 'snooze', 'cancel', 'retry');

create table if not exists follow_up_actions (
  id uuid default gen_random_uuid() primary key,
  follow_up_id uuid not null references follow_up_schedule(id) on delete cascade,
  action_type action_type not null,
  note text,
  performed_at timestamptz default now(),
  performed_by uuid references profiles(id)
);

create index idx_follow_up_actions_follow_up_id on follow_up_actions(follow_up_id, performed_at desc);

-- RLS - same as follow_up_schedule
alter table follow_up_actions enable row level security;
create policy "Marketers can view actions for their stores"
  on follow_up_actions for select
  using (
    exists (
      select 1 from follow_up_schedule f
      where f.id = follow_up_actions.follow_up_id
      and (f.marketer_id = auth.uid()
        or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin', 'manager'))
      )
    )
  );

create policy "Admins can manage all follow-up actions"
  on follow_up_actions for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 5. TARGET_CHANGE_REQUESTS
-- Marketer proposals for target changes (admin approval)
-- ==============================================
create type target_change_status as enum ('pending', 'approved', 'rejected');

create table if not exists target_change_requests (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references stores(id) on delete cascade,
  proposed_by uuid references profiles(id),
  current_target int not null,
  proposed_target int not null,
  reason text,
  status target_change_status default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now()
);

create index idx_target_change_requests_store on target_change_requests(store_id, status) where status = 'pending';
create index idx_target_change_requests_proposed_by on target_change_requests(proposed_by, status) where status = 'pending';

-- RLS
alter table target_change_requests enable row level security;

create policy "Marketers can view/propose target changes for their stores"
  on target_change_requests for select
  using (
    proposed_by = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

create policy "Marketers can create target change requests"
  on target_change_requests for insert
  with check (
    proposed_by = auth.uid()
  );

create policy "Admins can review target change requests"
  on target_change_requests for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 6. BUSINESS_SETTINGS
-- Admin configurable settings
-- ==============================================

create table if not exists business_settings (
  id serial primary key,
  setting_key text not null unique,
  setting_value text not null,
  description text,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id)
);

-- Insert default settings
insert into business_settings (setting_key, setting_value, description) values
  ('follow_up_lead_time_days', '2', 'Number of days before runout to show follow-up'),
  ('follow_up_grace_period_days', '2', 'Days after runout before MUST_ORDER is triggered'),
  ('burn_rate_safety_floor_percent', '50', 'Safety floor as % of base daily burn (e.g., 50 = 50%)'),
  ('follow_up_working_days', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', 'Comma-separated days for follow-up scheduling')
on conflict (setting_key) do nothing;

-- RLS
alter table business_settings enable row level security;

create policy "Anyone can view business settings"
  on business_settings for select to authenticated using (true);

create policy "Only admins can modify business settings"
  on business_settings for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
    )
  );

-- ==============================================
-- 7. TRIGGERS
-- Auto-update updated_at timestamps
-- ==============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_store_targets_updated_at before update on store_targets
  for each row execute function update_updated_at_column();

create trigger update_marketer_targets_updated_at before update on marketer_targets
  for each row execute function update_updated_at_column();

create trigger update_follow_up_schedule_updated_at before update on follow_up_schedule
  for each row execute function update_updated_at_column();

-- ==============================================
-- 8. RPC FUNCTION: get_store_depletion
-- Calculates projected depletion for a single store
-- ==============================================
create or replace function get_store_depletion(
  p_store_id uuid,
  p_as_of_date date default current_date
)
returns table (
  last_sale_date date,
  last_sale_amount int,
  remaining_target int,
  remaining_days int,
  daily_burn numeric,
  projected_runout date,
  follow_up_date date
) as $$
declare
  v_target record;
  v_total_sales int;
  v_last_sale record;
  v_remaining_target int;
  v_remaining_days int;
  v_base_burn numeric;
  v_dynamic_burn numeric;
  v_safety_floor numeric;
  v_daily_burn numeric;
  v_days_until_runout int;
  v_runout_date date;
  v_follow_up_date date;
  v_lead_time int;
  v_floor_percent int;
begin
  -- Get current month target for store
  select * into v_target
  from store_targets
  where store_id = p_store_id
    and month = extract(month from p_as_of_date)
    and year = extract(year from p_as_of_date)
    and status = 'active'
  limit 1;

  if v_target is null then
    return; -- No active target for this store
  end if;

  -- Get total sales this month (from recorded sales)
  select coalesce(sum(total_amount), 0) into v_total_sales
  from sales
  where store_id = p_store_id
    and extract(month from created_at) = extract(month from p_as_of_date)
    and extract(year from created_at) = extract(year from p_as_of_date)
    and status != 'cancelled';

  -- Get most recent non-cancelled sale
  select created_at, total_amount into v_last_sale
  from sales
  where store_id = p_store_id
    and status != 'cancelled'
  order by created_at desc
  limit 1;

  if v_last_sale is null then
    return; -- No sales recorded yet
  end if;

  -- Get settings
  select setting_value::int into v_lead_time from business_settings where setting_key = 'follow_up_lead_time_days';
  select setting_value::int into v_floor_percent from business_settings where setting_key = 'burn_rate_safety_floor_percent';
  v_lead_time := coalesce(v_lead_time, 2);
  v_floor_percent := coalesce(v_floor_percent, 50);

  -- Calculate remaining values
  v_remaining_target := greatest(0, v_target.target_amount - v_total_sales);
  v_remaining_days := date_trunc('month', p_as_of_date)::date + interval '1 month' - p_as_of_date;

  -- Calculate burn rates
  v_base_burn := v_target.target_amount::numeric / 30.0;

  if v_remaining_target > 0 and v_remaining_days > 0 then
    v_dynamic_burn := v_remaining_target::numeric / v_remaining_days;
  else
    v_dynamic_burn := 0;
  end if;

  v_safety_floor := v_base_burn * (v_floor_percent::numeric / 100.0);
  v_daily_burn := greatest(v_dynamic_burn, v_safety_floor);

  -- If remaining target is 0, no depletion
  if v_remaining_target <= 0 then
    return;
  end if;

  -- Calculate runout
  v_days_until_runout := ceil(v_last_sale.total_amount::numeric / v_daily_burn);
  v_runout_date := v_last_sale.created_at::date + v_days_until_runout;
  v_follow_up_date := v_runout_date - v_lead_time;

  return query select
    v_last_sale.created_at::date as last_sale_date,
    v_last_sale.total_amount as last_sale_amount,
    v_remaining_target as remaining_target,
    v_remaining_days as remaining_days,
    round(v_daily_burn, 2) as daily_burn,
    v_runout_date as projected_runout,
    v_follow_up_date as follow_up_date;
end;
$$ language plpgsql security definer;

-- Grant execute to authenticated users
grant execute on function get_store_depletion(uuid, date) to authenticated;

-- ==============================================
-- 9. RPC FUNCTION: get_marketer_performance
-- Gets current progress for a marketer
-- ==============================================
create or replace function get_marketer_performance(
  p_user_id uuid,
  p_month int default extract(month from current_date),
  p_year int default extract(year from current_date)
)
returns table (
  target_amount int,
  current_progress int,
  achievement_rate numeric,
  stores_count int,
  follow_ups_pending int,
  follow_ups_completed int
) as $$
declare
  v_target int;
  v_progress int;
  v_stores int;
  v_pending int;
  v_completed int;
begin
  -- Get marketer target
  select mt.target_amount, mt.current_progress
  into v_target, v_progress
  from marketer_targets mt
  where mt.user_id = p_user_id
    and mt.month = p_month
    and mt.year = p_year
    and mt.status = 'active'
  limit 1;

  -- Count assigned stores (simplified - you may want to link stores to marketers)
  select count(*) into v_stores
  from stores
  where created_by = p_user_id; -- or assignee

  -- Count follow-ups
  select count(*) into v_pending
  from follow_up_schedule
  where marketer_id = p_user_id
    and status in ('pending', 'snoozed');

  select count(*) into v_completed
  from follow_up_schedule
  where marketer_id = p_user_id
    and status = 'done'
    and extract(month from completed_at) = p_month
    and extract(year from completed_at) = p_year;

  return query select
    coalesce(v_target, 0) as target_amount,
    coalesce(v_progress, 0) as current_progress,
    case
      when v_target > 0 then round(v_progress::numeric / v_target::numeric * 100, 2)
      else 0
    end as achievement_rate,
    coalesce(v_stores, 0) as stores_count,
    coalesce(v_pending, 0) as follow_ups_pending,
    coalesce(v_completed, 0) as follow_ups_completed;
end;
$$ language plpgsql security definer;

grant execute on function get_marketer_performance(uuid, int, int) to authenticated;

-- ==============================================
-- 10. RPC FUNCTION: process_target_change
-- Admin reviews target change request
-- ==============================================
create or replace function process_target_change(
  p_request_id uuid,
  p_new_status text, -- 'approved' or 'rejected'
  p_reviewer_id uuid,
  p_note text default null
)
returns void as $$
declare
  v_request record;
begin
  -- Get the request
  select * into v_request
  from target_change_requests
  where id = p_request_id and status = 'pending';

  if v_request is null then
    raise exception 'Request not found or already processed';
  end if;

  -- Update request
  update target_change_requests
  set status = p_new_status::target_change_status,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = p_note
  where id = p_request_id;

  -- If approved, update the store target
  if p_new_status = 'approved' then
    update store_targets
    set target_amount = v_request.proposed_target,
        updated_at = now()
    where store_id = v_request.store_id
      and month = extract(month from current_date)
      and year = extract(year from current_date);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function process_target_change(uuid, text, uuid, text) to authenticated;

-- ==============================================
-- 11. TRIGGERS FOR AUTOMATIC FOLLOW-UP MANAGEMENT
-- ==============================================

-- Trigger: After a sale is recorded, mark existing follow-ups for that store as cancelled_by_sale
-- and let the daily worker create a new one
create or replace function handle_sale_recorded()
returns trigger as $$
begin
  -- Mark all active follow-ups for this store as cancelled by new sale
  update follow_up_schedule
  set status = 'cancelled_by_sale',
      updated_at = now()
  where store_id = new.store_id
    and status in ('pending', 'snoozed');

  return new;
end;
$$ language plpgsql;

-- Note: This trigger should be attached to the sales table if it exists
-- create trigger trigger_sale_recorded after insert on sales
--   for each row execute function handle_sale_recorded();
-- (Commented out since the sales table may not have this hook yet)
