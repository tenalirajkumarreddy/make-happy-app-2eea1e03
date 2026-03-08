
-- Add credit limit columns to store_types
ALTER TABLE public.store_types
  ADD COLUMN IF NOT EXISTS credit_limit_kyc numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit_no_kyc numeric NOT NULL DEFAULT 0;

-- Add credit limit override to customers (nullable = use store type default)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit_override numeric DEFAULT NULL;
