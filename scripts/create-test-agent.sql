-- ==========================================
-- CREATE TEST AGENT USER
-- ==========================================
-- This script creates a test agent user that can login with phone number
--
-- Usage:
-- 1. Run this SQL in Supabase SQL Editor or via psql
-- 2. Use phone number +919999999999 to login via OTP
--
-- ==========================================

-- Create test agent entry in staff_directory
-- This enables the user to be identified as an agent when logging in via OTP

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

-- Verify the test agent was created
SELECT
    id,
    phone,
    full_name,
    role,
    is_active,
    user_id
FROM public.staff_directory
WHERE phone = '+919999999999';

-- ==========================================
-- ALTERNATIVE: Multiple test agents
-- ==========================================
-- Uncomment below to create multiple test agents with different phone numbers

/*
-- Test Agent 2
INSERT INTO public.staff_directory (phone, full_name, role, is_active)
VALUES ('+919999999998', 'Test Agent Two', 'agent', true)
ON CONFLICT (phone) DO UPDATE SET role = 'agent', is_active = true;

-- Test Manager
INSERT INTO public.staff_directory (phone, full_name, role, is_active)
VALUES ('+919999999997', 'Test Manager', 'manager', true)
ON CONFLICT (phone) DO UPDATE SET role = 'manager', is_active = true;

-- Test Marketer
INSERT INTO public.staff_directory (phone, full_name, role, is_active)
VALUES ('+919999999996', 'Test Marketer', 'marketer', true)
ON CONFLICT (phone) DO UPDATE SET role = 'marketer', is_active = true;

-- Test POS/Operator
INSERT INTO public.staff_directory (phone, full_name, role, is_active)
VALUES ('+919999999995', 'Test Operator', 'operator', true)
ON CONFLICT (phone) DO UPDATE SET role = 'operator', is_active = true;
*/
