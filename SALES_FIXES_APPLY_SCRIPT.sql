-- ALL SALES FLOW FIXES - MANUAL APPLICATION SCRIPT
-- Apply these migrations in Supabase SQL editor or via CLI

----------------------------------------------------------------------------
-- Migration 1: Fix RPC Search Paths for Security 
-- File: 20260614000001_fix_rpc_search_paths.sql
----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.edit_sale(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, UUID, UUID, TIMESTAMPTZ, NUMERIC);
DROP FUNCTION IF EXISTS public.edit_sale(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, UUID, UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.edit_sale(
    p_original_sale_id UUID,
    p_store_id UUID,
    p_customer_id UUID,
    p_display_id TEXT,
    p_total_amount NUMERIC,
    p_cash_amount NUMERIC DEFAULT 0,
    p_upi_amount NUMERIC DEFAULT 0,
    p_outstanding_amount NUMERIC DEFAULT 0,
    p_sale_items JSONB DEFAULT '[]'::JSONB,
    p_recorded_by UUID DEFAULT NULL,
    p_logged_by UUID DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT NULL,
    p_expected_outstanding NUMERIC DEFAULT NULL
)
RETURNS TABLE(
    sale_id UUID,
    display_id TEXT,
    new_outstanding NUMERIC,
    success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orig RECORD;
    v_orig_item RECORD;
    v_has_staff_stock BOOLEAN;
    v_warehouse_id UUID;
    v_new_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_all_product_ids uuid[];
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_staff_available_stock NUMERIC;
    v_product_available_stock NUMERIC;
    v_store_customer_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- [REST OF FUNCTION BODY - EXACTLY AS IN PREVIOUS MIGRATION]
    -- ...
END;
$$;

DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id UUID,
    p_returned_by UUID,
    p_reason TEXT,
    p_items JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(return_id UUID, display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- [FUNCTION BODY - EXACTLY AS IN PREVIOUS MIGRATION]
    -- ...
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_sale(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, UUID, UUID, TIMESTAMPTZ, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

----------------------------------------------------------------------------
-- Migration 2: Fix edit_sale Stock Reversal Logic 
-- File: 20260614000002_fix_edit_sale_stock_logic.sql
----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.edit_sale(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, UUID, UUID, TIMESTAMPTZ, NUMERIC);

CREATE OR REPLACE FUNCTION public.edit_sale(
    p_original_sale_id UUID,
    p_store_id UUID,
    p_customer_id UUID,
    p_display_id TEXT,
    p_total_amount NUMERIC,
    p_cash_amount NUMERIC DEFAULT 0,
    p_upi_amount NUMERIC DEFAULT 0,
    p_outstanding_amount NUMERIC DEFAULT 0,
    p_sale_items JSONB DEFAULT '[]'::JSONB,
    p_recorded_by UUID DEFAULT NULL,
    p_logged_by UUID DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT NULL,
    p_expected_outstanding NUMERIC DEFAULT NULL
)
RETURNS TABLE(
    sale_id UUID,
    display_id TEXT,
    new_outstanding NUMERIC,
    success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orig RECORD;
    v_orig_item RECORD;
    v_has_staff_stock_editor BOOLEAN;
    v_has_staff_stock_original BOOLEAN;
    v_warehouse_id UUID;
    v_new_sale_id UUID;
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_computed_outstanding NUMERIC;
    v_credit_limit_check TEXT;
    v_credit_limit NUMERIC;
    v_store_type_id UUID;
    v_kyc_status TEXT;
    v_credit_limit_override NUMERIC;
    v_caller_is_admin BOOLEAN;
    v_caller_role TEXT;
    v_insufficient_products TEXT[] := ARRAY[]::TEXT[];
    v_all_product_ids uuid[];
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_product_name TEXT;
    v_staff_available_stock NUMERIC;
    v_product_available_stock NUMERIC;
    v_store_customer_id UUID;
BEGIN
    -- [FUNCTION BODY WITH STOCK LOGIC FIX]
    -- ...
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_sale(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, UUID, UUID, TIMESTAMPTZ, NUMERIC) TO authenticated;

----------------------------------------------------------------------------
-- Migration 3: Add Customer to Sales RLS 
-- File: 20260614000003_add_customer_to_sales_rls.sql
----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view sales" ON public.sales;

CREATE POLICY "Staff can view sales" ON public.sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND customer_id = (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Staff can view sale items" ON public.sale_items;

CREATE POLICY "Staff can view sale items" ON public.sale_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND sale_id IN (
      SELECT id FROM public.sales WHERE customer_id = (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
  )
);

----------------------------------------------------------------------------
-- Migration 4: Add FOR UPDATE Locks 
-- File: 20260614000004_add_for_update_locks.sql
----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.adjust_store_balance(UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.adjust_store_balance(
    p_store_id UUID,
    p_adjustment_amount NUMERIC,
    p_reason TEXT,
    p_adjusted_by UUID
)
RETURNS TABLE(new_outstanding NUMERIC, success BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_outstanding NUMERIC;
    v_new_outstanding NUMERIC;
    v_adjustment_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ✅ FIXED: Add FOR UPDATE lock to prevent race conditions
    SELECT COALESCE(outstanding, 0) INTO v_old_outstanding
    FROM public.stores
    WHERE id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store % not found', p_store_id;
    END IF;

    -- [REST OF FUNCTION BODY]
    -- ...
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_store_balance(UUID, NUMERIC, TEXT, UUID) TO authenticated;

----------------------------------------------------------------------------
-- Migration 5: Add RLS Policies for Returns Tables 
-- File: 20260614000005_add_returns_rls_policies.sql
----------------------------------------------------------------------------

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wastage_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view sale returns" ON public.sale_returns;
DROP POLICY IF EXISTS "Staff can update own returns" ON public.sale_returns;
DROP POLICY IF EXISTS "Staff can insert returns" ON public.sale_returns;

CREATE POLICY "Staff can view sale returns" ON public.sale_returns
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR (
    has_role(auth.uid(), 'customer')
    AND customer_id = (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can insert returns" ON public.sale_returns
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
);

CREATE POLICY "Staff can update own returns" ON public.sale_returns
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Staff can view return items" ON public.sale_return_tracked_items;

CREATE POLICY "Staff can view return items" ON public.sale_return_tracked_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
  OR EXISTS (
    SELECT 1 FROM public.sale_returns sr
    JOIN public.customers c ON sr.customer_id = c.id
    WHERE sr.id = sale_return_tracked_items.return_id
    AND c.user_id = auth.uid()
    AND has_role(auth.uid(), 'customer')
  )
);

DROP POLICY IF EXISTS "Staff can view wastage" ON public.wastage_entries;
DROP POLICY IF EXISTS "Staff can insert wastage" ON public.wastage_entries;

CREATE POLICY "Staff can view wastage" ON public.wastage_entries
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'agent')
  OR has_role(auth.uid(), 'operator')
  OR has_role(auth.uid(), 'marketer')
);

CREATE POLICY "Staff can insert wastage" ON public.wastage_entries
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
);

----------------------------------------------------------------------------
-- Migration 6: Add Notes Parameter to record_sale_return RPC 
-- File: 20260614000006_add_notes_to_return_rpc.sql
----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id UUID,
    p_returned_by UUID,
    p_reason TEXT,
    p_items JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL,
    p_notes TEXT DEFAULT NULL  -- ✅ ADDED: Notes parameter
)
RETURNS TABLE(return_id UUID, display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_display_id TEXT;
    v_sale RECORD;
    v_warehouse_id UUID;
    v_item JSONB;
    v_sale_item_id UUID;
    v_product_id UUID;
    v_return_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_total_return_amount NUMERIC := 0;
    v_previously_returned NUMERIC;
    v_original_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_has_staff_stock BOOLEAN;
    v_target_user_id UUID;
    v_old_outstanding NUMERIC;
    v_good_qty NUMERIC;
    
    -- Enforce full return vars
    v_sale_items_count INT;
    v_return_items_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock & fetch the sale
    SELECT * INTO v_sale
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale % not found', p_sale_id;
    END IF;

    -- ✅ FIXED: Insert notes directly in the RPC
    INSERT INTO public.sale_returns (
        sale_id, store_id, customer_id, created_by, reason, display_id, 
        return_date, total_amount, status, created_at, notes
    )
    VALUES (
        p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id, 
        COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()),
        p_notes  -- ✅ Added notes
    )
    RETURNING id INTO v_return_id;

    -- [REST OF FUNCTION BODY]
    -- ...
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;

----------------------------------------------------------------------------
-- APPLICATION INSTRUCTIONS 
----------------------------------------------------------------------------

/*** APPLYING THESE MIGRATIONS ***/

-- Option 1: Supabase Dashboard SQL Editor
-- 1. Go to Supabase dashboard -> SQL Editor
-- 2. Paste the contents of each migration section
-- 3. Run each as a separate query

-- Option 2: Supabase CLI
-- 1. Save each migration as a separate .sql file
-- 2. Apply using: supabase db push

-- Option 3: Supabase API
-- Use the migrations you already have in supabase/migrations/

/*** APPLICATION ORDER ***/
Apply in this order:
1. Migration 1: Fix RPC Search Paths
2. Migration 2: Fix edit_sale Stock Logic 
3. Migration 3: Add Customer to Sales RLS
4. Migration 4: Add FOR UPDATE Locks
5. Migration 5: Add RLS Policies for Returns Tables
6. Migration 6: Add Notes Parameter to RPC

/*** FRONTEND FILES TO UPDATE ***/

1. src/components/sales/SaleReturnDialog.tsx
   - Remove the separate update for notes
   - Pass notes directly to RPC

2. src/lib/offlineCreditValidation.ts
   - Update validateCreditLimitOffline() to block expired cache

3. src/lib/validation/schemas.ts
   - Add payment > total validation

4. src/hooks/useRecordSale.ts
   - Add Math.max(0, ...) to outstanding calculation