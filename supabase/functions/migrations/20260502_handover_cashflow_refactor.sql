-- ============================================================
-- MIGRATION: Handover Cashflow Refactor
-- Date: 2026-05-02
-- Description: 
--   1. Update confirm_handover_v2 to auto-create income_entry when 
--      confirmer is a finalizer (has 'finalizer' permission)
--   2. Add finalizer_daily_reset RPC for zeroing finalizer balances
--   3. Add trigger for finalizer self-sale income auto-recording
--   4. Add handover_id reference column to income_entries (audit trail)
-- ============================================================

-- Step 1: Add handover_id reference to income_entries for audit trail
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'income_entries' AND column_name = 'handover_id'
  ) THEN
    ALTER TABLE public.income_entries 
    ADD COLUMN handover_id UUID REFERENCES public.handovers(id) ON DELETE SET NULL;
    
    CREATE INDEX income_entries_handover_id_idx ON public.income_entries(handover_id);
    COMMENT ON COLUMN public.income_entries.handover_id IS 'Reference to handover that generated this income entry (for finalizer confirmations)';
  END IF;
END $$;

-- Step 2: Update/Replace confirm_handover_v2 RPC
-- Auto-creates income_entry when the confirmer is a finalizer
CREATE OR REPLACE FUNCTION public.confirm_handover_v2(
  p_handover_id UUID,
  p_confirmed_by UUID
)
RETURNS TABLE(
  id UUID,
  status TEXT,
  confirmed_at TIMESTAMPTZ,
  income_entry_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover RECORD;
  v_is_finalizer BOOLEAN := false;
  v_warehouse_id UUID;
  v_income_entry_id UUID;
  v_income_created BOOLEAN := false;
BEGIN
  -- Get handover details
  SELECT h.*, w.id AS wh_id
  INTO v_handover
  FROM public.handovers h
  LEFT JOIN public.warehouses w ON w.id = h.warehouse_id
  WHERE h.id = p_handover_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handover not found: %', p_handover_id;
  END IF;

  IF v_handover.status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Handover is not awaiting confirmation (status: %)', v_handover.status;
  END IF;

  -- Verify the confirmer is the intended recipient
  IF v_handover.handed_to != p_confirmed_by THEN
    -- Check if confirmer is super_admin (can confirm on behalf)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = p_confirmed_by AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'You are not authorized to confirm this handover';
    END IF;
  END IF;

  -- Check if confirmer has finalizer permission
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = p_confirmed_by AND permission_key = 'finalizer' AND is_enabled = true
  ) INTO v_is_finalizer;

  -- Get warehouse_id (fallback to first warehouse if not on handover)
  v_warehouse_id := COALESCE(v_handover.warehouse_id, (SELECT id FROM public.warehouses LIMIT 1));

  -- Update handover status
  UPDATE public.handovers
  SET 
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = p_confirmed_by
  WHERE id = p_handover_id;

  -- Update sender's holding_balance (reduce by handover amount)
  UPDATE public.profiles
  SET 
    holding_balance = COALESCE(holding_balance, 0) - (v_handover.cash_amount + v_handover.upi_amount),
    holding_balance_updated_at = now()
  WHERE user_id = v_handover.user_id;

  -- Update receiver's holding_balance (increase by handover amount)
  -- Only for non-finalizer receivers (finalizers go straight to income)
  IF NOT v_is_finalizer THEN
    UPDATE public.profiles
    SET 
      holding_balance = COALESCE(holding_balance, 0) + (v_handover.cash_amount + v_handover.upi_amount),
      holding_balance_updated_at = now()
    WHERE user_id = p_confirmed_by;
  END IF;

  -- Auto-create income_entry if confirmer is a finalizer
  IF v_is_finalizer THEN
    -- Create income entry for the confirmed handover
    INSERT INTO public.income_entries (
      entry_type,
      source_type,
      source_id,
      cash_amount,
      upi_amount,
      total_amount,
      recorded_by,
      warehouse_id,
      handover_id,
      notes,
      created_at
    ) VALUES (
      'collection',
      'handover',
      p_handover_id,
      v_handover.cash_amount,
      v_handover.upi_amount,
      v_handover.cash_amount + v_handover.upi_amount,
      p_confirmed_by,
      v_warehouse_id,
      p_handover_id,
      COALESCE(
        'Handover from ' || (SELECT full_name FROM public.profiles WHERE user_id = v_handover.user_id),
        'Handover collection'
      ),
      now()
    )
    RETURNING income_entries.id INTO v_income_entry_id;

    -- Update finalizer's staff_cash_accounts (if exists)
    INSERT INTO public.staff_cash_accounts (
      user_id,
      warehouse_id,
      account_type,
      cash_balance,
      upi_balance,
      last_reset_at,
      created_at,
      updated_at
    ) VALUES (
      p_confirmed_by,
      v_warehouse_id,
      'prime_manager',
      v_handover.cash_amount,
      v_handover.upi_amount,
      now(),
      now(),
      now()
    )
    ON CONFLICT (user_id, account_type) DO UPDATE
    SET 
      cash_balance = public.staff_cash_accounts.cash_balance + EXCLUDED.cash_balance,
      upi_balance = public.staff_cash_accounts.upi_balance + EXCLUDED.upi_balance,
      updated_at = now();

    v_income_created := true;
  END IF;

  RETURN QUERY
  SELECT 
    v_handover.id,
    'confirmed'::TEXT,
    now(),
    v_income_created;
