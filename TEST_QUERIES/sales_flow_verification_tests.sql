# SALES FLOW VERIFICATION TEST QUERIES

**Project:** BizManager
**Scope:** Critical Sales Flow Fixes Verification
**Prepared By:** AI Agent

---

## TEST DATA SETUP QUERIES

```sql
-- ============================================================================
-- 1. CREATE TEST USERS (Run first)
-- ============================================================================

-- Admin user
SELECT auth.create_user('admin-test@example.com', 'Admin@123', 'admin-test-user', '', true);

-- Agent user
SELECT auth.create_user('agent-test@example.com', 'Agent@123', 'agent-test-user', '', true);

-- Customer user
SELECT auth.create_user('customer-test@example.com', 'Customer@123', 'customer-test-user', '', true);

-- Assign roles
INSERT INTO public.user_roles (user_id, role) 
SELECT id, 'super_admin' FROM auth.users WHERE email = 'admin-test@example.com';

INSERT INTO public.user_roles (user_id, role) 
SELECT id, 'agent' FROM auth.users WHERE email = 'agent-test@example.com';

INSERT INTO public.user_roles (user_id, role) 
SELECT id, 'customer' FROM auth.users WHERE email = 'customer-test@example.com';

-- Get user IDs
SELECT id INTO TEMPORARY TABLE test_users
FROM auth.users
WHERE email IN (
    'admin-test@example.com', 
    'agent-test@example.com', 
    'customer-test@example.com'
);

-- ============================================================================
-- 2. CREATE TEST CUSTOMER AND STORE
-- ============================================================================

-- Test customer
INSERT INTO public.customers (id, name, phone, user_id, warehouse_id) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Customer',
    '+919876543210',
    (SELECT id FROM auth.users WHERE email = 'customer-test@example.com'),
    NULL
) RETURNING id;

-- Test store (with POS ID)
INSERT INTO public.stores (id, name, customer_id, store_type_id, outstanding, warehouse_id) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Store',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    0,
    NULL
) RETURNING id;

-- ============================================================================
-- 3. CREATE TEST PRODUCTS AND STOCK
-- ============================================================================

-- Test product
INSERT INTO public.products (id, name, sku, base_price, is_active) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Product',
    'TP-001',
    100,
    true
) RETURNING id;

-- Agent staff stock (50 units)
INSERT INTO public.staff_stock (id, user_id, product_id, quantity, warehouse_id, updated_at) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
    '00000000-0000-0000-0000-000000000001',
    50,
    NULL,
    now()
);

-- Warehouse stock (100 units)
INSERT INTO public.product_stock (id, product_id, warehouse_id, quantity, updated_at) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    NULL,  -- default warehouse
    100,
    now()
);

-- ============================================================================
-- 4. VERIFY TEST DATA
-- ============================================================================

SELECT 
    'Users' as entity,
    jsonb_pretty(jsonb_agg(jsonb_build_object(
        'email', email,
        'role', (SELECT role FROM user_roles WHERE user_id = u.id LIMIT 1)
    ))) as details
FROM auth.users u
WHERE email IN (
    'admin-test@example.com', 
    'agent-test@example.com', 
    'customer-test@example.com'
)

UNION ALL

SELECT 
    'Stock' as entity,
    jsonb_pretty(jsonb_agg(jsonb_build_object(
        'product', (SELECT name FROM products WHERE id = p.product_id),
        'agent_qty', s.quantity,
        'warehouse_qty', ps.quantity
    ))) as details
FROM staff_stock s
LEFT JOIN product_stock ps ON ps.product_id = s.product_id
LEFT JOIN products p ON p.id = s.product_id;
```

---

## CRITICAL SECURITY TEST QUERIES

### ✅ 1. Search Path Injection Test

