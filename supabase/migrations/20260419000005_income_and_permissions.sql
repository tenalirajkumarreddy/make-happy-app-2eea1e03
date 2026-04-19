-- Migration: Income Tracking and Enhanced Permissions
-- Date: 2026-04-19

-- ============================================================================
-- 1. Enhance staff_cash_accounts for Prime Manager
-- ============================================================================

-- Add account_type and reset tracking
ALTER TABLE public.staff_cash_accounts 
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'staff' 
  CHECK (account_type IN ('staff', 'manager', 'prime_manager')),
ADD COLUMN IF NOT EXISTS last_reset_at timestamptz,
ADD COLUMN IF NOT EXISTS reset_amount numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) GENERATED ALWAYS AS (COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)) STORED;

-- Create index for account type lookups
CREATE INDEX IF NOT EXISTS idx_staff_cash_accounts_type 
ON public.staff_cash_accounts(account_type);

CREATE INDEX IF NOT EXISTS idx_staff_cash_accounts_warehouse 
ON public.staff_cash_accounts(warehouse_id);

-- ============================================================================
-- 2. Create Income Entries Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.income_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entry classification
  entry_type text NOT NULL 
    CHECK (entry_type IN ('collection', 'direct_payment', 'other_income', 'opening_balance')),
  source_type text 
    CHECK (source_type IN ('sale', 'handover', 'direct', 'adjustment', 'opening')),
  
  -- Source reference
  source_id uuid, -- Can reference sale, handover, etc.
  
  -- Amount breakdown
  cash_amount numeric(12,2) DEFAULT 0,
  upi_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) GENERATED ALWAYS AS (COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)) STORED,
  
  -- Categorization
  category text, -- For other_income: rent, interest, refund, lending, misc
  subcategory text,
  
  -- Recording info
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  notes text,
  
  -- Receipt image
  receipt_url text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for income entries
CREATE INDEX IF NOT EXISTS idx_income_entries_type ON public.income_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_income_entries_source ON public.income_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_income_entries_recorded_by ON public.income_entries(recorded_by);
CREATE INDEX IF NOT EXISTS idx_income_entries_warehouse ON public.income_entries(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_income_entries_created_at ON public.income_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_income_entries_category ON public.income_entries(category);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_income_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_income_entries_updated_at ON public.income_entries;
CREATE TRIGGER trigger_update_income_entries_updated_at
  BEFORE UPDATE ON public.income_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_income_entries_updated_at();

-- ============================================================================
-- 3. Enhance User Permissions Table
-- ============================================================================

-- Add metadata fields
ALTER TABLE public.user_permissions 
ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS granted_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted_by ON public.user_permissions(granted_by);
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires ON public.user_permissions(expires_at);

-- ============================================================================
-- 4. Income Categories Enum/Validation
-- ============================================================================

-- Create a view for income category validation
CREATE OR REPLACE VIEW public.income_categories AS
SELECT unnest(ARRAY[
  'rent',
  'interest', 
  'refund',
  'lending',
  'misc'
]) AS category;

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Function to get daily income summary
CREATE OR REPLACE FUNCTION public.get_daily_income_summary(
  p_date date DEFAULT CURRENT_DATE,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_collections numeric,
  total_direct_payments numeric,
  total_other_income numeric,
  total_cash numeric,
  total_upi numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN entry_type = 'collection' THEN total_amount ELSE 0 END), 0) as total_collections,
    COALESCE(SUM(CASE WHEN entry_type = 'direct_payment' THEN total_amount ELSE 0 END), 0) as total_direct_payments,
    COALESCE(SUM(CASE WHEN entry_type = 'other_income' THEN total_amount ELSE 0 END), 0) as total_other_income,
    COALESCE(SUM(cash_amount), 0) as total_cash,
    COALESCE(SUM(upi_amount), 0) as total_upi,
    COALESCE(SUM(total_amount), 0) as grand_total
  FROM public.income_entries
  WHERE DATE(created_at) = p_date
  AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
END;
$$;