END;
$$;


-- Step 3: Finalizer daily reset RPC
-- Zeros out a finalizer's holding balance and creates an opening_balance income entry
CREATE OR REPLACE FUNCTION public.finalizer_daily_reset(
  p_finalizer_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE(
  reset_amount NUMERIC,
  income_entry_id UUID,
  success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash_balance NUMERIC := 0;
  v_upi_balance NUMERIC := 0;
  v_total NUMERIC := 0;
  v_warehouse_id UUID;
  v_income_id UUID;
  v_caller_id UUID;
BEGIN
  -- Determine caller (admin override or self-reset)
  v_caller_id := COALESCE(p_admin_id, p_finalizer_id);

  -- Verify caller is finalizer or super_admin
  IF p_admin_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = p_admin_id AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Only super_admin can trigger reset for another user';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.user_permissions 
      WHERE user_id = p_finalizer_id AND permission_key = 'finalizer' AND is_enabled = true
    ) THEN
      RAISE EXCEPTION 'User does not have finalizer permission';
    END IF;
  END IF;

  -- Get current balances from staff_cash_accounts
  SELECT 
    COALESCE(cash_balance, 0),
    COALESCE(upi_balance, 0),
    warehouse_id
  INTO v_cash_balance, v_upi_balance, v_warehouse_id
  FROM public.staff_cash_accounts
  WHERE user_id = p_finalizer_id AND account_type = 'prime_manager';

  v_total := v_cash_balance + v_upi_balance;

  -- Fallback warehouse
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;
  END IF;

  -- Only create entry if there's a balance to reset
  IF v_total > 0 THEN
    -- Create opening_balance income entry to record what was reset
    INSERT INTO public.income_entries (
      entry_type,
      source_type,
      cash_amount,
      upi_amount,
      total_amount,
      recorded_by,
      warehouse_id,
      notes,
      created_at
    ) VALUES (
      'opening_balance',
      'adjustment',
      v_cash_balance,
      v_upi_balance,
      v_total,
      v_caller_id,
      v_warehouse_id,
      'Daily reset - balance carried forward as income',
      now()
    )
    RETURNING income_entries.id INTO v_income_id;
  END IF;

  -- Reset staff_cash_accounts to 0
  UPDATE public.staff_cash_accounts
  SET 
    cash_balance = 0,
    upi_balance = 0,
    last_reset_at = now(),
    updated_at = now()
  WHERE user_id = p_finalizer_id AND account_type = 'prime_manager';

  -- Reset holding_balance on profiles  
  UPDATE public.profiles
  SET 
    holding_balance = 0,
    holding_balance_updated_at = now()
  WHERE user_id = p_finalizer_id;

  RETURN QUERY SELECT v_total, v_income_id, true;
END;
$$;


-- Step 4: Trigger function for finalizer self-sale income
-- When a finalizer records a sale with cash/UPI, create income_entry immediately
CREATE OR REPLACE FUNCTION public.auto_income_on_finalizer_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_finalizer BOOLEAN := false;
  v_warehouse_id UUID;
  v_cash_amount NUMERIC;
  v_upi_amount NUMERIC;
BEGIN
  -- Get cash/UPI amounts from the sale
  -- The sales table uses payment_method; we check if it's cash or UPI
  IF NEW.payment_method = 'cash' THEN
    v_cash_amount := NEW.payment_received;
    v_upi_amount := 0;
  ELSIF NEW.payment_method = 'upi' THEN
    v_cash_amount := 0;
    v_upi_amount := NEW.payment_received;
  ELSE
    -- No cash/UPI collection, nothing to record
    RETURN NEW;
  END IF;

  -- Only process if there's actual collection
  IF COALESCE(NEW.payment_received, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Check if recorder is a finalizer
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = NEW.recorded_by AND permission_key = 'finalizer' AND is_enabled = true
  ) INTO v_is_finalizer;

  IF NOT v_is_finalizer THEN
    RETURN NEW; -- Non-finalizer: normal flow (holdings tracked elsewhere)
  END IF;

  -- Get warehouse (from store → route → or first warehouse)
  SELECT COALESCE(
    (SELECT w.id FROM public.stores st 
     LEFT JOIN public.routes r ON r.id = st.route_id
     LEFT JOIN public.warehouses w ON true
     WHERE st.id = NEW.store_id LIMIT 1),
    (SELECT id FROM public.warehouses LIMIT 1)
  ) INTO v_warehouse_id;

  -- Create income_entry for the finalizer's self-sale collection
  INSERT INTO public.income_entries (
    entry_type,
    source_type,
    source_id,
    cash_amount,
    upi_amount,
    total_amount,
    recorded_by,
    warehouse_id,
    notes,
    created_at
  ) VALUES (
    'collection',
    'sale',
    NEW.id,
    v_cash_amount,
    v_upi_amount,
    v_cash_amount + v_upi_amount,
    NEW.recorded_by,
    v_warehouse_id,
    'Direct finalizer sale collection - ' || NEW.display_id,
    now()
  );

  -- Update finalizer's staff_cash_accounts
  INSERT INTO public.staff_cash_accounts (
    user_id,
    warehouse_id,
    account_type,
    cash_balance,
    upi_balance,
    last_reset_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.recorded_by,
    v_warehouse_id,
    'prime_manager',
    v_cash_amount,
    v_upi_amount,
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id, account_type) DO UPDATE
  SET 
    cash_balance = public.staff_cash_accounts.cash_balance + EXCLUDED.cash_balance,
    upi_balance = public.staff_cash_accounts.upi_balance + EXCLUDED.upi_balance,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create the trigger on sales table (fire AFTER INSERT)
DROP TRIGGER IF EXISTS trigger_finalizer_self_sale_income ON public.sales;
CREATE TRIGGER trigger_finalizer_self_sale_income
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.auto_income_on_finalizer_sale();


-- Step 5: Get finalizer income today (helper RPC for UI)
CREATE OR REPLACE FUNCTION public.get_finalizer_income_today(
  p_finalizer_id UUID
)
RETURNS TABLE(
  total_income NUMERIC,
  cash_income NUMERIC,
  upi_income NUMERIC,
  handover_count INTEGER,
  last_reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(ie.total_amount), 0)::NUMERIC AS total_income,
    COALESCE(SUM(ie.cash_amount), 0)::NUMERIC AS cash_income,
    COALESCE(SUM(ie.upi_amount), 0)::NUMERIC AS upi_income,
    COUNT(CASE WHEN ie.source_type = 'handover' THEN 1 END)::INTEGER AS handover_count,
    MAX(sca.last_reset_at) AS last_reset_at
  FROM public.income_entries ie
  LEFT JOIN public.staff_cash_accounts sca ON sca.user_id = p_finalizer_id AND sca.account_type = 'prime_manager'
  WHERE ie.recorded_by = p_finalizer_id
    AND ie.entry_type = 'collection'
    AND ie.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
END;
$$;


-- Step 6: Get all finalizers with their current holdings (for admin/manager overview)
CREATE OR REPLACE FUNCTION public.get_finalizer_holdings()
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  cash_balance NUMERIC,
  upi_balance NUMERIC,
  total_balance NUMERIC,
  last_reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.user_id,
    p.full_name,
    COALESCE(sca.cash_balance, 0) AS cash_balance,
    COALESCE(sca.upi_balance, 0) AS upi_balance,
    COALESCE(sca.cash_balance, 0) + COALESCE(sca.upi_balance, 0) AS total_balance,
    sca.last_reset_at
  FROM public.profiles p
  JOIN public.user_permissions up ON up.user_id = p.user_id 
    AND up.permission_key = 'finalizer' AND up.is_enabled = true
  LEFT JOIN public.staff_cash_accounts sca ON sca.user_id = p.user_id 
    AND sca.account_type = 'prime_manager'
  ORDER BY total_balance DESC;
END;
$$;

-- ============================================================
-- End of migration
-- ============================================================
