-- Migration: Add missing is_fully_returned to transactions and RLS for balance_adjustments
-- Date: 2026-06-29
--
-- Issue: The transactions table is missing the is_fully_returned column that was
-- added to sales on 2026-05-29. Multiple frontend queries (AgentStoreProfile,
-- useLiveStoreBalance) and the record_payment_return RPC reference this column,
-- causing all transaction ledger queries to fail with 400 errors.
--
-- Additionally, balance_adjustments has no RLS policies, which can cause 403
-- errors if RLS is enabled on the table.

-- =========================================================
-- 1. TRANSACTIONS TABLE - Add is_fully_returned
-- =========================================================

-- Add column if it doesn't exist
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS is_fully_returned BOOLEAN DEFAULT false;

-- Set default for existing rows
UPDATE public.transactions
SET is_fully_returned = false
WHERE is_fully_returned IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_is_fully_returned ON public.transactions (is_fully_returned);

-- =========================================================
-- 2. BALANCE_ADJUSTMENTS TABLE - Add RLS policies
-- =========================================================

-- Enable RLS if not already enabled
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe
DROP POLICY IF EXISTS "Allow authed users to read balance_adjustments" ON public.balance_adjustments;
DROP POLICY IF EXISTS "Allow staff to insert balance_adjustments" ON public.balance_adjustments;

-- SELECT: Staff can view all balance adjustments
CREATE POLICY "Allow authed users to read balance_adjustments"
  ON public.balance_adjustments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator', 'marketer')
    )
    OR adjusted_by = (select auth.uid())
  );

-- INSERT: Staff with appropriate roles can create adjustments
CREATE POLICY "Allow staff to insert balance_adjustments"
  ON public.balance_adjustments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role IN ('super_admin', 'manager', 'agent', 'operator')
    )
  );
