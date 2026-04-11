-- ============================================================================
-- MIGRATION: Warehouse-Scoped Multi-Tenancy + Staff Stock Holding System
-- ============================================================================
-- Applied via Supabase MCP on 2026-04-11

-- ADD warehouse_id TO key tables
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.stores     ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.sales      ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.customers  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_warehouse   ON public.user_roles(warehouse_id)   WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stores_warehouse        ON public.stores(warehouse_id)        WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_warehouse         ON public.sales(warehouse_id)         WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_warehouse  ON public.transactions(warehouse_id)  WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_warehouse     ON public.customers(warehouse_id)     WHERE warehouse_id IS NOT NULL;

-- CREATE staff_stock TABLE
CREATE TABLE IF NOT EXISTS public.staff_stock (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id UUID        NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity     NUMERIC     NOT NULL DEFAULT 0,
  is_negative  BOOLEAN     NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_stock_user      ON public.staff_stock(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_warehouse  ON public.staff_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_product   ON public.staff_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_staff_stock_negative  ON public.staff_stock(is_negative) WHERE is_negative = true;
ALTER TABLE public.staff_stock ENABLE ROW LEVEL SECURITY;

-- CREATE stock_transfers TABLE
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id        TEXT        UNIQUE NOT NULL,
  transfer_type     TEXT        NOT NULL CHECK (transfer_type IN (
                                  'warehouse_to_staff', 'staff_to_warehouse',
                                  'staff_to_staff', 'warehouse_to_warehouse'
                                )),
  from_warehouse_id UUID        REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  from_user_id      UUID        REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_warehouse_id   UUID        REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_user_id        UUID        REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id        UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity          NUMERIC     NOT NULL CHECK (quantity > 0),
  description       TEXT,
  reference_id      TEXT,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_user      ON public.stock_transfers(from_user_id)      WHERE from_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_user        ON public.stock_transfers(to_user_id)        WHERE to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse ON public.stock_transfers(from_warehouse_id) WHERE from_warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse   ON public.stock_transfers(to_warehouse_id)   WHERE to_warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_product        ON public.stock_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at     ON public.stock_transfers(created_at DESC);
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- HELPER: get_my_warehouse_id()
CREATE OR REPLACE FUNCTION public.get_my_warehouse_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT warehouse_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_my_warehouse_id() TO authenticated;

-- RLS: staff_stock
CREATE POLICY "super_admin_all_staff_stock"   ON public.staff_stock FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "manager_view_staff_stock"       ON public.staff_stock FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'manager' AND ur.warehouse_id = staff_stock.warehouse_id));
CREATE POLICY "staff_view_own_stock"           ON public.staff_stock FOR SELECT USING (user_id = auth.uid());

-- RLS: stock_transfers
CREATE POLICY "super_admin_all_stock_transfers"    ON public.stock_transfers FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "manager_view_stock_transfers"       ON public.stock_transfers FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'manager' AND (ur.warehouse_id = stock_transfers.from_warehouse_id OR ur.warehouse_id = stock_transfers.to_warehouse_id)));
CREATE POLICY "staff_view_own_transfers"           ON public.stock_transfers FOR SELECT USING (from_user_id = auth.uid() OR to_user_id = auth.uid());
CREATE POLICY "authenticated_insert_stock_transfers" ON public.stock_transfers FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','manager','agent','marketer')));

-- RPC: record_stock_transfer (see 20260411000002 for the full RPC body applied via MCP)
