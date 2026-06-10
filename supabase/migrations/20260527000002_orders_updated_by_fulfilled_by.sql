-- Add updated_by column (nullable, FK to auth.users)
ALTER TABLE public.orders
  ADD COLUMN updated_by uuid REFERENCES auth.users(id);

-- Add fulfilled_by column (nullable, FK to auth.users)
ALTER TABLE public.orders
  ADD COLUMN fulfilled_by uuid REFERENCES auth.users(id);
