-- ============================================================================
-- Add holding_balance column to profiles for unified cash tracking
-- This provides a single source of truth for user's cash holding
-- ============================================================================

-- Add holding_balance column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS holding_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS holding_balance_updated_at TIMESTAMPTZ DEFAULT NOW();

-- Grant permissions
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- ============================================================================
-- Function: Update holding balance (calculates fresh value)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_holding_balance(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales NUMERIC;
  v_transactions NUMERIC;
  v_received_handovers NUMERIC;
  v_sent_handovers NUMERIC;
BEGIN
  -- Sales recorded by user
  SELECT COALESCE(SUM(cash_amount) + SUM(upi_amount), 0)
  INTO v_sales
  FROM public.sales
  WHERE recorded_by = p_user_id;

  -- Transactions (collections) recorded by user
  SELECT COALESCE(SUM(cash_amount) + SUM(upi_amount), 0)
  INTO v_transactions
  FROM public.transactions
  WHERE recorded_by = p_user_id;

  -- Handovers received by user (confirmed)
  SELECT COALESCE(SUM(cash_amount) + SUM(upi_amount), 0)
  INTO v_received_handovers
  FROM public.handovers
  WHERE handed_to = p_user_id
  AND status = 'confirmed';

  -- Handovers sent by user (confirmed)
  SELECT COALESCE(SUM(cash_amount) + SUM(upi_amount), 0)
  INTO v_sent_handovers
  FROM public.handovers
  WHERE user_id = p_user_id
  AND status = 'confirmed';

  RETURN v_sales + v_transactions + v_received_handovers - v_sent_handovers;
END;
$$;

-- ============================================================================
-- Function: Sync holding balance to profiles table
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_holding_balance(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- Calculate fresh balance
  v_new_balance := public.calculate_holding_balance(p_user_id);

  -- Update profiles table
  UPDATE public.profiles
  SET 
    holding_balance = v_new_balance,
    holding_balance_updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- ============================================================================
-- Trigger: Update holding balance on sales change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_holding_balance_on_sales()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Determine which user to update
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.recorded_by;
  ELSE
    v_user_id := NEW.recorded_by;
  END IF;

  -- Only update if we have a valid user
  IF v_user_id IS NOT NULL THEN
    PERFORM public.sync_holding_balance(v_user_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for sales table
DROP TRIGGER IF EXISTS update_holding_balance_after_sales_insert ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_sales();

DROP TRIGGER IF EXISTS update_holding_balance_after_sales_update ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_update
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  WHEN (OLD.cash_amount IS DISTINCT FROM NEW.cash_amount 
     OR OLD.upi_amount IS DISTINCT FROM NEW.upi_amount
     OR OLD.recorded_by IS DISTINCT FROM NEW.recorded_by)
  EXECUTE FUNCTION public.update_holding_balance_on_sales();

DROP TRIGGER IF EXISTS update_holding_balance_after_sales_delete ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_delete
  AFTER DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_sales();

-- ============================================================================
-- Trigger: Update holding balance on transactions change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_holding_balance_on_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Determine which user to update
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.recorded_by;
  ELSE
    v_user_id := NEW.recorded_by;
  END IF;

  -- Only update if we have a valid user
  IF v_user_id IS NOT NULL THEN
    PERFORM public.sync_holding_balance(v_user_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for transactions table
DROP TRIGGER IF EXISTS update_holding_balance_after_transaction_insert ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transaction_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_transactions();

DROP TRIGGER IF EXISTS update_holding_balance_after_transaction_update ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transaction_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (OLD.cash_amount IS DISTINCT FROM NEW.cash_amount 
     OR OLD.upi_amount IS DISTINCT FROM NEW.upi_amount
     OR OLD.recorded_by IS DISTINCT FROM NEW.recorded_by)
  EXECUTE FUNCTION public.update_holding_balance_on_transactions();

DROP TRIGGER IF EXISTS update_holding_balance_after_transaction_delete ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transaction_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_transactions();

-- ============================================================================
-- Trigger: Update holding balance on handovers change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_holding_balance_on_handovers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_recipient_id UUID;
BEGIN
  -- Determine affected users
  IF TG_OP = 'DELETE' THEN
    v_sender_id := OLD.user_id;
    v_recipient_id := OLD.handed_to;
  ELSE
    v_sender_id := NEW.user_id;
    v_recipient_id := NEW.handed_to;
  END IF;

  -- Update sender's balance (if status changed or new handover)
  IF v_sender_id IS NOT NULL THEN
    PERFORM public.sync_holding_balance(v_sender_id);
  END IF;

  -- Update recipient's balance (if confirmed)
  IF v_recipient_id IS NOT NULL AND (
    TG_OP = 'INSERT' OR 
    TG_OP = 'DELETE' OR 
    OLD.status IS DISTINCT FROM NEW.status
  ) THEN
    PERFORM public.sync_holding_balance(v_recipient_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for handovers table
DROP TRIGGER IF EXISTS update_holding_balance_after_handover_insert ON public.handovers;
CREATE TRIGGER update_holding_balance_after_handover_insert
  AFTER INSERT ON public.handovers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_handovers();

DROP TRIGGER IF EXISTS update_holding_balance_after_handover_update ON public.handovers;
CREATE TRIGGER update_holding_balance_after_handover_update
  AFTER UPDATE ON public.handovers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
     OR OLD.cash_amount IS DISTINCT FROM NEW.cash_amount
     OR OLD.upi_amount IS DISTINCT FROM NEW.upi_amount)
  EXECUTE FUNCTION public.update_holding_balance_on_handovers();

DROP TRIGGER IF EXISTS update_holding_balance_after_handover_delete ON public.handovers;
CREATE TRIGGER update_holding_balance_after_handover_delete
  AFTER DELETE ON public.handovers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_holding_balance_on_handovers();

-- ============================================================================
-- Initialize holding_balance for all existing users
-- ============================================================================
DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.sync_holding_balance(v_user.user_id);
  END LOOP;
END;
$$;

-- ============================================================================
-- Update get_agent_cash_holding to use the materialized column
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_agent_cash_holding(p_user_id UUID)
RETURNS TABLE(
  sales_cash NUMERIC,
  sales_upi NUMERIC,
  transactions_cash NUMERIC,
  transactions_upi NUMERIC,
  total_collected NUMERIC,
  confirmed_handovers_cash NUMERIC,
  confirmed_handovers_upi NUMERIC,
  total_handed_over NUMERIC,
  net_holding NUMERIC,
  materialized_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_materialized NUMERIC;
BEGIN
  -- Get materialized balance
  SELECT COALESCE(holding_balance, 0) INTO v_materialized
  FROM public.profiles
  WHERE user_id = p_user_id;

  RETURN QUERY
  WITH sales_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.sales
    WHERE recorded_by = p_user_id
  ),
  transaction_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.transactions
    WHERE recorded_by = p_user_id
  ),
  handover_totals AS (
    SELECT
      COALESCE(SUM(cash_amount), 0) as cash,
      COALESCE(SUM(upi_amount), 0) as upi
    FROM public.handovers
    WHERE user_id = p_user_id
    AND status = 'confirmed'
  )
  SELECT
    s.cash as sales_cash,
    s.upi as sales_upi,
    t.cash as transactions_cash,
    t.upi as transactions_upi,
    (s.cash + s.upi + t.cash + t.upi) as total_collected,
    h.cash as confirmed_handovers_cash,
    h.upi as confirmed_handovers_upi,
    (h.cash + h.upi) as total_handed_over,
    COALESCE(v_materialized, 0) as net_holding,
    v_materialized as materialized_balance
  FROM sales_totals s, transaction_totals t, handover_totals h;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_holding_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_holding_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_cash_holding(UUID) TO authenticated;

-- ============================================================================
-- Add comment for documentation
-- ============================================================================
COMMENT ON COLUMN public.profiles.holding_balance IS 'Current cash holding amount - auto-updated via triggers on sales, transactions, and handovers';
COMMENT ON COLUMN public.profiles.holding_balance_updated_at IS 'Timestamp when holding_balance was last updated';
