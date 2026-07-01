-- Fix store_pricing RLS to allow roles with set_store_pricing permission
-- Also fixes the 403 Forbidden when saving custom prices during store creation

-- First, drop the old overly restrictive policy
DROP POLICY IF EXISTS "Admin can manage store pricing" ON public.store_pricing;

-- Create a more permissive policy that checks for set_store_pricing permission
-- This aligns RLS with the application's permission system
CREATE POLICY "Users with set_store_pricing can manage store pricing"
    ON public.store_pricing
    FOR ALL
    TO authenticated
    USING (
        -- Admin roles always have access
        has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        -- Check custom permission in user_permissions table
        OR EXISTS (
            SELECT 1 FROM public.user_permissions
            WHERE user_id = auth.uid()
                AND permission = 'set_store_pricing'
                AND enabled = true
                AND deleted_at IS NULL
        )
    )
    WITH CHECK (
        -- Same logic for insert/update
        has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR EXISTS (
            SELECT 1 FROM public.user_permissions
            WHERE user_id = auth.uid()
                AND permission = 'set_store_pricing'
                AND enabled = true
                AND deleted_at IS NULL
        )
    );
