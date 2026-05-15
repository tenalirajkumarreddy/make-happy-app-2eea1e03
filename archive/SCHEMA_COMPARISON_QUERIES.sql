-- ============================================================
-- DATABASE SCHEMA COMPARISON QUERIES
-- Run these in Supabase SQL Editor to compare with ACTIVE_SQL.sql
-- ============================================================

-- ============================================================
-- SECTION 1: LIST ALL TABLES
-- ============================================================
SELECT 
  tablename,
  schemaname
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Expected tables from ACTIVE_SQL.sql:
-- activity_logs, agent_inventory, agent_routes, customers, daily_balances,
-- daily_handover, location_pings, notifications, order_items, orders,
-- product_categories, products, profiles, push_subscriptions, route_sessions,
-- route_visits, routes, sale_items, sales, store_types, stores, transactions,
-- user_roles


-- ============================================================
-- SECTION 2: CHECK ENUMS
-- ============================================================
SELECT 
  t.typname as enum_name,
  e.enumlabel as enum_value,
  e.enumsortorder
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname IN ('app_role', 'payment_method', 'kyc_status_type')
ORDER BY t.typname, e.enumsortorder;

-- Expected:
-- app_role: super_admin, manager, agent, marketer, pos, customer
-- payment_method: cash, upi, card, bank_transfer, cheque, other


-- ============================================================
-- SECTION 3: CHECK FUNCTIONS
-- ============================================================
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'update_updated_at_column',
    'has_role',
    'get_user_role',
    'generate_display_id',
    'handle_new_user',
    'recalc_store_outstanding',
    'record_sale'
  )
ORDER BY routine_name;


-- ============================================================
-- SECTION 4: CHECK TRIGGERS
-- ============================================================
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Expected key triggers:
-- on_auth_user_created (auth.users)
-- update_*_updated_at (multiple tables)
-- recalc_store_outstanding_trigger (stores)


-- ============================================================
-- SECTION 5: CHECK TABLE STRUCTURES
-- ============================================================

-- Profiles table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Customers table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'customers'
ORDER BY ordinal_position;

-- Stores table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'stores'
ORDER BY ordinal_position;

-- Sales table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'sales'
ORDER BY ordinal_position;

-- Route sessions table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'route_sessions'
ORDER BY ordinal_position;

-- Location pings table (latest addition)
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'location_pings'
ORDER BY ordinal_position;


-- ============================================================
-- SECTION 6: CHECK RLS POLICIES
-- ============================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ============================================================
-- SECTION 7: CHECK INDEXES
-- ============================================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- ============================================================
-- SECTION 8: CHECK FOREIGN KEYS
-- ============================================================
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;


-- ============================================================
-- SECTION 9: CHECK STORAGE BUCKETS & POLICIES
-- ============================================================
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- Expected buckets:
-- kyc-documents (private, 10485760 bytes = 10MB)
-- entity-photos (public, 5242880 bytes = 5MB)

SELECT 
  bucket_id,
  name,
  definition
FROM storage.policies
ORDER BY bucket_id, name;


-- ============================================================
-- SECTION 10: COUNT RECORDS (Data Verification)
-- ============================================================
SELECT 'profiles' as table_name, COUNT(*) as record_count FROM public.profiles
UNION ALL
SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL
SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL
SELECT 'stores', COUNT(*) FROM public.stores
UNION ALL
SELECT 'products', COUNT(*) FROM public.products
UNION ALL
SELECT 'sales', COUNT(*) FROM public.sales
UNION ALL
SELECT 'transactions', COUNT(*) FROM public.transactions
UNION ALL
SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL
SELECT 'routes', COUNT(*) FROM public.routes
UNION ALL
SELECT 'route_sessions', COUNT(*) FROM public.route_sessions
UNION ALL
SELECT 'location_pings', COUNT(*) FROM public.location_pings
ORDER BY table_name;


-- ============================================================
-- SECTION 11: CHECK LATEST MIGRATION VERSION
-- ============================================================
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 10;

-- Expected latest: 20260320000001


-- ============================================================
-- SECTION 12: VALIDATE KEY CONSTRAINTS
-- ============================================================

-- Check unique constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
ORDER BY tc.table_name, tc.constraint_type, kcu.column_name;


-- ============================================================
-- SECTION 13: CHECK RLS IS ENABLED
-- ============================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- All tables should have rowsecurity = true


-- ============================================================
-- SECTION 14: VERIFY SPECIFIC BUSINESS LOGIC
-- ============================================================

-- Test record_sale function exists and has correct signature
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'record_sale';

-- Check recalc_store_outstanding trigger
SELECT 
  tgname,
  tgtype,
  tgenabled,
  tgfoid::regproc as trigger_function
FROM pg_trigger
WHERE tgname = 'recalc_store_outstanding_trigger';


-- ============================================================
-- SECTION 15: SECURITY AUDIT
-- ============================================================

-- Check for tables without RLS
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
-- Should return 0 rows

-- Check for policies without proper role checks
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND qual IS NULL 
  AND with_check IS NULL;
-- Should be minimal or none


-- ============================================================
-- USAGE INSTRUCTIONS
-- ============================================================
-- 
-- 1. Copy each section and run in Supabase SQL Editor
-- 2. Compare results with ACTIVE_SQL.sql expectations
-- 3. Note any differences in structure, policies, or missing tables
-- 4. If differences found, either:
--    a) Update ACTIVE_SQL.sql to match production
--    b) Run missing migrations on production
-- 
-- ============================================================
