-- Canonical auth identity resolver for deterministic role + onboarding routing.
-- Returns one row per user_id with role and onboarding decision.

create or replace function public.resolve_user_identity(p_user_id uuid)
returns table (
  role text,
  is_staff boolean,
  has_customer boolean,
  onboarding_required boolean,
  redirect_target text,
  reason_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_has_customer boolean;
  v_profile_is_active boolean;
begin
  select ur.role
    into v_role
  from public.user_roles ur
  where ur.user_id = p_user_id
  limit 1;

  v_role := coalesce(v_role, 'customer');

  select exists(
    select 1
    from public.customers c
    where c.user_id = p_user_id
      and c.deleted_at is null
  ) into v_has_customer;

  select p.is_active
    into v_profile_is_active
  from public.profiles p
  where p.user_id = p_user_id
  limit 1;

  if coalesce(v_profile_is_active, true) = false then
    return query
    select
      v_role,
      (v_role <> 'customer'),
      v_has_customer,
      false,
      '/auth',
      'profile_inactive';
    return;
  end if;

  if v_role <> 'customer' then
    return query
    select
      v_role,
      true,
      v_has_customer,
      false,
      '/',
      'staff_role';
    return;
  end if;

  if v_has_customer then
    return query
    select
      'customer'::text,
      false,
      true,
      false,
      '/',
      'existing_customer';
    return;
  end if;

  return query
  select
    'customer'::text,
    false,
    false,
    true,
    '/onboarding',
    'missing_customer_record';
end;
$$;

revoke all on function public.resolve_user_identity(uuid) from public;
grant execute on function public.resolve_user_identity(uuid) to authenticated;
grant execute on function public.resolve_user_identity(uuid) to service_role;
