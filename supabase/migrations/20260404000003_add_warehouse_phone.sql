-- Add optional phone field to warehouses for dispatch details on invoices

ALTER TABLE public.warehouses
ADD COLUMN IF NOT EXISTS phone TEXT;
