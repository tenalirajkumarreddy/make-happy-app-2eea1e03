-- Add crop_data column to promotional_banners for zoom/pan state
ALTER TABLE public.promotional_banners
  ADD COLUMN IF NOT EXISTS crop_data jsonb DEFAULT NULL;

-- Create junction table for banner <-> store_types (many-to-many)
CREATE TABLE IF NOT EXISTS public.banner_store_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES public.promotional_banners(id) ON DELETE CASCADE,
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(banner_id, store_type_id)
);

ALTER TABLE public.banner_store_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage banner_store_types"
  ON public.banner_store_types FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can view banner_store_types"
  ON public.banner_store_types FOR SELECT
  TO authenticated
  USING (true);

-- Migrate existing single store_type_id data to the junction table
INSERT INTO public.banner_store_types (banner_id, store_type_id)
SELECT id, store_type_id FROM public.promotional_banners
WHERE store_type_id IS NOT NULL
ON CONFLICT DO NOTHING;
