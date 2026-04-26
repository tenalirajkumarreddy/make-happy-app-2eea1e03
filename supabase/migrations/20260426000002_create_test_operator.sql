-- Migration: Create test operator account
-- Date: 2026-04-26
-- Purpose: Create test account for operator role testing

DO $$
DECLARE
    new_user_id UUID := gen_random_uuid();
    warehouse_id UUID := '67f904b6-94f8-4fe8-a585-4774c6b2142c';
    test_phone TEXT := '+919999999999';
    test_email TEXT := 'phone_919999999999@phone.aquaprime.app';
    existing_user_id UUID;
BEGIN
    -- Check if user already exists
    SELECT id INTO existing_user_id
    FROM auth.users
    WHERE email = test_email OR phone = test_phone;
    
    IF existing_user_id IS NOT NULL THEN
        RAISE NOTICE 'Test operator already exists with ID: %', existing_user_id;
        
        -- Ensure they have the operator role
        UPDATE user_roles 
        SET role = 'operator', warehouse_id = warehouse_id
        WHERE user_id = existing_user_id;
        
        IF NOT FOUND THEN
            INSERT INTO user_roles (user_id, role, warehouse_id, created_at)
            VALUES (existing_user_id, 'operator', warehouse_id, now());
        END IF;
        
        -- Update profile
        UPDATE profiles
        SET full_name = 'Test Operator', is_active = true
        WHERE user_id = existing_user_id;
        
        RAISE NOTICE 'Updated existing user to operator role';
    ELSE
        -- Create new auth user
        INSERT INTO auth.users (
            id,
            email,
            phone,
            email_confirmed_at,
            phone_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            new_user_id,
            test_email,
            test_phone,
            now(),
            now(),
            '{"provider": "phone", "providers": ["phone"]}',
            '{"full_name": "Test Operator"}',
            now(),
            now()
        );
        
        -- Create profile
        INSERT INTO profiles (
            user_id,
            full_name,
            phone,
            email,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            new_user_id,
            'Test Operator',
            test_phone,
            test_email,
            true,
            now(),
            now()
        );
        
        -- Assign operator role
        INSERT INTO user_roles (
            user_id,
            role,
            warehouse_id,
            created_at
        ) VALUES (
            new_user_id,
            'operator',
            warehouse_id,
            now()
        );
        
        RAISE NOTICE 'Created new test operator with ID: %', new_user_id;
    END IF;
END $$;

-- Add to staff_directory for completeness
INSERT INTO staff_directory (
    user_id,
    full_name,
    phone,
    email,
    role,
    is_active,
    created_at,
    updated_at
)
SELECT 
    ur.user_id,
    p.full_name,
    p.phone,
    p.email,
    ur.role,
    true,
    now(),
    now()
FROM user_roles ur
JOIN profiles p ON ur.user_id = p.user_id
WHERE ur.role = 'operator'
  AND p.phone = '+919999999999'
  AND NOT EXISTS (
      SELECT 1 FROM staff_directory sd WHERE sd.user_id = ur.user_id
  )
ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now();

-- Migration metadata
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260426000002', 'create_test_operator', now());
