-- Add warehouse_id to staff tables
ALTER TABLE public.staff_directory ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_directory_warehouse ON public.staff_directory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_warehouse ON public.staff_invitations(warehouse_id);

-- Update edge functions / RPCs if needed.
-- But first, update the UI to supply it.