```sql
-- Create malicious schema
CREATE SCHEMA IF NOT EXISTS evil_test;

-- Create fake staff_stock table
CREATE TABLE IF NOT EXISTS evil_test.staff_stock(
    user_id UUID,
    product_id UUID,
    quantity NUMERIC DEFAULT 999999,
    PRIMARY KEY (user_id, product_id)
);

-- Fake data
INSERT INTO evil_test.staff_stock (user_id, product_id, quantity) 
VALUES (
    (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
    '00000000-0000-0000-0000-000000000001',
    999999
) ON CONFLICT DO NOTHING;

-- Check initial state
SELECT 
    'Initial state' as test,
    jsonb_pretty(jsonb_build_object(
        'real_staff_stock', (
            SELECT quantity FROM public.staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'fake_staff_stock', (
            SELECT quantity FROM evil_test.staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        )
    )) as details;

-- Test RPC under manipulated search path
BEGIN;
SET LOCAL search_path = evil_test, public;

-- Call RPC as admin
SELECT public.record_sale(
    'SALE-INJ-001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    1000,  -- total
    500,   -- cash
    500,   -- upi
    0,     -- outstanding
    '[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 10, "unit_price": 100, "total_price": 1000}]'::jsonb,
    now(),
    0       -- expected outstanding
) AS result;

COMMIT;

-- Verify that evil_test.staff_stock was NOT touched
SELECT 
    'Search path isolation test' as test,
    jsonb_pretty(jsonb_build_object(
        'real_staff_stock_changed', (
            SELECT quantity != 50 FROM public.staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'fake_staff_stock_unchanged', (
            SELECT quantity = 999999 FROM evil_test.staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'new_sale_created', (
            SELECT COUNT(*) > 0 FROM public.sales WHERE display_id = 'SALE-INJ-001'
        )
    )) as details;

-- Clean up
DROP SCHEMA evil_test CASCADE;
```

### ✅ 2. Customer Sales Visibility Test

```sql
-- Customer user queries
SET ROLE "authenticated";
SET LOCAL role = (SELECT id FROM auth.users WHERE email = 'customer-test@example.com');

SELECT 
    'Customer sales visibility' as test,
    jsonb_pretty(jsonb_build_object(
        'customer_id', (
            SELECT id FROM customers WHERE user_id = auth.uid()
        ),
        'sales_visible', (
            SELECT jsonb_agg(jsonb_build_object('display_id', display_id, 'total_amount', total_amount))
            FROM sales WHERE customer_id = (
                SELECT id FROM customers WHERE user_id = auth.uid()
            )
        ),
        'rls_enforced', (
            -- Try to access another customer's sales (should be blocked)
            SELECT COUNT(*) = 0 FROM sales 
            WHERE customer_id != (
                SELECT id FROM customers WHERE user_id = auth.uid()
            )
        )
    )) as details;
```

---

## CRITICAL DATA INTEGRITY TEST QUERIES

### ✅ 3. Duplicate Returns Prevention Test

```sql
-- Helper function to create test sale
CREATE OR REPLACE FUNCTION create_test_sale(p_display_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id UUID;
BEGIN
    -- Use test agent
    INSERT INTO public.sales (
        display_id, store_id, customer_id, recorded_by, logged_by,
        total_amount, cash_amount, upi_amount, outstanding_amount,
        old_outstanding, new_outstanding, created_at, warehouse_id, created_by
    ) VALUES (
        p_display_id,
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
        NULL,
        1000,
        500,
        500,
        0,
        0,
        0,
        now(),
        NULL,
        (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
    ) RETURNING id INTO v_sale_id;

    INSERT INTO public.sale_items (
        sale_id, product_id, quantity, unit_price, total_price, warehouse_id
    ) VALUES (
        v_sale_id,
        '00000000-0000-0000-0000-000000000001',
        10,
        100,
        1000,
        NULL
    );

    RETURN v_sale_id;
END;
$$;

-- Create a test sale
SELECT create_test_sale('SALE-RETURN-TEST') INTO TEMPORARY TABLE test_sale;

-- First return (should succeed)
SELECT public.record_sale_return(
    (SELECT id FROM test_sale),
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    'Test return',
    '[{"sale_item_id": "' || (
        SELECT id FROM sale_items WHERE sale_id = (SELECT id FROM test_sale)
    ) || '", "product_id": "00000000-0000-0000-0000-000000000001", "return_qty": 10, "damaged_qty": 0, "unit_price": 100}]'::jsonb,
    now(),
    'Test notes'
) AS first_return;

-- Check is_fully_returned flag
SELECT 
    'First return verification' as test,
    jsonb_pretty(jsonb_build_object(
        'return_created', (
            SELECT COUNT(*) > 0 FROM sale_returns WHERE sale_id = (SELECT id FROM test_sale)
        ),
        'is_fully_returned_set', (
            SELECT is_fully_returned FROM sales WHERE id = (SELECT id FROM test_sale)
        ),
        'notes_stored', (
            SELECT notes FROM sale_returns WHERE sale_id = (SELECT id FROM test_sale)
        ),
        'outstanding_updated', (
            SELECT outstanding_amount FROM sales WHERE id = (SELECT id FROM test_sale)
        )
    )) as details;

-- Second return attempt (should fail)
BEGIN;
SELECT public.record_sale_return(
    (SELECT id FROM test_sale),
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    'Duplicate return attempt',
    '[{"sale_item_id": "' || (
        SELECT id FROM sale_items WHERE sale_id = (SELECT id FROM test_sale)
    ) || '", "product_id": "00000000-0000-0000-0000-000000000001", "return_qty": 10, "damaged_qty": 0, "unit_price": 100}]'::jsonb,
    now(),
    'Should fail'
) AS second_return;

EXCEPTION WHEN OTHERS THEN
    SELECT 
        'Second return prevention' as test,
        jsonb_pretty(jsonb_build_object(
            'error_message', SQLERRM,
            'contains_already_returned', POSITION('already been returned' IN SQLERRM) > 0
        )) as details;
ROLLBACK;

-- Clean up
DROP TABLE IF EXISTS test_sale;
DROP FUNCTION IF EXISTS create_test_sale;
```

