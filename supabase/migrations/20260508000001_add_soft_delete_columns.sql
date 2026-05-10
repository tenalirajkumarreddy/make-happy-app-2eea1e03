-- Add soft delete (deleted_at) columns to all tables with hard deletes
-- This migration enables soft deletion across the entire application
-- Run time: ~2 seconds for ~18 tables

-- =============================================
-- BUSINESS-CRITICAL TABLES (9 tables)
-- =============================================

-- 1. warehouses - Inventory/fulfillment locations
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouses_deleted ON warehouses (deleted_at) WHERE deleted_at IS NULL;

-- 2. raw_materials - Core product catalog
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_materials_deleted ON raw_materials (deleted_at) WHERE deleted_at IS NULL;

-- 3. order_items - Order line items (revenue critical)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_deleted ON order_items (deleted_at) WHERE deleted_at IS NULL;

-- 4. invoice_items - Billing items (revenue critical)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_deleted ON invoice_items (deleted_at) WHERE deleted_at IS NULL;

-- 5. store_types - Customer segmentation rules
ALTER TABLE store_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_store_types_deleted ON store_types (deleted_at) WHERE deleted_at IS NULL;

-- 6. product_categories - Product hierarchy
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_deleted ON product_categories (deleted_at) WHERE deleted_at IS NULL;

-- 7. store_pricing - Store-specific pricing rules
ALTER TABLE store_pricing ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_store_pricing_deleted ON store_pricing (deleted_at) WHERE deleted_at IS NULL;

-- 8. vehicles - Logistics fleet management
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted ON vehicles (deleted_at) WHERE deleted_at IS NULL;

-- 9. users - Admin/staff accounts (managed separately, included for completeness)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users (deleted_at) WHERE deleted_at IS NULL;

-- =============================================
-- NON-CRITICAL / REFERENCE TABLES (9 tables)
-- =============================================

-- 10. promotional_banners - Marketing content
ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_promotional_banners_deleted ON promotional_banners (deleted_at) WHERE deleted_at IS NULL;

-- 11. banner_store_types - Banner to store type associations
ALTER TABLE banner_store_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_banner_store_types_deleted ON banner_store_types (deleted_at) WHERE deleted_at IS NULL;

-- 12. store_type_products - Store type product access rules
ALTER TABLE store_type_products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_store_type_products_deleted ON store_type_products (deleted_at) WHERE deleted_at IS NULL;

-- 13. store_type_pricing - Store type pricing rules
ALTER TABLE store_type_pricing ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_store_type_pricing_deleted ON store_type_pricing (deleted_at) WHERE deleted_at IS NULL;

-- 14. vendor_raw_materials - Vendor to material associations
ALTER TABLE vendor_raw_materials ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_raw_materials_deleted ON vendor_raw_materials (deleted_at) WHERE deleted_at IS NULL;

-- 15. raw_material_categories - Material category reference data
ALTER TABLE raw_material_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_material_categories_deleted ON raw_material_categories (deleted_at) WHERE deleted_at IS NULL;

-- 16. unit_conversions - Unit conversion reference data
ALTER TABLE unit_conversions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_unit_conversions_deleted ON unit_conversions (deleted_at) WHERE deleted_at IS NULL;

-- 17. store_qr_codes - Store QR code storage
ALTER TABLE store_qr_codes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_store_qr_codes_deleted ON store_qr_codes (deleted_at) WHERE deleted_at IS NULL;

-- 18. push_subscriptions - Web push notification subscriptions
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_deleted ON push_subscriptions (deleted_at) WHERE deleted_at IS NULL;

-- 19. staff_directory - Staff directory entries
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_directory_deleted ON staff_directory (deleted_at) WHERE deleted_at IS NULL;

-- 20. receipts - Receipt records
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_deleted ON receipts (deleted_at) WHERE deleted_at IS NULL;

-- =============================================
-- MIGRATION TRACKING
-- =============================================
-- This migration adds soft-delete capability to 20 tables
-- Total columns added: 20
-- Total indexes created: 20
-- Next step: Apply RLS policies or create filtered views (see migration 20260508000002)

-- =============================================
-- VERIFICATION QUERIES (run these to verify migration success)
-- =============================================
/*
-- Check column exists
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name = 'deleted_at' 
  AND table_name IN (
    'warehouses', 'raw_materials', 'order_items', 'invoice_items',
    'store_types', 'product_categories', 'store_pricing', 'vehicles',
    'promotional_banners', 'banner_store_types', 'store_type_products',
    'store_type_pricing', 'vendor_raw_materials', 'raw_material_categories',
    'unit_conversions', 'store_qr_codes', 'push_subscriptions', 'users',
    'staff_directory', 'receipts'
  )
ORDER BY table_name;

-- Count soft-deletable tables
SELECT COUNT(*) as total_soft_deletable_tables
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name = 'deleted_at';
*/
