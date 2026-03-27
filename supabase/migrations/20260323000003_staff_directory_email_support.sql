-- Add direct email support to staff_directory for Google OAuth validation

alter table public.staff_directory
  add column if not exists email text;

-- Email-only staff should be allowed (for Google-only login)
alter table public.staff_directory
  alter column phone drop not null;

-- Keep email normalized and unique when present
create unique index if not exists staff_directory_email_unique_idx
  on public.staff_directory (lower(email))
  where email is not null;

-- Optional hygiene: prevent empty email strings
alter table public.staff_directory
  add constraint staff_directory_email_not_empty
  check (email is null or length(trim(email)) > 0);
