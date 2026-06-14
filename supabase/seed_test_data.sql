-- ============================================================
-- TEST DATA SEED
-- Truncates all data tables (preserves users/auth/profiles)
-- and inserts mock data for testing features:
--   1. Alternate phone
--   2. Order waiting badge (timeAgo on POS)
--   3. Days-inactive badge (last_activity_at)
--   4. Quick reorder button
--   5. Stock color indicators
-- ============================================================
-- Run via: psql or Supabase SQL editor
-- WARNING: Truncates ALL data in all non-user tables.
-- ============================================================

SET session_replication_role = 'replica';

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN (
        'profiles', 'user_roles', 'user_permissions',
        'user_notification_preferences', 'user_order_access',
        'fcm_tokens', 'app_config', 'company_settings',
        'business_info', 'schema_audit', 'sms_jobs',
        'otp_rate_limits', 'otp_sessions', 'data_quality_issues'
      )
    ORDER BY table_name
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', tbl);
  END LOOP;
END $$;

ALTER TABLE public.warehouses DISABLE TRIGGER on_warehouse_created;
ALTER TABLE public.warehouses DISABLE TRIGGER trigger_create_default_shop;

DO $$
DECLARE
  v_creator_user_id UUID;
  v_warehouse_id UUID;
  v_cust_a_id UUID;
  v_cust_b_id UUID;
  v_store_r1_id UUID;
  v_store_r2_id UUID;
  v_store_w1_id UUID;
  v_prod_500ml UUID;
  v_prod_1l UUID;
  v_prod_250ml UUID;
  v_prod_soda UUID;
  v_store_type_pos UUID;
  v_store_type_retail UUID;
  v_store_type_restaurant UUID;
  v_store_type_wholesale UUID;
  v_route_1 UUID;
  v_route_2 UUID;
  v_route_session_id UUID;
  v_order_2 UUID;
  v_order_4 UUID;
