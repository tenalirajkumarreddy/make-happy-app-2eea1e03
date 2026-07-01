-- Fix store_pricing RLS - the previous policy used an EXISTS subquery on
-- user_permissions, but that table only stores OVERRIDES not defaults.
-- Most users (managers, super_admins) don't have rows there, so the subquery
-- always returned false and insert was blocked with 403.

-- Drop the broken ALL policy
DROP POLICY IF EXISTS "Users with set_store_pricing can manage store pricing" ON public.store_pricing;

-- Drop the old select-only policy too
DROP POLICY IF EXISTS "store_pricing_select" ON public.store_pricing;

-- Create unified policies that hardcode the roles that have set_store_pricing
-- by default (matches ROLE_DEFAULTS in the app).  The frontend permission
-- check (usePermission/set_store_pricing) already guards who sees the UI.
-- Note: if you add custom user-level overrides via Access Control, those users 
--   will need to be one of the roles below OR you must update this migration.

CREATE POLICY "store_pricing_crud" ON public.store_pricing
    FOR ALL
    TO authenticated
    USING (
        -- Roles that hold set_store_pricing by default (see ROLE_DEFAULTS)
        has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        -- Also allow agent / marketer / operator / pos — they create stores 
        -- and the frontend already controls who sees the pricing UI.
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'marketer'::app_role)
        OR has_role(auth.uid(), 'operator'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role)
    )
    WITH CHECK (
        -- Same set of roles for INSERT / UPDATE
        has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'agent'::app_role)
        OR has_role(auth.uid(), 'marketer'::app_role)
        OR has_role(auth.uid(), 'operator'::app_role)
        OR has_role(auth.uid(), 'pos'::app_role)
    );
