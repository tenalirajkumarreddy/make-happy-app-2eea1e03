-- Add missing performance indexes
-- Priority: frequently filtered/joined columns without indexes

-- store_visits: session lookup
CREATE INDEX IF NOT EXISTS idx_store_visits_session_id ON public.store_visits (session_id);

-- orders: warehouse scoping
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id ON public.orders (warehouse_id);

-- orders: assigned_to lookup
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- orders: created_by lookup
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders (created_by);

-- product_stock: product-level stock lookups
CREATE INDEX IF NOT EXISTS idx_product_stock_product_warehouse ON public.product_stock (product_id, warehouse_id);

-- staff_stock: composite for product lookups per user
CREATE INDEX IF NOT EXISTS idx_staff_stock_user_product ON public.staff_stock (user_id, product_id);

-- stock_transfers: requested_by scope
CREATE INDEX IF NOT EXISTS idx_stock_transfers_requested_by ON public.stock_transfers (requested_by)
  WHERE requested_by IS NOT NULL;

-- customers: credit limit filtering
CREATE INDEX IF NOT EXISTS idx_customers_credit_limit ON public.customers (credit_limit_override)
  WHERE credit_limit_override IS NOT NULL;

-- user_roles: role lookup for permission checks
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role) WHERE role IS NOT NULL;

-- sales: soft-delete filter
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at ON public.sales (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- transactions: soft-delete filter
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON public.transactions (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- stores: outstanding balance for risk reports
CREATE INDEX IF NOT EXISTS idx_stores_outstanding ON public.stores (outstanding)
  WHERE outstanding > 0;