-- Migration: Fix schema discrepancies for stock validation
-- Date: 2026-05-05

-- 1. Create user_roles if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL DEFAULT 'customer',
    warehouse_id UUID REFERENCES public.warehouses(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role, warehouse_id)
);

-- 2. Ensure profiles has expected columns for AuthContext
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Sync profiles.user_id with profiles.id (since id was likely the user_id)
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- 3. Rename agent_stock to staff_stock and add missing columns
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'agent_stock' AND table_schema = 'public') THEN
        ALTER TABLE public.agent_stock RENAME TO staff_stock;
    END IF;
END $$;

-- Ensure staff_stock exists (if agent_stock didn't exist)
CREATE TABLE IF NOT EXISTS public.staff_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL DEFAULT 0,
    last_sale_at TIMESTAMPTZ,
    is_negative BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, product_id, warehouse_id)
);

-- Add columns if they are missing (in case renaming happened but columns were missing)
ALTER TABLE public.staff_stock ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ;
ALTER TABLE public.staff_stock ADD COLUMN IF NOT EXISTS is_negative BOOLEAN DEFAULT false;

-- 4. Re-populate user_roles from profiles for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
ON CONFLICT (user_id, role, warehouse_id) DO NOTHING;

-- 5. Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_stock ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (allow authenticated access for now, can be hardened later)
DROP POLICY IF EXISTS "Authenticated users can read user_roles" ON public.user_roles;
CREATE POLICY "Authenticated users can read user_roles" ON public.user_roles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read staff_stock" ON public.staff_stock;
CREATE POLICY "Authenticated users can read staff_stock" ON public.staff_stock
    FOR SELECT TO authenticated USING (true);
