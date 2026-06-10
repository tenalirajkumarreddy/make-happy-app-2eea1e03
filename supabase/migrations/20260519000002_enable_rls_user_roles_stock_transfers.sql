-- Enable RLS now that has_role() is SECURITY DEFINER (prevents recursion)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- Verify existing policies cover the needs
-- user_roles already has: Admins can delete, Admins can insert, Admins can update, user_roles_select
-- stock_transfers already has: manager_view, staff_insert, staff_view_all, staff_view_own, super_admin_all

-- Add a safety policy for stock_transfers UPDATE if missing
DROP POLICY IF EXISTS "staff_update_stock_transfers" ON public.stock_transfers;
CREATE POLICY "staff_update_stock_transfers" ON public.stock_transfers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'manager'::app_role])
    )
  );

-- Add a safety policy for user_roles so users can always read their own role
DROP POLICY IF EXISTS "users_read_own_role" ON public.user_roles;
CREATE POLICY "users_read_own_role" ON public.user_roles
  FOR SELECT
  USING (user_id = auth.uid());
