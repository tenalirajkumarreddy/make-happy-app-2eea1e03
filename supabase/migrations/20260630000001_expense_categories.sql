-- Create expense_categories table if missing and insert defaults

CREATE TABLE IF NOT EXISTS public.expense_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    color text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for reading
DROP POLICY IF EXISTS "Allow authed users to read expense_categories" ON public.expense_categories;
CREATE POLICY "Allow authed users to read expense_categories"
ON public.expense_categories
FOR SELECT TO authenticated USING (true);

-- Add RLS policy for insert (super admin/manager)
DROP POLICY IF EXISTS "Allow admins to insert expense_categories" ON public.expense_categories;
CREATE POLICY "Allow admins to insert expense_categories"
ON public.expense_categories
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND (role = 'super_admin' OR role = 'manager')
    )
);

-- Insert default categories
INSERT INTO public.expense_categories (name, color)
VALUES 
    ('Fuel', '#f59e0b'), -- amber
    ('Food', '#10b981'), -- emerald
    ('Maintenance', '#ef4444'), -- red
    ('Lodging', '#3b82f6'), -- blue
    ('Toll', '#8b5cf6'), -- violet
    ('Other', '#64748b') -- slate
ON CONFLICT (name) DO NOTHING;
