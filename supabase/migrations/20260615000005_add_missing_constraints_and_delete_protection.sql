-- Migration: Add Missing CHECK Constraints and Customer Delete Protection
-- Date: 2026-06-15
-- Priority: P1 - HIGH (Data Integrity)
--
-- Issues Fixed:
-- 1. Missing stores_outstanding_check constraint (outstanding >= 0)
-- 2. Missing customers_kyc_status_check constraint (valid kyc_status values)
-- 3. Missing prevent_customer_delete trigger function (protects against ON DELETE CASCADE on stores)
-- 4. Missing deactivate_customer_with_stores RPC (atomic customer+stores deactivation)

-- ============================================================
-- 1. CHECK CONSTRAINTS
-- ============================================================

-- stores.outstanding >= 0
ALTER TABLE public.stores ADD CONSTRAINT IF NOT EXISTS stores_outstanding_check CHECK (outstanding >= 0) NOT VALID;
ALTER TABLE public.stores VALIDATE CONSTRAINT stores_outstanding_check;

-- customers.kyc_status must be one of valid values
ALTER TABLE public.customers ADD CONSTRAINT IF NOT EXISTS customers_kyc_status_check CHECK (kyc_status IN ('not_requested', 'pending', 'verified', 'rejected')) NOT VALID;
ALTER TABLE public.customers VALIDATE CONSTRAINT customers_kyc_status_check;

-- ============================================================
-- 2. PREVENT CUSTOMER HARD DELETE (protects against CASCADE on stores)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_customer_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Cannot delete customers directly. Use is_active = false to deactivate.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_delete_trigger ON public.customers;
CREATE TRIGGER prevent_customer_delete_trigger
    BEFORE DELETE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_customer_delete();

-- ============================================================
-- 3. ATOMIC CUSTOMER + STORES DEACTIVATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.deactivate_customer_with_stores(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.stores SET is_active = false, updated_at = now() WHERE customer_id = p_customer_id AND is_active = true;
    UPDATE public.customers SET is_active = false, updated_at = now() WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_customer_with_stores(UUID) TO authenticated;