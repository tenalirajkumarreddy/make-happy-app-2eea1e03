-- Migration: Add receipt_url to handovers

ALTER TABLE public.handovers ADD COLUMN IF NOT EXISTS receipt_url text;
