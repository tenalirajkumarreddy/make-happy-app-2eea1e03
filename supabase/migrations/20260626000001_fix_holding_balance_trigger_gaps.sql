-- Migration: Fix holding balance trigger gaps and add missing trigger functions
-- Date: 2026-06-26
--
-- CRITICAL FIXES:
-- 1. Trigger functions update_holding_balance_on_sales() and update_holding_balance_on_transactions()
--    were referenced but NEVER DEFINED in any migration file. This caused all
--    sales/transaction INSERT operations to NOT update profiles.holding_balance.
--
-- 2. The existing triggers only fired on AFTER UPDATE, missing ~99% of balance
--    changes which happen on INSERT. We add AFTER INSERT triggers as well.
--
-- 3. confirm_handover() RPC did not update profiles.holding_balance on confirm.
--
-- 4. record_sale() and record_transaction() RPCs did not update
--    profiles.holding_balance on insert.
--
_queues:
-- =========================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. CREATE MISSING TRIGGER FUNCTIONS (CRITICAL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1a. update_holding_balance_on_sales
--     Fires on sales INSERT/UPDATE/DELETE to recalculate agent's holding balance
CREATE OR REPLACE FUNCTION public.update_holding_balance_on_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_new_balance NUMERIC;
    v_prev_balance NUMERIC;
BEGIN
    -- Determine the user_id whose balance needs updating
    IF TG_OP = 'DELETE' THEN
        v_user_id := OLD.recorded_by;
    ELSE
        v_user_id := NEW.recorded_by;
    END IF;

    -- Calculate the correct balance
    v_new_balance := public.calculate_holding_balance(v_user_id);

    -- Get previous cached balance for audit logging
    SELECT holding_balance INTO v_prev_balance
    FROM public.profiles
    WHERE user_id = v_user_id;

    -- Update the cached balance
    UPDATE public.profiles
    SET holding_balance = v_new_balance,
        holding_balance_updated_at = NOW()
    WHERE user_id = v_user_id;

    -- Log only if there was a meaningful change
    IF COALESCE(v_prev_balance, 0) IS DISTINCT FROM COALESCE(v_new_balance, 0) THEN
        INSERT INTO public.activity_logs (
            user_id, action, entity_type, entity_id, metadata
        ) VALUES (
            v_user_id,
            'Holding balance updated via sales trigger',
            'profile',
            v_user_id::text,
            jsonb_build_object(
                'trigger', TG_NAME,
                'operation', TG_OP,
                'previous_balance', v_prev_balance,
                'new_balance', v_new_balance,
                'sale_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
            )
        );
    END IF;

    -- Return appropriate row for trigger
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 1b. update_holding_balance_on_transactions
--     Fires on transactions INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.update_holding_balance_on_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_new_balance NUMERIC;
    v_prev_balance NUMERIC;
BEGIN
    -- Determine the user_id whose balance needs updating
    IF TG_OP = 'DELETE' THEN
        v_user_id := OLD.recorded_by;
    ELSE
        v_user_id := NEW.recorded_by;
    END IF;

    -- Calculate the correct balance
    v_new_balance := public.calculate_holding_balance(v_user_id);

    -- Get previous cached balance for audit logging
    SELECT holding_balance INTO v_prev_balance
    FROM public.profiles
    WHERE user_id = v_user_id;

    -- Update the cached balance
    UPDATE public.profiles
    SET holding_balance = v_new_balance,
        holding_balance_updated_at = NOW()
    WHERE user_id = v_user_id;

    -- Log only if there was a meaningful change
    IF COALESCE(v_prev_balance, 0) IS DISTINCT FROM COALESCE(v_new_balance, 0) THEN
        INSERT INTO public.activity_logs (
            user_id, action, entity_type, entity_id, metadata
        ) VALUES (
            v_user_id,
            'Holding balance updated via transactions trigger',
            'profile',
            v_user_id::text,
            jsonb_build_object(
                'trigger', TG_NAME,
                'operation', TG_OP,
                'previous_balance', v_prev_balance,
                'new_balance', v_new_balance,
                'transaction_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
            )
        );
    END IF;

    -- Return appropriate row for trigger
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. DROP AND RE-CREATE ALL HOLDING BALANCE TRIGGERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 2a. Sales triggers: INSERT + UPDATE of relevant columns
DROP TRIGGER IF EXISTS update_holding_balance_after_sales_insert ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_insert
    AFTER INSERT ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_holding_balance_on_sales();

DROP TRIGGER IF EXISTS update_holding_balance_after_sales_update ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_update
    AFTER UPDATE OF cash_amount, upi_amount, recorded_by, is_fully_returned, deleted_at ON public.sales
    FOR EACH ROW
    WHEN (
        (OLD.cash_amount IS DISTINCT FROM NEW.cash_amount)
        OR (OLD.upi_amount IS DISTINCT FROM NEW.upi_amount)
        OR (OLD.recorded_by IS DISTINCT FROM NEW.recorded_by)
        OR (OLD.is_fully_returned IS DISTINCT FROM NEW.is_fully_returned)
        OR (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    )
    EXECUTE FUNCTION public.update_holding_balance_on_sales();

DROP TRIGGER IF EXISTS update_holding_balance_after_sales_delete ON public.sales;
CREATE TRIGGER update_holding_balance_after_sales_delete
    AFTER DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_holding_balance_on_sales();

-- 2b. Transactions triggers: INSERT + UPDATE of relevant columns
DROP TRIGGER IF EXISTS update_holding_balance_after_transactions_insert ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transactions_insert
    AFTER INSERT ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_holding_balance_on_transactions();

DROP TRIGGER IF EXISTS update_holding_balance_after_transactions_update ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transactions_update
    AFTER UPDATE OF cash_amount, upi_amount, recorded_by, deleted_at ON public.transactions
    FOR EACH ROW
    WHEN (
        (OLD.cash_amount IS DISTINCT FROM NEW.cash_amount)
        OR (OLD.upi_amount IS DISTINCT FROM NEW.upi_amount)
        OR (OLD.recorded_by IS DISTINCT FROM NEW.recorded_by)
        OR (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    )
    EXECUTE FUNCTION public.update_holding_balance_on_transactions();

DROP TRIGGER IF EXISTS update_holding_balance_after_transactions_delete ON public.transactions;
CREATE TRIGGER update_holding_balance_after_transactions_delete
    AFTER DELETE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_holding_balance_on_transactions();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. RECONCILE ALL STALE HOLDING BALANCES (one-time fix)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
        v_old_balance := COALESCE(
            (SELECT holding_balance FROM public.profiles WHERE user_id = v_user.user_id),
            0
        );
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
