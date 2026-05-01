-- ==========================================
-- CREATE TEST AGENT USER - FINAL VERSION
-- Run this in Supabase SQL Editor
-- Project: vrhptrtgrpftycvojaqo
-- ==========================================

-- Create test agent entry in staff_directory
-- This enables the user to login as an agent with OTP

INSERT INTO public.staff_directory (
    phone,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
)
VALUES (
    '+919999999999',
    'Test Agent',
    'agent',
    true,
    now(),
    now()
)
ON CONFLICT (phone) DO UPDATE
SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now();

-- Verify creation
SELECT
    id,
    phone,
    full_name,
    role,
    is_active,
    user_id,
    created_at
FROM public.staff_directory
WHERE phone = '+919999999999';