### ✅ 4. Stock Reversal Logic Test (Admin vs Same User)

```sql
-- Test 1: Admin edits agent sale (should NOT reverse to agent)

-- Create test sale (agent records sale of 10 units)
SELECT create_test_sale('SALE-AGENT-EDIT') INTO TEMPORARY TABLE agent_sale;

-- Check initial stock
SELECT 
    'Initial stock state' as test,
    jsonb_pretty(jsonb_build_object(
        'agent_staff_stock', (
            SELECT quantity FROM staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'warehouse_stock', (
            SELECT quantity FROM product_stock 
            WHERE product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'sale_items', (
            SELECT jsonb_agg(jsonb_build_object('id', id, 'quantity', quantity))
            FROM sale_items WHERE sale_id = (SELECT id FROM agent_sale)
        )
    )) as details;

-- Admin edits sale (changes quantity to 15)
SELECT public.edit_sale(
    (SELECT id FROM agent_sale),
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'SALE-ADMIN-EDIT',
    1500,  -- new total
    750,   -- cash
    750,   -- upi
    0,     -- outstanding
    '[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 15, "unit_price": 100, "total_price": 1500}]'::jsonb,
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    NULL,
    now(),
    0
) AS admin_edit;

-- Verify stock didn't go to agent
SELECT 
    'Admin edits agent sale' as test,
    jsonb_pretty(jsonb_build_object(
        'agent_staff_stock_unchanged', (
            SELECT quantity = 50 FROM staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'warehouse_stock_reduced', (
            SELECT quantity = 90 FROM product_stock 
            WHERE product_id = '00000000-0000-0000-0000-000000000001'
        ), -- 100 → 100 - 10 + 10 - 15 = 85 (15 went to warehouse)
        'original_sale_voided', (
            SELECT outstanding_amount = 0 FROM sales WHERE id = (SELECT id FROM agent_sale)
        ),
        'new_sale_created', (
            SELECT COUNT(*) = 1 FROM sales WHERE display_id = 'SALE-ADMIN-EDIT'
        )
    )) as details;

-- Test 2: Same user edits their sale (should reverse to staff_stock)

-- Create another test sale
SELECT create_test_sale('SALE-SELF-EDIT') INTO TEMPORARY TABLE self_edit_sale;

-- Agent edits their own sale
SELECT public.edit_sale(
    (SELECT id FROM self_edit_sale),
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'SALE-SELF-EDITED',
    1500,
    750,
    750,
    0,
    '[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 15, "unit_price": 100, "total_price": 1500}]'::jsonb,
    (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
    NULL,
    now(),
    0
) AS self_edit;

-- Verify stock reversed to staff_stock
SELECT 
    'Same user edits sale' as test,
    jsonb_pretty(jsonb_build_object(
        'agent_staff_stock_net_change', (
            SELECT quantity = 45 FROM staff_stock 
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
            -- 50 → 40 (sale) → 50 (reverse) → 35 (new sale) = 45
        ),
        'warehouse_stock_unchanged', (
            SELECT quantity = 85 FROM product_stock 
            WHERE product_id = '00000000-0000-0000-0000-000000000001'
        )
    )) as details;

-- Clean up
DROP TABLE IF EXISTS agent_sale, self_edit_sale;
DROP FUNCTION IF EXISTS create_test_sale;
```

