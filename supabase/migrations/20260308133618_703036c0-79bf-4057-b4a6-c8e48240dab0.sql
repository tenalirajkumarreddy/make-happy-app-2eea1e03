
-- Product access matrix: which products are available for each store type
CREATE TABLE public.store_type_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_type_id, product_id)
);

-- Store-type level pricing overrides
CREATE TABLE public.store_type_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_type_id, product_id)
);

-- Per-store pricing overrides (highest priority)
CREATE TABLE public.store_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id)
);

-- RLS for store_type_products
ALTER TABLE public.store_type_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store type products" ON public.store_type_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type products" ON public.store_type_products FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for store_type_pricing
ALTER TABLE public.store_type_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store type pricing" ON public.store_type_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store type pricing" ON public.store_type_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for store_pricing
ALTER TABLE public.store_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view store pricing" ON public.store_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage store pricing" ON public.store_pricing FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Fix: allow customers to see their own stores
CREATE POLICY "Customers can view own stores" ON public.stores FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'customer'::app_role) AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
);

-- Allow customers to update their own KYC fields
CREATE POLICY "Customers can update own KYC" ON public.customers FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'customer'::app_role) AND user_id = auth.uid()
);
