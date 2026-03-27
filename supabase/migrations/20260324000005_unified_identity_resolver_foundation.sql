-- Unified identity resolver foundation
-- 1) Add profile state fields for canonical onboarding/auth state
-- 2) Prevent staff accounts from being linked as customers
-- 3) Add helper to detect synthetic phone emails

alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists google_linked boolean not null default false,
  add column if not exists onboarding_complete boolean not null default false,
  add column if not exists display_name text;

create or replace function public.is_synthetic_phone_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_email ~* '^phone_\d+@phone\.aquaprime\.app$', false);
$$;

create or replace function public.prevent_staff_customer_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  if new.user_id is null then
    return new;
  end if;

  select role into v_role
  from public.user_roles
  where user_id = new.user_id
  limit 1;

  if v_role is not null and v_role <> 'customer' then
    raise exception 'Cannot link staff account % to customers table', new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_staff_customer_link on public.customers;
create trigger trg_prevent_staff_customer_link
before insert or update of user_id on public.customers
for each row
execute function public.prevent_staff_customer_link();
