-- Migration: Fix function search_path mutable warnings
-- Based on Supabase security advisor findings
-- Date: 2026-04-19

-- This migration adds explicit search_path to security definer functions
-- to prevent search_path injection attacks

-- Function search_path should be set to 'public, pg_temp' or similar
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- Note: Functions need to be recreated with search_path
-- We'll use ALTER FUNCTION ... SET search_path where possible

-- =====================================================
-- Fix search_path on security-critical functions
-- =====================================================

-- Core transaction and sales functions
ALTER FUNCTION public.record_sale SET search_path = public, pg_temp;
ALTER FUNCTION public.record_transaction SET search_path = public, pg_temp;

-- Stock and inventory functions
ALTER FUNCTION public.record_stock_transfer SET search_path = public, pg_temp;
ALTER FUNCTION public.execute_stock_transfer SET search_path = public, pg_temp;
ALTER FUNCTION public.process_stock_return SET search_path = public, pg_temp;
ALTER FUNCTION public.record_stock_movement SET search_path = public, pg_temp;

-- Staff and warehouse functions
ALTER FUNCTION public.get_my_warehouse_id SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_staff_stock_derived_fields SET search_path = public, pg_temp;

-- Outstanding calculation functions
ALTER FUNCTION public.recalc_store_outstanding SET search_path = public, pg_temp;
ALTER FUNCTION public.recalc_running_balances SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_store_outstanding SET search_path = public, pg_temp;

-- Vendor functions
ALTER FUNCTION public.record_vendor_purchase SET search_path = public, pg_temp;
ALTER FUNCTION public.record_vendor_payment SET search_path = public, pg_temp;
ALTER FUNCTION public.update_vendor_balance SET search_path = public, pg_temp;

-- Price and costing functions
ALTER FUNCTION public.get_product_price SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_staff_inventory_value SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_overhead_per_unit SET search_path = public, pg_temp;
ALTER FUNCTION public.update_raw_material_wac SET search_path = public, pg_temp;

-- Display ID and utility functions
ALTER FUNCTION public.generate_display_id SET search_path = public, pg_temp;

-- Reporting and metrics functions
ALTER FUNCTION public.get_daily_metrics SET search_path = public, pg_temp;
ALTER FUNCTION public.get_metrics_time_series SET search_path = public, pg_temp;
ALTER FUNCTION public.get_store_performance SET search_path = public, pg_temp;
ALTER FUNCTION public.get_agent_performance SET search_path = public, pg_temp;
ALTER FUNCTION public.get_outstanding_aging SET search_path = public, pg_temp;

-- Validation and helper functions
ALTER FUNCTION public.validate_order_credit_limit SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_phone SET search_path = public, pg_temp;
ALTER FUNCTION public.check_duplicate_phone SET search_path = public, pg_temp;

-- Handover and expense functions
ALTER FUNCTION public.approve_expense_claim SET search_path = public, pg_temp;
ALTER FUNCTION public.create_adhoc_expense SET search_path = public, pg_temp;

-- Audit and utility functions
ALTER FUNCTION public.log_wac_cost_change SET search_path = public, pg_temp;
ALTER FUNCTION public.find_orphaned_sale_items SET search_path = public, pg_temp;
ALTER FUNCTION public.find_orphaned_order_items SET search_path = public, pg_temp;
ALTER FUNCTION public.find_store_customer_mismatches SET search_path = public, pg_temp;
ALTER FUNCTION public.find_miscalculated_sales SET search_path = public, pg_temp;
ALTER FUNCTION public.find_handover_mismatches SET search_path = public, pg_temp;

-- POS integration functions
ALTER FUNCTION public.auto_create_pos_store SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sale_stock_source SET search_path = public, pg_temp;
ALTER FUNCTION public.create_default_shop_on_warehouse SET search_path = public, pg_temp;

-- Protect system records
ALTER FUNCTION public.protect_pos_system_records SET search_path = public, pg_temp;

-- User management functions
ALTER FUNCTION public.handle_new_user SET search_path = public, pg_temp;
ALTER FUNCTION public.has_role SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_role SET search_path = public, pg_temp;

-- Customer functions
ALTER FUNCTION public.check_duplicate_customer_phone SET search_path = public, pg_temp;
ALTER FUNCTION public.link_auth_user_to_customer SET search_path = public, pg_temp;

-- BOM and manufacturing functions
ALTER FUNCTION public.upsert_bom SET search_path = public, pg_temp;
ALTER FUNCTION public.get_pieces_per_kg SET search_path = public, pg_temp;

-- Soft delete functions
ALTER FUNCTION public.soft_delete_handler SET search_path = public, pg_temp;
ALTER FUNCTION public.restore_deleted_record SET search_path = public, pg_temp;

-- Stock approval functions
ALTER FUNCTION public.approve_stock_return SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_stock_return SET search_path = public, pg_temp;

-- Payroll functions
ALTER FUNCTION public.update_payroll_total SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_payroll_item_change SET search_path = public, pg_temp;
ALTER FUNCTION public.process_payroll SET search_path = public, pg_temp;

-- Staff holding and inventory functions
ALTER FUNCTION public.get_user_holding_amount SET search_path = public, pg_temp;

-- Raw materials functions
ALTER FUNCTION public.sync_raw_material_current_stock SET search_path = public, pg_temp;

-- Update function
ALTER FUNCTION public.update_updated_at_column SET search_path = public, pg_temp;

-- Add comments documenting the security fix
COMMENT ON FUNCTION public.record_sale IS 'Records a sale with atomic outstanding calculation. search_path fixed 2026-04-19.';
COMMENT ON FUNCTION public.record_transaction IS 'Records a transaction payment. search_path fixed 2026-04-19.';
COMMENT ON FUNCTION public.record_stock_transfer IS 'Records stock transfer between warehouse and staff. search_path fixed 2026-04-19.';

-- Add migration metadata
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260419000002', 'fix_function_search_paths', now());
