-- Update calculate_holding_balance to deduct approved expenses
CREATE OR REPLACE FUNCTION public.calculate_holding_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales              NUMERIC;
  v_transactions       NUMERIC;
  v_received_handovers NUMERIC;
  v_sent_handovers     NUMERIC;
  v_expenses           NUMERIC;
BEGIN
  -- 1. Cash and UPI from unreturned sales
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sales 
  FROM public.sales 
  WHERE recorded_by = p_user_id 
    AND is_fully_returned = false 
    AND deleted_at IS NULL;

  -- 2. Cash and UPI from transactions
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_transactions 
  FROM public.transactions 
  WHERE recorded_by = p_user_id 
    AND deleted_at IS NULL;

  -- 3. Only CONFIRMED received handovers count as income
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_received_handovers
  FROM public.handovers
  WHERE handed_to = p_user_id AND status = 'confirmed';

  -- 4. Only CONFIRMED sent handovers count as deductions
  SELECT COALESCE(SUM(COALESCE(cash_amount, 0) + COALESCE(upi_amount, 0)), 0)
  INTO v_sent_handovers
  FROM public.handovers
  WHERE user_id = p_user_id AND status = 'confirmed';

  -- 5. Deduct approved expense claims
  SELECT COALESCE(SUM(COALESCE(approved_amount, amount)), 0)
  INTO v_expenses
  FROM public.expense_claims
  WHERE user_id = p_user_id AND status = 'approved';

  RETURN (v_sales + v_transactions + v_received_handovers) - v_sent_handovers - v_expenses;
END;
$$;

-- Trigger to recalculate holding balance when an expense claim is updated
CREATE OR REPLACE FUNCTION public.trigger_recalculate_balance_on_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_user_balance(NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_user_balance(NEW.user_id);
    IF OLD.user_id != NEW.user_id THEN
      PERFORM public.recalculate_user_balance(OLD.user_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_user_balance(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_balance_on_expense ON public.expense_claims;
CREATE TRIGGER trg_recalculate_balance_on_expense
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_balance_on_expense();
