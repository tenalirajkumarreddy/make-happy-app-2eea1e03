-- Migration: Add RLS Policies for Sale Returns Tables
-- Date: 2026-06-14
-- Priority: P1 - HIGH (Access Control)
--
-- Issues Fixed:
-- 1. sale_returns table missing UPDATE policy (notes updates fail silently)
-- 2. sale_return_tracked_items missing SELECT policy
-- 3. wastage_entries missing SELECT policy
--
-- Fix:
-- Add comprehensive RLS policies for all three tables

-- ============================================================================
-- 1. sale_returns RLS Policies
-- ============================================================================

-- Enable RLS (should already be enabled, but ensuring)
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Staff can view sale returns" ON public.sale_returns;
DROP POLICY IF EXISTS "Staff can update own returns" ON public.sale_returns;
DROP POLICY IF EXISTS "Staff can insert returns" ON public.sale_returns;

-- View policy: Staff can view returns for stores they have access to
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

-- Insert policy: Staff can create returns
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

-- ✅ FIXED: Update policy for notes (allows users to update returns they created)
CREATE POLICY "Staff can update own returns" ON public.sale_returns
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
  OR created_by = auth.uid()
);

-- ============================================================================
-- 2. sale_return_tracked_items RLS Policies
-- ============================================================================

ALTER TABLE public.sale_return_tracked_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view return items" ON public.sale_return_tracked_items;

-- View policy: Staff can view return items for returns they have access to
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

-- ============================================================================
-- 3. wastage_entries RLS Policies
-- ============================================================================

ALTER TABLE public.wastage_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view wastage" ON public.wastage_entries;
DROP POLICY IF EXISTS "Staff can insert wastage" ON public.wastage_entries;

-- View policy: Staff can view wastage entries
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

-- Insert policy: Only via RPC (SECURITY DEFINER) or admins
CREATE POLICY "Staff can insert wastage" ON public.wastage_entries
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'manager')
);