BEGIN
  SELECT p.user_id INTO v_creator_user_id FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role IN ('super_admin', 'manager')
  ORDER BY p.created_at ASC LIMIT 1;

  IF v_creator_user_id IS NULL THEN
    SELECT p.user_id INTO v_creator_user_id FROM public.profiles p
    ORDER BY p.created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.store_types (id, name, order_type) VALUES
    (gen_random_uuid(), 'POS/Counter', 'simple'),
    (gen_random_uuid(), 'Retail', 'detailed'),
    (gen_random_uuid(), 'Restaurant', 'detailed'),
    (gen_random_uuid(), 'Wholesale', 'detailed')
  RETURNING id INTO v_store_type_pos;
  SELECT id INTO v_store_type_retail FROM public.store_types WHERE name = 'Retail';
  SELECT id INTO v_store_type_restaurant FROM public.store_types WHERE name = 'Restaurant';
  SELECT id INTO v_store_type_wholesale FROM public.store_types WHERE name = 'Wholesale';

  INSERT INTO public.warehouses (id, name, created_by, updated_by)
  VALUES (gen_random_uuid(), 'Main Warehouse', v_creator_user_id, v_creator_user_id)
  RETURNING id INTO v_warehouse_id;

  INSERT INTO public.product_categories (id, name) VALUES
    (gen_random_uuid(), 'Water'),
    (gen_random_uuid(), 'Soda');

  INSERT INTO public.products (id, name, sku, base_price, unit, category, min_stock_level, is_active, created_by, updated_by, warehouse_id) VALUES
    (gen_random_uuid(), 'Bisleri 500ml', 'WTR-500', 20, 'PCS', 'Water', 100, true, v_creator_user_id, v_creator_user_id, v_warehouse_id),
    (gen_random_uuid(), 'Bisleri 1L', 'WTR-1L', 35, 'PCS', 'Water', 50, true, v_creator_user_id, v_creator_user_id, v_warehouse_id),
    (gen_random_uuid(), 'Bisleri 250ml', 'WTR-250', 12, 'PCS', 'Water', 50, true, v_creator_user_id, v_creator_user_id, v_warehouse_id),
    (gen_random_uuid(), 'Coca Cola 300ml', 'SODA-300', 40, 'PCS', 'Soda', 20, true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_prod_500ml;
  SELECT id INTO v_prod_1l FROM public.products WHERE sku = 'WTR-1L';
  SELECT id INTO v_prod_250ml FROM public.products WHERE sku = 'WTR-250';
  SELECT id INTO v_prod_soda FROM public.products WHERE sku = 'SODA-300';

  INSERT INTO public.store_type_products (store_type_id, product_id) VALUES
    (v_store_type_retail, v_prod_500ml), (v_store_type_retail, v_prod_1l), (v_store_type_retail, v_prod_250ml), (v_store_type_retail, v_prod_soda),
    (v_store_type_restaurant, v_prod_500ml), (v_store_type_restaurant, v_prod_1l), (v_store_type_restaurant, v_prod_soda),
    (v_store_type_wholesale, v_prod_500ml), (v_store_type_wholesale, v_prod_1l), (v_store_type_wholesale, v_prod_250ml),
    (v_store_type_pos, v_prod_500ml), (v_store_type_pos, v_prod_1l), (v_store_type_pos, v_prod_250ml), (v_store_type_pos, v_prod_soda);

  INSERT INTO public.store_type_pricing (store_type_id, product_id, price) VALUES
    (v_store_type_retail, v_prod_500ml, 20), (v_store_type_retail, v_prod_1l, 35), (v_store_type_retail, v_prod_250ml, 12), (v_store_type_retail, v_prod_soda, 40),
    (v_store_type_restaurant, v_prod_500ml, 22), (v_store_type_restaurant, v_prod_1l, 38), (v_store_type_restaurant, v_prod_soda, 45),
    (v_store_type_wholesale, v_prod_500ml, 18), (v_store_type_wholesale, v_prod_1l, 32), (v_store_type_wholesale, v_prod_250ml, 10);

  INSERT INTO public.customers (id, display_id, name, phone, alternate_phone, address, is_active, created_by, updated_by, warehouse_id)
  VALUES (gen_random_uuid(), 'CUST-TEST-001', 'Rajesh Tea Stall', '9876543210', '9988776655', 'MG Road, Bangalore', true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_cust_a_id;

  INSERT INTO public.customers (id, display_id, name, phone, address, is_active, created_by, updated_by, warehouse_id)
  VALUES (gen_random_uuid(), 'CUST-TEST-002', 'Priya General Store', '9876543211', 'Indiranagar, Bangalore', true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_cust_b_id;

  INSERT INTO public.routes (id, name, store_type_id, warehouse_id, created_by, updated_by)
  VALUES (gen_random_uuid(), 'MG Road Route', v_store_type_retail, v_warehouse_id, v_creator_user_id, v_creator_user_id)
  RETURNING id INTO v_route_1;

  INSERT INTO public.routes (id, name, store_type_id, warehouse_id, created_by, updated_by)
  VALUES (gen_random_uuid(), 'Indiranagar Route', v_store_type_retail, v_warehouse_id, v_creator_user_id, v_creator_user_id)
  RETURNING id INTO v_route_2;

  INSERT INTO public.stores (id, name, display_id, customer_id, store_type_id, route_id, address, phone, outstanding, is_active, created_by, updated_by, warehouse_id)
  VALUES (gen_random_uuid(), 'Rajesh Tea Stall - MG Road', 'STR-000001', v_cust_a_id, v_store_type_retail, v_route_1, '42, MG Road, Bangalore', '9876543210', 1500, true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_store_r1_id;

  INSERT INTO public.stores (id, name, display_id, customer_id, store_type_id, route_id, address, phone, outstanding, is_active, created_by, updated_by, warehouse_id)
  VALUES (gen_random_uuid(), 'Rajesh Tea Stall - Koramangala', 'STR-000002', v_cust_a_id, v_store_type_restaurant, v_route_1, '5th Block, Koramangala, Bangalore', '9876543210', 500, true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_store_r2_id;

  INSERT INTO public.stores (id, name, display_id, customer_id, store_type_id, route_id, address, phone, outstanding, is_active, created_by, updated_by, warehouse_id)
  VALUES (gen_random_uuid(), 'Priya General Store - Indiranagar', 'STR-000003', v_cust_b_id, v_store_type_retail, v_route_2, '100 Feet Road, Indiranagar, Bangalore', '9876543211', 3200, true, v_creator_user_id, v_creator_user_id, v_warehouse_id)
  RETURNING id INTO v_store_w1_id;

  INSERT INTO public.product_stock (product_id, warehouse_id, quantity) VALUES
    (v_prod_500ml, v_warehouse_id, 500),
    (v_prod_1l, v_warehouse_id, 200),
    (v_prod_250ml, v_warehouse_id, 50),
    (v_prod_soda, v_warehouse_id, 0);

  INSERT INTO public.orders (id, display_id, store_id, customer_id, order_type, status, requirement_note, created_by, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'ORD-TEST-001', v_store_r1_id, v_cust_a_id, 'simple', 'pending', 'Need 10 cases of 500ml water', v_creator_user_id, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours', v_warehouse_id);

  INSERT INTO public.orders (id, display_id, store_id, customer_id, order_type, status, created_by, fulfilled_by, delivered_at, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'ORD-TEST-002', v_store_r2_id, v_cust_a_id, 'detailed', 'delivered', v_creator_user_id, v_creator_user_id, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', v_warehouse_id)
  RETURNING id INTO v_order_2;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES
    (v_order_2, v_prod_500ml, 5, 22), (v_order_2, v_prod_1l, 3, 38);

  INSERT INTO public.orders (id, display_id, store_id, customer_id, order_type, status, requirement_note, cancellation_reason, created_by, cancelled_by, cancelled_at, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'ORD-TEST-003', v_store_w1_id, v_cust_b_id, 'simple', 'cancelled', 'Need 20 crates of soda', 'Stock unavailable', v_creator_user_id, v_creator_user_id, NOW() - INTERVAL '6 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days', v_warehouse_id);

  INSERT INTO public.orders (id, display_id, store_id, customer_id, order_type, status, requirement_note, is_urgent, created_by, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'ORD-TEST-004', v_store_w1_id, v_cust_b_id, 'detailed', 'pending', 'URGENT: Need water immediately', true, v_creator_user_id, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', v_warehouse_id)
  RETURNING id INTO v_order_4;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES
    (v_order_4, v_prod_500ml, 10, 20), (v_order_4, v_prod_1l, 5, 35);

  INSERT INTO public.route_sessions (id, user_id, route_id, started_at, status)
  VALUES (gen_random_uuid(), v_creator_user_id, v_route_1, NOW() - INTERVAL '4 hours', 'active')
  RETURNING id INTO v_route_session_id;

  INSERT INTO public.sales (id, display_id, store_id, customer_id, recorded_by, total_amount, cash_amount, upi_amount, outstanding_amount, created_by, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'SAL-TEST-001', v_store_r1_id, v_cust_a_id, v_creator_user_id, 500, 300, 200, 0, v_creator_user_id, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours', v_warehouse_id);

  INSERT INTO public.sales (id, display_id, store_id, customer_id, recorded_by, total_amount, cash_amount, upi_amount, outstanding_amount, created_by, created_at, updated_at, warehouse_id)
  VALUES (gen_random_uuid(), 'SAL-TEST-002', v_store_r2_id, v_cust_a_id, v_creator_user_id, 800, 500, 0, 300, v_creator_user_id, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', v_warehouse_id);

  INSERT INTO public.store_visits (id, session_id, store_id, visited_at)
  VALUES (gen_random_uuid(), v_route_session_id, v_store_r1_id, NOW() - INTERVAL '3 hours');
END $$;

ALTER TABLE public.warehouses ENABLE TRIGGER on_warehouse_created;
ALTER TABLE public.warehouses ENABLE TRIGGER trigger_create_default_shop;
SET session_replication_role = 'origin';
