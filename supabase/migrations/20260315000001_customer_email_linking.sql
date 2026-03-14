-- =====================================================================
-- CUSTOMER EMAIL AUTO-LINKING
-- Fixes the case where a customer record was created with an email AFTER
-- the auth user already signed up (trigger did not fire at signup time).
-- =====================================================================

-- 1. Trigger function: auto-link auth user whenever email is set on customers
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_auth_user_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Only act when email is provided but user_id is not yet set
  IF NEW.email IS NOT NULL AND (NEW.user_id IS NULL OR NEW.user_id != (
      SELECT id FROM auth.users WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1
  )) THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(NEW.email)
    LIMIT 1;

    IF v_user_id IS NOT NULL AND NEW.user_id IS NULL THEN
      NEW.user_id := v_user_id;
      -- Ensure the customer role is assigned
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'customer')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to customers table
-- -----------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_customer_email_set ON public.customers;
CREATE TRIGGER on_customer_email_set
  BEFORE INSERT OR UPDATE OF email
  ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_customer();

-- 3. Backfill: link existing customer records that have email but no user_id
-- -----------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS customer_id, u.id AS auth_user_id
    FROM public.customers c
    JOIN auth.users u ON LOWER(u.email) = LOWER(c.email)
    WHERE c.user_id IS NULL
      AND c.email IS NOT NULL
  LOOP
    UPDATE public.customers SET user_id = r.auth_user_id WHERE id = r.customer_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.auth_user_id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

-- 4. RLS policy: allow a customer to read their own profile by email
--    (safety-net while user_id is in transition, or for the brief window
--     right after sign-up before the trigger has run)
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can view own profile by email" ON public.customers;
CREATE POLICY "Customers can view own profile by email" ON public.customers
  FOR SELECT TO authenticated USING (
    email IS NOT NULL
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- 5. RPC callable by the client as a manual-linking fallback
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_customer_by_email()
RETURNS TABLE (linked boolean, customer_name text, customer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_cust_id  uuid;
  v_cust_name text;
BEGIN
  -- Get caller email from auth
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, null::text, null::uuid;
    RETURN;
  END IF;

  -- Already linked?
  SELECT id, name INTO v_cust_id, v_cust_name
  FROM public.customers WHERE user_id = v_user_id LIMIT 1;

  IF v_cust_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer') ON CONFLICT (user_id, role) DO NOTHING;
    RETURN QUERY SELECT true, v_cust_name, v_cust_id;
    RETURN;
  END IF;

  -- Try linking by email
  SELECT id, name INTO v_cust_id, v_cust_name
  FROM public.customers
  WHERE LOWER(email) = LOWER(v_email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_cust_id IS NOT NULL THEN
    UPDATE public.customers SET user_id = v_user_id WHERE id = v_cust_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer') ON CONFLICT (user_id, role) DO NOTHING;
    RETURN QUERY SELECT true, v_cust_name, v_cust_id;
  ELSE
    RETURN QUERY SELECT false, null::text, null::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_customer_by_email() TO authenticated;
