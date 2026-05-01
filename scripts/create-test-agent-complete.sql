-- ==========================================
-- CREATE TEST AGENT USER - COMPLETE SETUP
-- Run this in Supabase SQL Editor
-- ==========================================

-- Configuration: Change these values as needed
DO $$
DECLARE
    test_phone TEXT := '+919999999999';
    test_full_name TEXT := 'Test Agent';
    test_role TEXT := 'agent'; -- Options: super_admin, manager, agent, marketer, operator, customer
    test_email TEXT := NULL; -- Set to an email if you want email-based auth too
BEGIN
    -- Step 1: Check if staff_directory entry exists
    DECLARE
        existing_staff_id UUID;
        existing_user_id UUID;
    BEGIN
        SELECT id, user_id INTO existing_staff_id, existing_user_id
        FROM public.staff_directory
        WHERE phone = test_phone;

        IF existing_staff_id IS NOT NULL THEN
            RAISE NOTICE 'Staff directory entry exists (ID: %), updating...', existing_staff_id;

            -- Update the staff entry
            UPDATE public.staff_directory
            SET
                full_name = test_full_name,
                role = test_role,
                is_active = true,
                updated_at = now()
            WHERE id = existing_staff_id;

            -- If user_id exists, update user_roles
            IF existing_user_id IS NOT NULL THEN
                RAISE NOTICE 'User already linked (User ID: %), updating role...', existing_user_id;

                -- Update or insert user_roles
                INSERT INTO public.user_roles (user_id, role)
                VALUES (existing_user_id, test_role::public.app_role)
                ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

                -- Update profile
                UPDATE public.profiles
                SET
                    full_name = test_full_name,
                    is_active = true,
                    phone = test_phone
                WHERE user_id = existing_user_id;
            ELSE
                RAISE NOTICE 'No auth user linked yet. User will be linked on first OTP login.';
            END IF;
        ELSE
            -- Create new staff directory entry
            RAISE NOTICE 'Creating new staff directory entry...';

            INSERT INTO public.staff_directory (
                phone,
                full_name,
                role,
                is_active,
                email,
                user_id,
                created_at,
                updated_at
            ) VALUES (
                test_phone,
                test_full_name,
                test_role,
                true,
                test_email,
                NULL, -- Will be linked on first login
                now(),
                now()
            );

            RAISE NOTICE 'Staff directory entry created for phone: %', test_phone;
        END IF;
    END;

    -- Step 2: Log the result
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST AGENT SETUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Phone: %', test_phone;
    RAISE NOTICE 'Name: %', test_full_name;
    RAISE NOTICE 'Role: %', test_role;
    RAISE NOTICE '';
    RAISE NOTICE 'To login:';
    RAISE NOTICE '1. Open the app';
    RAISE NOTICE '2. Enter phone: %', test_phone;
    RAISE NOTICE '3. Request OTP';
    RAISE NOTICE '4. Enter OTP: 000000 (universal test OTP)';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- Verification query
SELECT
    sd.id AS staff_id,
    sd.phone,
    sd.full_name,
    sd.role,
    sd.is_active,
    sd.user_id,
    ur.role AS assigned_role,
    p.full_name AS profile_name,
    p.is_active AS profile_active
FROM public.staff_directory sd
LEFT JOIN public.user_roles ur ON sd.user_id = ur.user_id
LEFT JOIN public.profiles p ON sd.user_id = p.user_id
WHERE sd.phone = '+919999999999';
