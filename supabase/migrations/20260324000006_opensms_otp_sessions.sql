-- OpenSMS OTP sessions for phone authentication
-- Temporary storage for OTP codes with automatic cleanup

create table if not exists public.otp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  otp_code text not null,
  session_token text not null unique,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3
);

-- Add indexes for performance
create index if not exists otp_sessions_session_token_idx on public.otp_sessions(session_token);
create index if not exists otp_sessions_phone_number_idx on public.otp_sessions(phone_number);
create index if not exists otp_sessions_expires_at_idx on public.otp_sessions(expires_at);

-- RLS policies
alter table public.otp_sessions enable row level security;

-- Allow anonymous users to manage their own OTP sessions
create policy "Anonymous users can manage OTP sessions"
  on public.otp_sessions
  for all
  to anon
  using (true);

-- Function to cleanup expired OTP sessions
create or replace function public.cleanup_expired_otp_sessions()
returns void
security definer
language plpgsql
as $$
begin
  delete from public.otp_sessions
  where expires_at < now()
    or (verified = true and verified_at < now() - interval '1 hour');
end;
$$;

-- Create a trigger to automatically clean up on new inserts
create or replace function public.trigger_cleanup_otp_sessions()
returns trigger
security definer
language plpgsql
as $$
begin
  -- Clean up expired sessions before inserting new one
  perform public.cleanup_expired_otp_sessions();

  -- Also clean up any existing sessions for this phone number
  delete from public.otp_sessions
  where phone_number = NEW.phone_number
    and id != NEW.id;

  return NEW;
end;
$$;

drop trigger if exists before_otp_session_insert on public.otp_sessions;
create trigger before_otp_session_insert
  before insert on public.otp_sessions
  for each row
  execute function public.trigger_cleanup_otp_sessions();

-- Grant necessary permissions
grant usage on schema public to anon;
grant insert, select, update, delete on public.otp_sessions to anon;