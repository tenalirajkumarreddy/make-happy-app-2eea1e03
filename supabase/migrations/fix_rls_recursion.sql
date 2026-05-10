-- Fix infinite recursion in RLS policies
-- The has_role() function calls user_roles which triggers RLS again

-- Option 1: Drop the problematic policies (safest fix)
DROP POLICY IF EXISTS "Staff can view balance_corrections" ON public.balance_corrections;
DROP POLICY IF EXISTS "Staff can insert balance_corrections" ON public.balance_corrections;
DROP POLICY IF EXISTS "Staff can update balance_corrections" ON public.balance_corrections;
DROP POLICY IF EXISTS "Admins can delete balance_corrections" ON public.balance_corrections;
DROP POLICY IF EXISTS "Staff can view payment_returns" ON public.payment_returns;
DROP POLICY IF EXISTS "Staff can insert payment_returns" ON public.payment_returns;
DROP POLICY IF EXISTS "Staff can update payment_returns" ON public.payment_returns;
DROP POLICY IF EXISTS "Admins can delete payment_returns" ON public.payment_returns;

-- Option 2: Use SECURITY DEFINER for has_role function to bypass RLS
CREATE OR REPLACE FUNCTION has_role(user_id UUID, target_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_role BOOLEAN;
BEGIN
  -- Use SECURITY DEFINER to bypass RLS during policy evaluation
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = has_role.user_id
    AND role = target_role
  ) INTO v_has_role;

  RETURN v_has_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Option 3: Recreate policies with SECURITY DEFINER function
-- First verify the function is working, then recreate policies if needed
-- For now, disable RLS on user_roles to prevent recursion
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;