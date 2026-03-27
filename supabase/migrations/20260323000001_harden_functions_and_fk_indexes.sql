-- Harden function search_path to satisfy security linter
ALTER FUNCTION public.handle_sale_inventory()
  SET search_path = public, extensions;

ALTER FUNCTION public.record_stock_movement(uuid, uuid, numeric, text, text, uuid)
  SET search_path = public, extensions;

-- Add covering indexes for foreign keys flagged by performance advisor
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_customer_id
  ON public.balance_adjustments (customer_id);

CREATE INDEX IF NOT EXISTS idx_balance_adjustments_store_id
  ON public.balance_adjustments (store_id);

CREATE INDEX IF NOT EXISTS idx_customers_kyc_verified_by
  ON public.customers (kyc_verified_by);

CREATE INDEX IF NOT EXISTS idx_customers_user_id
  ON public.customers (user_id);

CREATE INDEX IF NOT EXISTS idx_handovers_confirmed_by
  ON public.handovers (confirmed_by);

CREATE INDEX IF NOT EXISTS idx_handovers_handed_to
  ON public.handovers (handed_to);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by
  ON public.orders (cancelled_by);

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders (created_by);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_store_id
  ON public.orders (store_id);
