-- Harden OpenSMS OTP sessions security
--
-- The initial OpenSMS migration granted anon full access to otp_sessions.
-- That makes OTP codes readable/modifiable by any client with the public key.
--
-- This migration removes the anon policy and revokes direct table privileges
-- from anon/authenticated. Edge Functions (service_role) continue to work.

BEGIN;

-- Remove the overly-permissive policy
DROP POLICY IF EXISTS "Anonymous users can manage OTP sessions" ON public.otp_sessions;

-- Ensure RLS remains enabled
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

-- Allow only service_role to access rows via PostgREST if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'otp_sessions'
      AND policyname = 'Service role can manage OTP sessions'
  ) THEN
    CREATE POLICY "Service role can manage OTP sessions"
      ON public.otp_sessions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Revoke any direct access from client-facing roles (defense in depth)
REVOKE ALL ON TABLE public.otp_sessions FROM anon;
REVOKE ALL ON TABLE public.otp_sessions FROM authenticated;

COMMIT;
