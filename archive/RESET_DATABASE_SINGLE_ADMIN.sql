
-- 1. Wipe Business Data including cascading deletes to Stores, Sales, Orders etc.
-- TRUNCATE existing tables (only those that we know exist)
DO $$
BEGIN
    TRUNCATE TABLE
      public.customers,
      public.stores,
      public.routes,
      public.agent_routes,
      public.store_qr_codes,
      public.sales,
      public.sale_items,
      public.orders,
      public.order_items,
      public.transactions,
      public.handovers,
      public.handover_snapshots,
      public.balance_adjustments,
      public.activity_logs,
      public.notifications,
      public.staff_invitations,
      public.route_sessions,
      public.store_visits,
      public.location_pings, -- If this exists
      public.push_subscriptions,
      public.product_stock,
      public.stock_movements
    RESTART IDENTITY CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error truncating tables: %', SQLERRM;
        -- Fallback: Truncate core tables if others fail
        TRUNCATE TABLE public.customers, public.stores RESTART IDENTITY CASCADE;
END $$;

-- 2. Wipe All Users (Cascades to profiles, user_roles)
DELETE FROM auth.users;

-- 3. Seed Single Super Admin
-- tenalirajkumar@gmail.com (+916305295757)
DO $$
DECLARE
  new_uid uuid;
BEGIN
  -- Insert User
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    phone,
    phone_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'tenalirajkumar@gmail.com',
    crypt('password123', gen_salt('bf')), -- Default password
    now(),
    '+916305295757',
    now(),
    '{"provider":"phone","providers":["phone","email"]}',
    '{"full_name":"Raj Kumar"}',
    now(),
    now()
  ) RETURNING id INTO new_uid;

  -- Assign Super Admin Role
  -- (Trigger might create 'customer', so we update or insert)
  -- The trigger `handle_new_user` inserts into `user_roles` with `customer`.
  -- So we need to update that record or insert if trigger didn't run.

  -- First, wait/check if trigger ran? No, in SQL block it runs after statement.
  -- But since we are in a DO block, let's just force the role.

  -- If the trigger exists and runs, user_roles will have (user_id, 'customer').
  -- We want (user_id, 'super_admin').

  -- Delete any existing role for this user (from trigger)
  DELETE FROM public.user_roles WHERE user_id = new_uid;

  -- Insert correct role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_uid, 'super_admin');

  -- Ensure profile exists
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (new_uid, 'Raj Kumar', 'tenalirajkumar@gmail.com', '+916305295757')
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = 'Raj Kumar', phone = '+916305295757';

END $$;

