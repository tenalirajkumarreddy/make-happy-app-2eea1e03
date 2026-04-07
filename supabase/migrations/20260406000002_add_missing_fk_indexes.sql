-- Add missing foreign key indexes for performance
-- Foreign key columns without indexes cause full table scans on JOINs and CASCADE operations
-- This migration adds indexes to all FK columns identified in the audit

-- Expense claims
CREATE INDEX IF NOT EXISTS idx_expense_claims_original_category_id 
  ON expense_claims(original_category_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id 
  ON expenses(vendor_id);

-- Fixed cost payments
CREATE INDEX IF NOT EXISTS idx_fixed_cost_payments_expense_id 
  ON fixed_cost_payments(expense_id);
CREATE INDEX IF NOT EXISTS idx_fixed_cost_payments_fixed_cost_id 
  ON fixed_cost_payments(fixed_cost_id);

-- Fixed costs
CREATE INDEX IF NOT EXISTS idx_fixed_costs_vendor_id 
  ON fixed_costs(vendor_id);

-- Invoice items
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id 
  ON invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id 
  ON invoice_items(invoice_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_dispatch_warehouse_id 
  ON invoices(dispatch_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_store_id 
  ON invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id 
  ON invoices(customer_id);

-- Price change history
CREATE INDEX IF NOT EXISTS idx_price_change_history_changed_by 
  ON price_change_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_price_change_history_product_id 
  ON price_change_history(product_id);

-- Promotional banners
CREATE INDEX IF NOT EXISTS idx_promotional_banners_store_type_id 
  ON promotional_banners(store_type_id);

-- Purchase items
CREATE INDEX IF NOT EXISTS idx_purchase_items_raw_material_id 
  ON purchase_items(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id 
  ON purchase_items(purchase_id);

-- Purchase return items
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_purchase_item_id 
  ON purchase_return_items(purchase_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id 
  ON purchase_return_items(return_id);

-- Purchase returns
CREATE INDEX IF NOT EXISTS idx_purchase_returns_approved_by 
  ON purchase_returns(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_created_by 
  ON purchase_returns(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_id 
  ON purchase_returns(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_warehouse_id 
  ON purchase_returns(warehouse_id);

-- Purchases
CREATE INDEX IF NOT EXISTS idx_purchases_warehouse_id 
  ON purchases(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchases_vendor_id 
  ON purchases(vendor_id);

-- Route sessions
CREATE INDEX IF NOT EXISTS idx_route_sessions_route_id 
  ON route_sessions(route_id);
CREATE INDEX IF NOT EXISTS idx_route_sessions_agent_id 
  ON route_sessions(agent_id);

-- Routes
CREATE INDEX IF NOT EXISTS idx_routes_store_type_id 
  ON routes(store_type_id);

-- Sale items (critical - high volume table!)
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id 
  ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id 
  ON sale_items(product_id);

-- Sale return items
CREATE INDEX IF NOT EXISTS idx_sale_return_items_product_id 
  ON sale_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item_id 
  ON sale_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return_id 
  ON sale_return_items(return_id);

-- Sale returns
CREATE INDEX IF NOT EXISTS idx_sale_returns_approved_by 
  ON sale_returns(approved_by);
CREATE INDEX IF NOT EXISTS idx_sale_returns_created_by 
  ON sale_returns(created_by);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id 
  ON sale_returns(sale_id);

-- Stock movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id 
  ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id 
  ON stock_movements(product_id);

-- Store QR codes
CREATE INDEX IF NOT EXISTS idx_store_qr_codes_store_id 
  ON store_qr_codes(store_id);

-- Stores
CREATE INDEX IF NOT EXISTS idx_stores_store_type_id 
  ON stores(store_type_id);

-- Add composite indexes for common query patterns
-- Sales with customer and store (for reports)
CREATE INDEX IF NOT EXISTS idx_sales_customer_store_date 
  ON sales(customer_id, store_id, created_at DESC);

-- Transactions with customer and store (for reports)
CREATE INDEX IF NOT EXISTS idx_transactions_customer_store_date 
  ON transactions(customer_id, store_id, created_at DESC);

-- Store visits for route tracking
CREATE INDEX IF NOT EXISTS idx_store_visits_agent_date 
  ON store_visits(visited_by, visited_at DESC);

-- Handovers for agent tracking
CREATE INDEX IF NOT EXISTS idx_handovers_user_handed_to 
  ON handovers(user_id, handed_to, created_at DESC);

-- Comments for documentation
COMMENT ON INDEX idx_sale_items_sale_id IS 
  'Critical FK index - sale_items is high-volume table with frequent JOINs to sales';

COMMENT ON INDEX idx_sale_items_product_id IS 
  'Critical FK index - enables fast product aggregation queries';

COMMENT ON INDEX idx_invoices_customer_id IS 
  'Enables fast customer invoice lookups for customer portal and reports';