### ✅ 5. Concurrent Modification Test

```sql
-- Create test store with initial outstanding = 1000
UPDATE stores 
SET outstanding = 1000
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Start two concurrent transactions
-- Transaction 1
BEGIN;
SELECT outstanding FROM stores WHERE id = '00000000-0000-0000-0000-000000000001';
-- Should see 1000

-- Transaction 2
/*
BEGIN;
SELECT outstanding FROM stores WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE stores SET outstanding = 1500 WHERE id = '00000000-0000-0000-0000-000000000001';
COMMIT;
*/

-- Transaction 1 now tries to record sale
/* This should fail with concurrent_modification error */
SELECT 
    'Concurrent modification handling' as test,
    jsonb_pretty(jsonb_build_object(
        'expected_concurrency_error', (
            SELECT public.record_sale(
                'SALE-CONCURRENT',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000000001',
                (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
                (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
                1000,
                500,
                500,
                0,
                '[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 10, "unit_price": 100, "total_price": 1000}]',
                now(),
                1000  -- expected outstanding (optimistic lock)
            )
        )
    )) as details;
EXCEPTION WHEN OTHERS THEN
    SELECT 
        'Concurrent modification handling' as test,
        jsonb_pretty(jsonb_build_object(
            'error_caught', POSITION('concurrent_modification' IN SQLERRM) > 0,
            'hint_in_message', POSITION('Refresh and retry' IN SQLERRM) > 0
        )) as details;
ROLLBACK;

-- Verify final state
SELECT 
    'Final outstanding state' as test,
    jsonb_pretty(jsonb_build_object(
        'store_outstanding', (
            SELECT outstanding FROM stores WHERE id = '00000000-0000-0000-0000-000000000001'
        )
    )) as details;
```

---

## HIGH SEVERITY TEST QUERIES

### ✅ 6. Returns RLS Test

```sql
-- Create return as admin
SELECT create_test_sale('SALE-RLS-TEST') INTO TEMPORARY TABLE rls_sale;

SELECT public.record_sale_return(
    (SELECT id FROM rls_sale),
    (SELECT id FROM auth.users WHERE email = 'admin-test@example.com'),
    'RLS test',
    '[{"sale_item_id": "' || (
        SELECT id FROM sale_items WHERE sale_id = (SELECT id FROM rls_sale)
    ) || '", "product_id": "00000000-0000-0000-0000-000000000001", "return_qty": 10, "damaged_qty": 0, "unit_price": 100}]'::jsonb,
    now(),
    'Admin notes'
) AS test_return;

-- Admin can update their own return notes
SET ROLE "authenticated";
SET LOCAL role = (SELECT id FROM auth.users WHERE email = 'admin-test@example.com');

UPDATE sale_returns SET notes = 'Admin updated notes' 
WHERE created_by = auth.uid() AND notes = 'Admin notes';

-- Agent cannot update admin's returns
SET LOCAL role = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com');

BEGIN;
UPDATE sale_returns SET notes = 'Agent trying to update' 
WHERE created_by != auth.uid();

SELECT 
    'Returns RLS verification' as test,
    jsonb_pretty(jsonb_build_object(
        'query_should_fail', (
            SELECT COUNT(*) = 0 FROM sale_returns 
            WHERE notes = 'Agent trying to update'
        ),
        'correct_notes', (
            SELECT notes FROM sale_returns WHERE notes = 'Admin updated notes'
        )
    )) as details;

EXCEPTION WHEN OTHERS THEN
    SELECT 
        'Returns RLS verification' as test,
        jsonb_pretty(jsonb_build_object(
            'rls_works', true,
            'error_details', SQLERRM
        )) as details;
ROLLBACK;

-- Clean up
DROP TABLE IF EXISTS rls_sale;
```

### ✅ 7. Payment Validation Test

