-- Remove email-based customer auto-linking and fallback access.
-- Customer resolution must rely on explicit user_id linkage only.

-- 1) Remove customer-table email auto-link trigger/function
DROP TRIGGER IF EXISTS on_customer_email_set ON public.customers;
DROP FUNCTION IF EXISTS public.link_auth_user_to_customer();

-- 2) Remove email-based customer fallback RPC
REVOKE EXECUTE ON FUNCTION public.link_customer_by_email() FROM authenticated;
DROP FUNCTION IF EXISTS public.link_customer_by_email();

-- 3) Remove email-based customer RLS safety-net
DROP POLICY IF EXISTS "Customers can view own profile by email" ON public.customers;

-- 4) Remove legacy email auto-linking on auth signup trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$function$;