-- Function to record daily reset (Prime Manager)
CREATE OR REPLACE FUNCTION public.record_daily_reset(
  p_user_id uuid,
  p_warehouse_id uuid
)
RETURNS TABLE (
  reset_amount numeric,
  income_entry_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cash_amount numeric;
  v_upi_amount numeric;
  v_total_amount numeric;
  v_income_id uuid;
BEGIN
  -- Get current amounts
  SELECT cash_amount, upi_amount INTO v_cash_amount, v_upi_amount
  FROM public.staff_cash_accounts
  WHERE user_id = p_user_id AND account_type = 'prime_manager';
  
  v_total_amount := COALESCE(v_cash_amount, 0) + COALESCE(v_upi_amount, 0);
  
  -- Create income entry
  INSERT INTO public.income_entries (
    entry_type,
    source_type,
    cash_amount,
    upi_amount,
    total_amount,
    recorded_by,
    warehouse_id,
    notes
  ) VALUES (
    'opening_balance',
    'opening',
    v_cash_amount,
    v_upi_amount,
    v_total_amount,
    p_user_id,
    p_warehouse_id,
    'Daily reset - ' || CURRENT_DATE
  )
  RETURNING id INTO v_income_id;
  
  -- Reset account
  UPDATE public.staff_cash_accounts
  SET 
    cash_amount = 0,
    upi_amount = 0,
    last_reset_at = now(),
    reset_amount = v_total_amount
  WHERE user_id = p_user_id AND account_type = 'prime_manager';
  
  RETURN QUERY SELECT v_total_amount, v_income_id;
END;
$$;

-- Function to get staff income summary
CREATE OR REPLACE FUNCTION public.get_staff_income_summary(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date_entry date,
  collections numeric,
  direct_payments numeric,
  other_income numeric,
  daily_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ie.created_at) as date_entry,
    COALESCE(SUM(CASE WHEN ie.entry_type = 'collection' THEN ie.total_amount ELSE 0 END), 0) as collections,
    COALESCE(SUM(CASE WHEN ie.entry_type = 'direct_payment' THEN ie.total_amount ELSE 0 END), 0) as direct_payments,
    COALESCE(SUM(CASE WHEN ie.entry_type = 'other_income' THEN ie.total_amount ELSE 0 END), 0) as other_income,
    COALESCE(SUM(ie.total_amount), 0) as daily_total
  FROM public.income_entries ie
  WHERE ie.recorded_by = p_user_id
  AND DATE(ie.created_at) BETWEEN p_start_date AND p_end_date
  GROUP BY DATE(ie.created_at)
  ORDER BY date_entry DESC;
END;
$$;

-- ============================================================================
-- 6. RLS Policies for Income Entries
-- ============================================================================

ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;

-- Super admin can see all
CREATE POLICY "Super admin full access to income entries"
ON public.income_entries
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Manager can see entries for their warehouse
CREATE POLICY "Manager can view warehouse income"
ON public.income_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('super_admin', 'manager')
    AND (ur.warehouse_id = income_entries.warehouse_id OR income_entries.warehouse_id IS NULL)
  )
);

-- Users can see entries they recorded
CREATE POLICY "Users can see their own entries"
ON public.income_entries
FOR SELECT
TO authenticated
USING (recorded_by = auth.uid());

-- Users can create entries
CREATE POLICY "Users can create income entries"
ON public.income_entries
FOR INSERT
TO authenticated
WITH CHECK (recorded_by = auth.uid());

-- ============================================================================
-- 7. Grant Permissions
-- ============================================================================

GRANT SELECT ON public.income_categories TO authenticated;
GRANT ALL ON public.income_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_income_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_reset TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_income_summary TO authenticated;

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON TABLE public.income_entries IS 'Tracks all income sources: collections, direct payments, and other income';
COMMENT ON COLUMN public.income_entries.entry_type IS 'Type: collection, direct_payment, other_income, opening_balance';
COMMENT ON COLUMN public.income_entries.category IS 'For other_income: rent, interest, refund, lending, misc';
COMMENT ON TABLE public.staff_cash_accounts IS 'Enhanced with prime_manager support for daily reset tracking';

-- ============================================================================
-- 9. Migration Metadata
-- ============================================================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260419000005', 'income_and_permissions', now());
