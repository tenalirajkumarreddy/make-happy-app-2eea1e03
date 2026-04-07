-- Fix KYC storage bucket policies - replace weak public policies with authenticated + folder-based access
-- This migration addresses CRITICAL security issue: kyc-documents policies using {public} role instead of {authenticated}

-- Drop existing weak policies
DROP POLICY IF EXISTS "Customers update own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Customers view own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Staff view KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload own KYC docs" ON storage.objects;

-- Recreate policies with proper role restrictions and folder-based access control

-- Policy 1: Customers can INSERT their own KYC documents (folder must match their user_id)
CREATE POLICY "Customers can upload own KYC docs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Policy 2: Customers can UPDATE their own KYC documents
CREATE POLICY "Customers can update own KYC docs"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Policy 3: Customers can SELECT (view) their own KYC documents
CREATE POLICY "Customers can view own KYC docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Policy 4: Staff (super_admin, manager) can view ALL KYC documents
CREATE POLICY "Staff can view all KYC docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

-- Policy 5: Staff can DELETE KYC documents (for GDPR compliance / data cleanup)
CREATE POLICY "Staff can delete KYC docs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  );

-- Add comment explaining the security model
COMMENT ON POLICY "Customers can upload own KYC docs" ON storage.objects IS
  'Customers can only upload to folders matching their user_id (e.g., kyc-documents/{user_id}/file.pdf)';

COMMENT ON POLICY "Staff can view all KYC docs" ON storage.objects IS
  'Admins and managers can view all KYC documents; customers can only view their own folder';
