-- Add Row Level Security (RLS) policies and filtered views for soft-delete
-- This migration ensures deleted records are automatically hidden from queries
-- Run time: ~1 second for policies, views created instantly

-- =============================================
-- POLICY APPROACH (Recommended)
-- =============================================
-- Uncomment this section if using RLS policies to filter deleted records

/*
-- Enable RLS on all tables (if not already enabled)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotional_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_store_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_type_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_type_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies that automatically filter deleted records
CREATE POLICY "Select only active records" ON warehouses
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Select only active materials" ON raw_materials
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Select only active order items" ON order_items
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Select only active invoice items" ON invoice_items
  FOR SELECT USING (deleted_at IS NULL);

-- Repeat pattern for remaining tables...
*/

-- =============================================
-- VIEW APPROACH (Alternative)
-- =============================================
-- Use this approach if you prefer views over RLS policies
-- Views provide explicit opt-in vs implicit filtering

-- Business-critical tables
CREATE OR REPLACE VIEW active_warehouses AS
  SELECT * FROM warehouses WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_raw_materials AS
  SELECT * FROM raw_materials WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_order_items AS
  SELECT * FROM order_items WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_invoice_items AS
  SELECT * FROM invoice_items WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_store_types AS
  SELECT * FROM store_types WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_product_categories AS
  SELECT * FROM product_categories WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_store_pricing AS
  SELECT * FROM store_pricing WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_vehicles AS
  SELECT * FROM vehicles WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_users AS
  SELECT * FROM users WHERE deleted_at IS NULL;

-- Non-critical/reference tables
CREATE OR REPLACE VIEW active_promotional_banners AS
  SELECT * FROM promotional_banners WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_banner_store_types AS
  SELECT * FROM banner_store_types WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_store_type_products AS
  SELECT * FROM store_type_products WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_store_type_pricing AS
  SELECT * FROM store_type_pricing WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_vendor_raw_materials AS
  SELECT * FROM vendor_raw_materials WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_raw_material_categories AS
  SELECT * FROM raw_material_categories WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_unit_conversions AS
  SELECT * FROM unit_conversions WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_store_qr_codes AS
  SELECT * FROM store_qr_codes WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_push_subscriptions AS
  SELECT * FROM push_subscriptions WHERE deleted_at IS NULL;

-- =============================================
-- DENORMALIZED TABLE UPDATES
-- =============================================
-- If you have materialized views or cached denormalized data,
-- add triggers here to handle soft-delete propagation

-- Example: Update materialized views that cache soft-deletable data
/*
CREATE OR REPLACE FUNCTION handle_soft_delete_propagation()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh materialized views that depend on soft-deleted tables
  REFRESH MATERIALIZED VIEW CONCURRENTLY store_inventory_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY sales_dashboard_cache;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply to all soft-deletable tables
CREATE TRIGGER soft_delete_warehouses_propagate
  AFTER UPDATE OF deleted_at ON warehouses
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  EXECUTE FUNCTION handle_soft_delete_propagation();
*/

-- =============================================
-- BACKGROUND JOB OPTIMIZATION
-- =============================================
-- Add indexes for common soft-delete queries
CREATE INDEX IF NOT EXISTS idx_warehouses_deleted_at ON warehouses (deleted_at);
CREATE INDEX IF NOT EXISTS idx_raw_materials_deleted_at ON raw_materials (deleted_at);
CREATE INDEX IF NOT EXISTS idx_order_items_deleted_at ON order_items (deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoice_items_deleted_at ON invoice_items (deleted_at);

-- =============================================
-- COMMENTS AND DOCUMENTATION
-- =============================================
COMMENT ON COLUMN warehouses.deleted_at IS 'Soft delete timestamp. NULL = active, NOT NULL = deleted';
COMMENT ON COLUMN raw_materials.deleted_at IS 'Soft delete timestamp. NULL = active, NOT NULL = deleted';
COMMENT ON COLUMN order_items.deleted_at IS 'Soft delete timestamp. NULL = active, NOT NULL = deleted';

-- 19. staff_directory - Staff directory entries (new)
CREATE OR REPLACE VIEW active_staff_directory AS
  SELECT * FROM staff_directory WHERE deleted_at IS NULL;

-- 20. receipts - Receipt records (new)
CREATE OR REPLACE VIEW active_receipts AS
  SELECT * FROM receipts WHERE deleted_at IS NULL;

-- =============================================
-- MIGRATION COMPLETION
-- =============================================
-- This migration creates 20 filtered views for soft-deletable tables
-- Next step: Update frontend to use .update({ deleted_at: ... }) instead of .delete()
-- See frontend changes: update all .delete() calls to soft-delete pattern

-- =============================================
-- VERIFICATION QUERIES (run these to verify migration success)
-- =============================================
/*
-- Check views exist
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE 'active_%'
ORDER BY table_name;

-- Test soft-delete filtering
-- 1. First, check active count
SELECT COUNT(*) FROM active_warehouses;

-- 2. Then, mark one as deleted
UPDATE warehouses 
SET deleted_at = NOW() 
WHERE id = 'some-test-id';

-- 3. Verify active count decreased
SELECT COUNT(*) FROM active_warehouses;

-- 4. Verify total count unchanged
SELECT COUNT(*) FROM warehouses;
*/
