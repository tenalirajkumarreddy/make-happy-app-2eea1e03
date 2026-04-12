-- Add optional metadata columns to staff_invitations to match app usage.
-- Safe for existing projects: all additions are IF NOT EXISTS.

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_invitations_user_id_idx
  ON public.staff_invitations (user_id);
