-- Migration: Fix sale_returns_status_check constraint to permit 'completed'
-- Date: 2026-05-30

ALTER TABLE public.sale_returns DROP CONSTRAINT IF EXISTS sale_returns_status_check;
ALTER TABLE public.sale_returns ADD CONSTRAINT sale_returns_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'processed'::text, 'completed'::text]));
