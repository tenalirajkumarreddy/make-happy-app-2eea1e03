
-- Add KYC document columns to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS kyc_selfie_url text,
  ADD COLUMN IF NOT EXISTS kyc_aadhar_front_url text,
  ADD COLUMN IF NOT EXISTS kyc_aadhar_back_url text,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_by uuid REFERENCES auth.users(id);
