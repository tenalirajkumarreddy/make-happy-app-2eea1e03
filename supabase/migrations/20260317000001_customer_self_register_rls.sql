-- =====================================================================
-- CUSTOMER SELF-REGISTRATION RLS POLICIES
-- Allows phone-OTP-authenticated customers to:
--   1. Insert their own customer record (user_id must equal auth.uid())
--   2. Insert their own stores (customer_id must belong to them)
-- =====================================================================

-- 1. Allow a customer to create their own profile record.
--    The WITH CHECK enforces user_id = caller's auth UID.
CREATE POLICY "Customers can register own profile" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. Allow a customer to add stores linked to their own customer record.
--    Verifies the given customer_id is owned by the calling user.
CREATE POLICY "Customers can insert own stores" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND user_id = auth.uid()
    )
  );
