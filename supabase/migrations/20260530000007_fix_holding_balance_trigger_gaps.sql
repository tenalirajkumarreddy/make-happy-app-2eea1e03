-- Migration: Fix holding balance trigger gaps — cover is_fully_returned and deleted_at changes
-- Date: 2026-05-30
--
-- PROBLEM: The UPDATE trigger on sales only fires on cash_amount/upi_amount/recorded_by changes.
-- When record_sale_return sets is_fully_returned=true, or when a sale is soft-deleted (deleted_at),
-- the profiles.holding_balance is never recalculated → stale cached values.
--
-- Same issue on transactions — deleted_at changes not covered.

-- 1. Fix sales UPDATE trigger: add is_fully_returned and deleted_at to WHEN clause
DROP TRIGGER IF EXISTS update_holding_balance_after_sales_update ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_update
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  WHEN (
    (old.cash_amount IS DISTINCT FROM new.cash_amount)
    OR (old.upi_amount IS DISTINCT FROM new.upi_amount)
    OR (old.recorded_by IS DISTINCT FROM new.recorded_by)
    OR (old.is_fully_returned IS DISTINCT FROM new.is_fully_returned)
    OR (old.deleted_at IS DISTINCT FROM new.deleted_at)
  )
  EXECUTE FUNCTION public.update_holding_balance_on_sales();

-- 2. Fix transactions UPDATE trigger: add deleted_at to WHEN clause
DROP TRIGGER IF EXISTS update_holding_balance_after_transaction_update ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transaction_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (
    (old.cash_amount IS DISTINCT FROM new.cash_amount)
    OR (old.upi_amount IS DISTINCT FROM new.upi_amount)
    OR (old.recorded_by IS DISTINCT FROM new.recorded_by)
    OR (old.deleted_at IS DISTINCT FROM new.deleted_at)
  )
  EXECUTE FUNCTION public.update_holding_balance_on_transactions();

-- 3. Reconcile all stale holding balances
DO $$
DECLARE
  v_user RECORD;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_count INT := 0;
  v_fixed INT := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id FROM public.profiles
    WHERE user_id IS NOT NULL
  LOOP
    v_old_balance := COALESCE((SELECT holding_balance FROM public.profiles WHERE user_id = v_user.user_id), 0);
    v_new_balance := public.calculate_holding_balance(v_user.user_id);
    v_count := v_count + 1;

    IF v_old_balance != v_new_balance THEN
      UPDATE public.profiles
      SET holding_balance = v_new_balance,
          holding_balance_updated_at = NOW()
      WHERE user_id = v_user.user_id;

      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Reconciled % profiles, fixed % stale holding balances', v_count, v_fixed;
END;
$$;
