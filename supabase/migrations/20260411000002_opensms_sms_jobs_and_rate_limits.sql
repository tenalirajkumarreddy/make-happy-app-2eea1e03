-- OpenSMS SMS job queue + rate limiting tables
--
-- These tables exist in the live database but were missing from migrations.
-- This migration:
-- - Creates the minimal schemas used by the current OpenSMS gateway + Edge Functions
-- - Enables RLS and defines the policies observed in production
-- - Tightens table privileges to reduce abuse (e.g., prevent anon INSERT spam)

BEGIN;

-- =====================================================
-- sms_jobs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sms_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  template_name text,
  template_vars jsonb
);

-- Ensure newer optional columns exist (safe if table already existed)
ALTER TABLE public.sms_jobs ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.sms_jobs ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.sms_jobs ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE public.sms_jobs ADD COLUMN IF NOT EXISTS template_vars jsonb;

ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;

-- Replace policies to match the intended behavior
DROP POLICY IF EXISTS insert_jobs_anon ON public.sms_jobs;
DROP POLICY IF EXISTS insert_jobs_service_role ON public.sms_jobs;
DROP POLICY IF EXISTS select_pending_jobs ON public.sms_jobs;
DROP POLICY IF EXISTS update_job_status ON public.sms_jobs;
DROP POLICY IF EXISTS service_role_insert_jobs ON public.sms_jobs;

-- Gateway reads only active jobs
CREATE POLICY "select_pending_jobs" ON public.sms_jobs
  FOR SELECT
  TO anon
  USING (status = ANY (ARRAY['pending'::text, 'processing'::text]));

-- Gateway can advance job status (includes 'sent' so it can mark delivered)
CREATE POLICY "update_job_status" ON public.sms_jobs
  FOR UPDATE
  TO anon
  USING (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text]))
  WITH CHECK (status = ANY (ARRAY['processing'::text, 'sent'::text, 'delivered'::text, 'failed'::text]));

-- Only backend/service key should create jobs (service_role bypasses RLS, but keep explicit policy for clarity)
CREATE POLICY "service_role_insert_jobs" ON public.sms_jobs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Tighten grants (RLS is not applied to TRUNCATE; avoid giving anon/authenticated broad privileges)
REVOKE ALL ON TABLE public.sms_jobs FROM anon;
REVOKE ALL ON TABLE public.sms_jobs FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.sms_jobs TO anon;

-- =====================================================
-- otp_rate_limits
-- =====================================================
CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  ip_address text,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_phone ON public.otp_rate_limits(phone, requested_at);
CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_ip ON public.otp_rate_limits(ip_address, requested_at);

ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.otp_rate_limits;
CREATE POLICY "service_role_only" ON public.otp_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.otp_rate_limits FROM anon;
REVOKE ALL ON TABLE public.otp_rate_limits FROM authenticated;

COMMIT;