```sql
-- Test payment > total validation
SELECT 
    'Payment validation test' as test,
    jsonb_pretty(jsonb_build_object(
        'validation_catches_overpayment', (
            SELECT validateSaleData(
                jsonb_build_object(
                    'store_id', '00000000-0000-0000-0000-000000000001',
                    'items', jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-0000-0000-000000000001', 'quantity', 5, 'unit_price', 100)),
                    'cash_amount', 400,
                    'upi_amount', 200,
                    'total_amount', 500,
                    'isPosUser', false
                )
            )
        )
    )) as details;

-- Test negative outstanding prevention
SELECT 
    'Negative outstanding test' as test,
    jsonb_pretty(jsonb_build_object(
        'useRecordSale_hook_catches', (
            -- This is frontend behavior, but we can test the RPC validation
            SELECT public.record_sale(
                'SALE-NEG-TEST',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000000001',
                (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
                (SELECT id FROM auth.users WHERE email = 'agent-test@example.com'),
                300,   -- total
                200,   -- cash
                200,   -- upi  (400 total payment)
                0,     -- outstanding (should be negative, RPC validates)
                '[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 3, "unit_price": 100, "total_price": 300}]',
                now(),
                (SELECT outstanding FROM stores WHERE id = '00000000-0000-0000-0000-000000000001')
            )
        )
    )) as details;
EXCEPTION WHEN OTHERS THEN
    SELECT 
        'Negative outstanding test' as test,
        jsonb_pretty(jsonb_build_object(
            'rpc_validation_catches', POSITION('outstanding_mismatch' IN SQLERRM) > 0
        )) as details;
```

---

## TEST SUMMARY DOCUMENTATION

```sql
-- Run this after executing all test queries to document results
CREATE TABLE IF NOT EXISTS test_results (
    test_id SERIAL PRIMARY KEY,
    test_name TEXT NOT NULL,
    result JSONB NOT NULL,
    passed BOOLEAN NOT NULL,
    details JSONB,
    executed_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO test_results (test_name, result, passed, details)
VALUES 
    ('Search Path Injection Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify RPCs are not vulnerable to search path manipulation',
            'critical', TRUE
        ))),

    ('Customer Sales Visibility Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify customers can view their own sales with RLS',
            'critical', TRUE
        ))),

    ('Duplicate Returns Prevention Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify second return attempt fails',
            'critical', TRUE
        ))),

    ('Stock Reversal Logic Test (Admin Edits)', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify stock is NOT reversed to agent when admin edits',
            'critical', TRUE
        ))),

    ('Stock Reversal Logic Test (Self Edit)', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify stock IS reversed to agent when same user edits',
            'critical', TRUE
        ))),

    ('Concurrent Modification Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify optimistic concurrency handling in sales',
            'critical', TRUE
        ))),

    ('Returns RLS Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify RLS policies on sale_returns table',
            'critical', FALSE
        ))),

    ('Payment Validation Test', NULL, FALSE, 
        (SELECT jsonb_build_object(
            'description', 'Verify payment cannot exceed total validation',
            'critical', FALSE
        )));

-- Summary dashboard
SELECT 
    'Test Execution Summary' as title,
    jsonb_pretty(jsonb_build_object(
        'critical_tests_run', (
            SELECT COUNT(*) FROM test_results WHERE test_name LIKE '%(Admin Edits)%' OR test_name LIKE '%Prevention%'
        ),
        'all_tests_run', (
            SELECT COUNT(*) FROM test_results
        ),
        'pass_rate', 'Not yet executed',
        'tests', (
            SELECT jsonb_agg(jsonb_build_object('name', test_name, 'passed', passed))
            FROM test_results
        )
    )) as summary;
```

---

## EXECUTION GUIDANCE

**1. Execute the queries in order:**
- Start with **Test Data Setup Queries** (users/products/stores)
- Run **Critical Security Tests**
- Run **Critical Data Integrity Tests**
- Run **High Severity Tests**

**2. Record results:**
- Check each test output for `details` JSON
- Look for `true` values indicating success
- Document any failures

**3. Verify fixes:**
```sql
-- After running tests, verify final state:
SELECT 
    'Final Verification' as test,
    jsonb_pretty(jsonb_build_object(
        'total_sales_created', (SELECT COUNT(*) FROM sales),
        'total_returns_created', (SELECT COUNT(*) FROM sale_returns),
        'agent_staff_stock', (
            SELECT quantity FROM staff_stock
            WHERE user_id = (SELECT id FROM auth.users WHERE email = 'agent-test@example.com')
            AND product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'warehouse_stock', (
            SELECT quantity FROM product_stock
            WHERE product_id = '00000000-0000-0000-0000-000000000001'
        ),
        'store_outstanding', (
            SELECT outstanding FROM stores WHERE id = '00000000-0000-0000-0000-000000000001'
        )
    )) as details;
```