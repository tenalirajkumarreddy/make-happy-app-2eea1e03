
-- Create public storage bucket for entity photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-photos', 'entity-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to entity-photos bucket
CREATE POLICY "Authenticated can upload entity photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'entity-photos');

-- Allow anyone to view entity photos (public bucket)
CREATE POLICY "Anyone can view entity photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'entity-photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated can update entity photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'entity-photos');

-- Allow authenticated users to delete entity photos
CREATE POLICY "Authenticated can delete entity photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'entity-photos');

-- Add address fields to stores table for structured address
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS street text,
ADD COLUMN IF NOT EXISTS area text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS district text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS pincode text;
