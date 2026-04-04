-- Performance indexes for common query patterns
-- These indexes improve query performance for frequently accessed tables

-- Sales table indexes
CREATE INDEX IF NOT EXISTS idx_sales_recorded_by ON sales(recorded_by);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_recorded_by ON transactions(recorded_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_store_id ON transactions(store_id);

-- Stores table indexes
CREATE INDEX IF NOT EXISTS idx_stores_customer_active ON stores(customer_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stores_route_id ON stores(route_id);

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Handovers table indexes
CREATE INDEX IF NOT EXISTS idx_handovers_user_id ON handovers(user_id);
CREATE INDEX IF NOT EXISTS idx_handovers_created_at ON handovers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handovers_status ON handovers(status) WHERE status = 'pending';

-- Store visits table indexes
CREATE INDEX IF NOT EXISTS idx_store_visits_store_id ON store_visits(store_id);

-- Expense claims table indexes
CREATE INDEX IF NOT EXISTS idx_expense_claims_user_id ON expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_expense_claims_created_at ON expense_claims(created_at DESC);

-- Activity log indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- Customers table indexes
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active) WHERE is_active = true;

-- User roles lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Profiles lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Notifications for unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
