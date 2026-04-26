-- ============================================================
-- SEED TEST USERS FOR MULTI-ROLE BROWSER TESTING
-- Run this in Supabase SQL Editor to create test users for all roles
-- ============================================================

-- First, ensure we have the helper function
CREATE OR REPLACE FUNCTION find_staff_by_phone(p_phone_digits text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  role text,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT sd.id, sd.user_id, sd.full_name, sd.email, sd.phone, sd.role::text, sd.is_active
  FROM staff_directory sd
  WHERE sd.phone = p_phone_digits
     OR sd.phone = '+' || p_phone_digits
     OR REPLACE(sd.phone, '+', '') = REPLACE(p_phone_digits, '+', '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TEST USER 1: SUPER ADMIN (already exists, but ensure role)
-- Phone: +916305295757
-- ============================================================
-- This user should already exist from RESET_DATABASE_SINGLE_ADMIN.sql
-- If not, run that script first.

-- ============================================================
-- TEST USER 2: MANAGER
-- Phone: +911111111111
-- ============================================================
DO $$
DECLARE
  manager_uid uuid;
  synthetic_email text := 'phone_911111111111@phone.aquaprime.app';
BEGIN
  -- Create auth user if not exists
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    synthetic_email, crypt('TestPass123!', gen_salt('bf')), now(), '+911111111111', now(),
    '{"provider":"phone","providers":["phone"]}',
    '{"full_name":"Test Manager","phone_verified":true}', now(), now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO manager_uid;

  IF manager_uid IS NULL THEN
    SELECT id INTO manager_uid FROM auth.users WHERE email = synthetic_email;
  END IF;

  -- Set role
  DELETE FROM user_roles WHERE user_id = manager_uid;
  INSERT INTO user_roles (user_id, role) VALUES (manager_uid, 'manager');

  -- Create staff directory entry
  INSERT INTO staff_directory (user_id, full_name, email, phone, role, is_active)
  VALUES (manager_uid, 'Test Manager', 'test-manager@aquaprime.app', '+911111111111', 'manager', true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Manager',
    role = 'manager',
    is_active = true;

  -- Create profile
  INSERT INTO profiles (user_id, full_name, email, phone, is_active, phone_verified, onboarding_complete)
  VALUES (manager_uid, 'Test Manager', 'test-manager@aquaprime.app', '+911111111111', true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Manager',
    is_active = true;

  RAISE NOTICE '✅ Manager user created/updated: %', manager_uid;
END $$;

-- ============================================================
-- TEST USER 3: AGENT
-- Phone: +912222222222
-- ============================================================
DO $$
DECLARE
  agent_uid uuid;
  synthetic_email text := 'phone_912222222222@phone.aquaprime.app';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    synthetic_email, crypt('TestPass123!', gen_salt('bf')), now(), '+912222222222', now(),
    '{"provider":"phone","providers":["phone"]}',
    '{"full_name":"Test Agent","phone_verified":true}', now(), now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO agent_uid;

  IF agent_uid IS NULL THEN
    SELECT id INTO agent_uid FROM auth.users WHERE email = synthetic_email;
  END IF;

  DELETE FROM user_roles WHERE user_id = agent_uid;
  INSERT INTO user_roles (user_id, role) VALUES (agent_uid, 'agent');

  INSERT INTO staff_directory (user_id, full_name, email, phone, role, is_active)
  VALUES (agent_uid, 'Test Agent', 'test-agent@aquaprime.app', '+912222222222', 'agent', true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Agent',
    role = 'agent',
    is_active = true;

  INSERT INTO profiles (user_id, full_name, email, phone, is_active, phone_verified, onboarding_complete)
  VALUES (agent_uid, 'Test Agent', 'test-agent@aquaprime.app', '+912222222222', true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Agent',
    is_active = true;

  RAISE NOTICE '✅ Agent user created/updated: %', agent_uid;
END $$;

-- ============================================================
-- TEST USER 4: MARKETER
-- Phone: +913333333333
-- ============================================================
DO $$
DECLARE
  marketer_uid uuid;
  synthetic_email text := 'phone_913333333333@phone.aquaprime.app';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    synthetic_email, crypt('TestPass123!', gen_salt('bf')), now(), '+913333333333', now(),
    '{"provider":"phone","providers":["phone"]}',
    '{"full_name":"Test Marketer","phone_verified":true}', now(), now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO marketer_uid;

  IF marketer_uid IS NULL THEN
    SELECT id INTO marketer_uid FROM auth.users WHERE email = synthetic_email;
  END IF;

  DELETE FROM user_roles WHERE user_id = marketer_uid;
  INSERT INTO user_roles (user_id, role) VALUES (marketer_uid, 'marketer');

  INSERT INTO staff_directory (user_id, full_name, email, phone, role, is_active)
  VALUES (marketer_uid, 'Test Marketer', 'test-marketer@aquaprime.app', '+913333333333', 'marketer', true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Marketer',
    role = 'marketer',
    is_active = true;

  INSERT INTO profiles (user_id, full_name, email, phone, is_active, phone_verified, onboarding_complete)
  VALUES (marketer_uid, 'Test Marketer', 'test-marketer@aquaprime.app', '+913333333333', true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Marketer',
    is_active = true;

  RAISE NOTICE '✅ Marketer user created/updated: %', marketer_uid;
END $$;

-- ============================================================
-- TEST USER 5: POS
-- Phone: +914444444444
-- ============================================================
DO $$
DECLARE
  pos_uid uuid;
  synthetic_email text := 'phone_914444444444@phone.aquaprime.app';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    synthetic_email, crypt('TestPass123!', gen_salt('bf')), now(), '+914444444444', now(),
    '{"provider":"phone","providers":["phone"]}',
    '{"full_name":"Test POS","phone_verified":true}', now(), now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO pos_uid;

  IF pos_uid IS NULL THEN
    SELECT id INTO pos_uid FROM auth.users WHERE email = synthetic_email;
  END IF;

  DELETE FROM user_roles WHERE user_id = pos_uid;
  INSERT INTO user_roles (user_id, role) VALUES (pos_uid, 'pos');

  INSERT INTO staff_directory (user_id, full_name, email, phone, role, is_active)
  VALUES (pos_uid, 'Test POS', 'test-pos@aquaprime.app', '+914444444444', 'pos', true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test POS',
    role = 'pos',
    is_active = true;

  INSERT INTO profiles (user_id, full_name, email, phone, is_active, phone_verified, onboarding_complete)
  VALUES (pos_uid, 'Test POS', 'test-pos@aquaprime.app', '+914444444444', true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test POS',
    is_active = true;

  RAISE NOTICE '✅ POS user created/updated: %', pos_uid;
END $$;

-- ============================================================
-- TEST USER 6: CUSTOMER
-- Phone: +915555555555
-- ============================================================
DO $$
DECLARE
  customer_uid uuid;
  customer_id uuid;
  synthetic_email text := 'phone_915555555555@phone.aquaprime.app';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    synthetic_email, crypt('TestPass123!', gen_salt('bf')), now(), '+915555555555', now(),
    '{"provider":"phone","providers":["phone"]}',
    '{"full_name":"Test Customer","phone_verified":true}', now(), now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO customer_uid;

  IF customer_uid IS NULL THEN
    SELECT id INTO customer_uid FROM auth.users WHERE email = synthetic_email;
  END IF;

  DELETE FROM user_roles WHERE user_id = customer_uid;
  INSERT INTO user_roles (user_id, role) VALUES (customer_uid, 'customer');

  -- Create customer record
  INSERT INTO customers (user_id, name, phone, email, display_id)
  VALUES (customer_uid, 'Test Customer', '+915555555555', 'test-customer@aquaprime.app', 'CUST-TEST-001')
  ON CONFLICT (user_id) DO UPDATE SET
    name = 'Test Customer',
    phone = '+915555555555';

  INSERT INTO profiles (user_id, full_name, email, phone, is_active, phone_verified, onboarding_complete)
  VALUES (customer_uid, 'Test Customer', 'test-customer@aquaprime.app', '+915555555555', true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = 'Test Customer',
    is_active = true;

  RAISE NOTICE '✅ Customer user created/updated: %', customer_uid;
END $$;

-- ============================================================
-- SUMMARY
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST USERS SEEDED SUCCESSFULLY';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Role       | Phone          | Login';
  RAISE NOTICE '-----------|----------------|-------';
  RAISE NOTICE 'Super Admin| +916305295757  | Use existing';
  RAISE NOTICE 'Manager    | +911111111111  | OTP login';
  RAISE NOTICE 'Agent      | +912222222222  | OTP login';
  RAISE NOTICE 'Marketer   | +913333333333  | OTP login';
  RAISE NOTICE 'POS        | +914444444444  | OTP login';
  RAISE NOTICE 'Customer   | +915555555555  | OTP login';
  RAISE NOTICE '========================================';
END $$;
