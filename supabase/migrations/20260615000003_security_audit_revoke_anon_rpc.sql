-- Security Audit: Revoke anon EXECUTE on all SECURITY DEFINER functions
-- Date: 2026-06-15
--
-- Problem: 23+ functions are callable by anonymous users as SECURITY DEFINER.
-- Fix: Revoke EXECUTE from anon on all public schema functions.
--      Keep authenticated EXECUTE (functions have internal role checks).
-- =========================================================

-- Revoke EXECUTE on ALL functions in public schema from anon
DO $$
DECLARE
    func RECORD;
BEGIN
    FOR func IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        BEGIN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                func.proname,
                COALESCE(func.args, '')
            );
        EXCEPTION WHEN insufficient_privilege THEN
            -- Skip functions we don't own
            RAISE NOTICE 'Skipped % (insufficient privilege)', func.proname;
        WHEN OTHERS THEN
            RAISE NOTICE 'Error revoking %: %', func.proname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Also revoke from anon on non-definer functions that might be sensitive
DO $$
DECLARE
    func RECORD;
BEGIN
    FOR func IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'generate_display_id',
            'resolve_user_identity',
            'get_agent_cash_holding'
          )
    LOOP
        BEGIN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                func.proname,
                COALESCE(func.args, '')
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error revoking %: %', func.proname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Verify: Show remaining grants to anon (should be empty or minimal)
SELECT p.proname AS function_name,
       pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND EXISTS (
    SELECT 1 FROM information_schema.routine_privileges rp
    WHERE rp.routine_name = p.proname
      AND rp.routine_schema = 'public'
      AND rp.grantee = 'anon'
      AND rp.privilege_type = 'EXECUTE'
  );

-- =========================================================
-- Additional: Ensure all RPCs have internal auth checks
-- This is enforced at the application layer via the
-- 20260610000001 and 202 Insnp. 11 migrations, which added
-- auth.uid() and role checks to critical RPCs.
-- =========================================================