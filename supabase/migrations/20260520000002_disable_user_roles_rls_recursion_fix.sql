-- Disable RLS on user_roles to prevent infinite recursion
-- has_role() is already SECURITY DEFINER and provides the security layer
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
