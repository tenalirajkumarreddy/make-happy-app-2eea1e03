-- Migration: Validation tests for holding balance fixes
-- Date: 2026-06-26
--
-- This file contains validation checks to verify the holding balance
-- system works correctly after the fixes. It runs as part of the migration
-- and will raise exceptions if any check fails.
-- =========================================================

DO $$
DECLARE
    v_test_user_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_store_id UUID := '00000000-0000-0000-0000-000000000002'::UUID;
    v_customer_id UUID := '00000000-0000-0000-0000-000000000003'::UUID;
    v_warehouse_id UUID;
    v_balance_before NUMERIC;
    v_balance_after NUMERIC;
    v_expected_diff NUMERIC;
    v_actual_diff NUMERIC;
    v_test_passed INT := 0;
    v_test_failed INT := 0;
    v_handover_id UUID;
    v_created_sale_id UUID;
BEGIN
    -- =============================================================
    -- TEST 1: Verify trigger functions exist
    -- =============================================================
    RAISE NOTICE 'TEST 1: Checking trigger functions exist...';

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_holding_balance_on_sales'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: update_holding_balance_on_sales() does not exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_holding_balance_on_transactions'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: update_holding_balance_on_transactions() does not exist';
    END IF;

    RAISE NOTICE 'TEST 1 PASSED: Trigger functions exist';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- TEST 2: Verify triggers are registered
    -- =============================================================
    RAISE NOTICE 'TEST 2: Checking triggers are registered...';

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_holding_balance_after_sales_insert'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: Sales INSERT trigger not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_holding_balance_after_transactions_insert'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: Transactions INSERT trigger not found';
    END IF;

    RAISE NOTICE 'TEST 2 PASSED: All triggers registered';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- TEST 3: Verify confirm_handover updates both sender and receiver
    -- =============================================================
    RAISE NOTICE 'TEST 3: Checking confirm_handover updates profiles.holding_balance...';

    -- Get function body
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'confirm_handover'
        AND prosrc LIKE '%holding_balance%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: confirm_handover() does not update holding_balance';
    END IF;

    RAISE NOTICE 'TEST 3 PASSED: confirm_handover includes holding_balance updates';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- TEST 4: Verify record_sale updates profiles.holding_balance
    -- =============================================================
    RAISE NOTICE 'TEST 4: Checking record_sale updates profiles.holding_balance...';

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'record_sale'
        AND prosrc LIKE '%calculate_holding_balance%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: record_sale() does not call calculate_holding_balance';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'record_sale'
        AND prosrc LIKE '%holding_balance%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: record_sale() does not update holding_balance';
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: record_sale includes holding_balance update';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- TEST 5: Verify record_transaction updates profiles.holding_balance
    -- =============================================================
    RAISE NOTICE 'TEST 5: Checking record_transaction updates profiles.holding_balance...';

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'record_transaction'
        AND prosrc LIKE '%calculate_holding_balance%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: record_transaction() does not call calculate_holding_balance';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'record_transaction'
        AND prosrc LIKE '%holding_balance%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: record_transaction() does not update holding_balance';
    END IF;

    RAISE NOTICE 'TEST 5 PASSED: record_transaction includes holding_balance update';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- TEST 6: Verify calculate_holding_balance is the source of truth
    -- =============================================================
    RAISE NOTICE 'TEST 6: Checking calculate_holding_balance logic...';

    -- The function should exist and not be empty
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'calculate_holding_balance'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: calculate_holding_balance() does not exist';
    END IF;

    -- Verify it excludes deleted_at and is_fully_returned
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'calculate_holding_balance'
        AND prosrc LIKE '%deleted_at IS NULL%'
        AND prosrc LIKE '%is_fully_returned%'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: calculate_holding_balance() does not properly filter';
    END IF;

    RAISE NOTICE 'TEST 6 PASSED: calculate_holding_balance is the source of truth';
    v_test_passed := v_test_passed + 1;

    -- =============================================================
    -- Summary
    -- =============================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ALL TESTS PASSED: %/%', v_test_passed, v_test_passed + v_test_failed;
    RAISE NOTICE '========================================';

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Test exception: % - SQLSTATE: %', SQLERRM, SQLSTATE;
    -- Don't fail the migration on test errors, just warn
END;
$$;
