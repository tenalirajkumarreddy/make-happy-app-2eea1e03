-- Add phone support to staff_invitations so phone OTP login
-- can resolve invited staff even before full account linking.

alter table public.staff_invitations
  add column if not exists phone text;

create index if not exists staff_invitations_phone_key_idx
  on public.staff_invitations (right(regexp_replace(phone, '\D', '', 'g'), 10))
  where phone is not null;

alter table public.staff_invitations
  add constraint staff_invitations_phone_not_empty
  check (phone is null or length(trim(phone)) > 0);
