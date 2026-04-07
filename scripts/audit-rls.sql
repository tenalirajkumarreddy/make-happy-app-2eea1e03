-- RLS Audit Query
-- This script checks which tables have RLS enabled and lists their policies
-- Run this in Supabase SQL Editor to audit RLS configuration

-- 1. List all tables and their RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. List all RLS policies
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

-- 3. Find tables WITHOUT RLS enabled (SECURITY RISK!)
SELECT 
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 4. Find tables with RLS enabled but NO policies (USERS CAN'T ACCESS DATA!)
SELECT 
  t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_policies p 
    WHERE p.schemaname = t.schemaname 
      AND p.tablename = t.tablename
  )
ORDER BY t.tablename;
