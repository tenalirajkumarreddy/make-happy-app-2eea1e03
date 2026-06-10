-- Migration: Add missing RPCs for agent panel
-- update_transaction: Edit existing transactions (cash/UPI split + notes)
-- generate_random_display_id: Generate collision-safe random display IDs (used by payment returns)

-- 1. update_transaction RPC
-- Used by AgentHistory.tsx to edit a transaction's cash/UPI split and notes
-- Adjusts store outstanding balance by the difference in totals
CREATE OR REPLACE FUNCTION public.update_transaction(
  p_transaction_id UUID,
  p_cash_amount NUMERIC DEFAULT 0,
  p_upi_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_cash NUMERIC;
  v_old_upi NUMERIC;
  v_old_total NUMERIC;
  v_new_total NUMERIC;
  v_store_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT cash_amount, upi_amount, total_amount, store_id
  INTO v_old_cash, v_old_upi, v_old_total, v_store_id
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
  END IF;

  v_new_total := COALESCE(p_cash_amount, 0) + COALESCE(p_upi_amount, 0);

  IF v_new_total <= 0 THEN
    RAISE EXCEPTION 'Total payment must be positive';
  END IF;

  -- Adjust store outstanding by reversing old effect and applying new
  UPDATE public.stores
  SET outstanding = GREATEST(outstanding + v_old_total - v_new_total, 0)
  WHERE id = v_store_id;

  UPDATE public.transactions
  SET cash_amount = COALESCE(p_cash_amount, 0),
      upi_amount = COALESCE(p_upi_amount, 0),
      total_amount = v_new_total,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_transaction_id;

  PERFORM public.recalc_running_balances(v_store_id);
END;
$$;

-- 2. generate_random_display_id RPC
-- Used by ReturnPaymentDialog.tsx to generate unique display IDs for payment returns
-- Uses random alphanumeric with collision checking against the target table
CREATE OR REPLACE FUNCTION public.generate_random_display_id(
  p_prefix TEXT,
  p_table_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_id := p_prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE display_id = %L)', p_table_name, v_id) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_id;
END;
$$;
