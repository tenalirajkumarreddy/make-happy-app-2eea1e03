-- Admin holding balance adjustment RPC
-- Allows admin to adjust the cash/UPI holding balance of any staff member

CREATE OR REPLACE FUNCTION public.adjust_staff_holding_balance(
  p_target_user_id UUID,
  p_admin_id UUID,
  p_cash_adjustment NUMERIC DEFAULT 0,
  p_upi_adjustment NUMERIC DEFAULT 0,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, cash_balance NUMERIC, upi_balance NUMERIC, total_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_account RECORD;
  v_new_cash NUMERIC;
  v_new_upi NUMERIC;
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_admin_id AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only admins can adjust holding balances';
  END IF;

  -- Check if target user has a staff role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_target_user_id AND role IN ('agent', 'marketer', 'operator', 'manager')
  ) THEN
    RAISE EXCEPTION 'Target user does not have a staff account';
  END IF;

  -- Get or create the staff cash account
  SELECT * INTO v_current_account
  FROM public.staff_cash_accounts
  WHERE user_id = p_target_user_id;

  IF v_current_account IS NULL THEN
    -- Create new account
    INSERT INTO public.staff_cash_accounts (user_id, cash_balance, upi_balance)
    VALUES (p_target_user_id, p_cash_adjustment, p_upi_adjustment)
    RETURNING * INTO v_current_account;
  ELSE
    -- Update existing account (allow negative balance for adjustments)
    UPDATE public.staff_cash_accounts
    SET cash_balance = COALESCE(cash_balance, 0) + p_cash_adjustment,
        upi_balance = COALESCE(upi_balance, 0) + p_upi_adjustment,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING * INTO v_current_account;
  END IF;

  v_new_cash := COALESCE(v_current_account.cash_balance, 0);
  v_new_upi := COALESCE(v_current_account.upi_balance, 0);

  -- Log the adjustment in income_entries for audit trail
  INSERT INTO public.income_entries (
    user_id, warehouse_id, source_type, source_id,
    cash_amount, upi_amount, total_amount,
    description, created_by
  )
  VALUES (
    p_target_user_id, NULL, 'adjustment', NULL,
    p_cash_adjustment, p_upi_adjustment, p_cash_adjustment + p_upi_adjustment,
    CASE 
      WHEN p_reason IS NOT NULL THEN 'Admin adjustment: ' || p_reason
      ELSE 'Admin holding balance adjustment by ' || (SELECT full_name FROM public.profiles WHERE user_id = p_admin_id)
    END,
    p_admin_id
  );

  RETURN QUERY SELECT 
    p_target_user_id,
    v_new_cash,
    v_new_upi,
    v_new_cash + v_new_upi;
END;
$$;