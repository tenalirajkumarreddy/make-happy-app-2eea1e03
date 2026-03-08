
-- Sales table
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  total_amount numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  outstanding_amount numeric NOT NULL DEFAULT 0,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sale items table
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions (payments) table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  order_type text NOT NULL DEFAULT 'simple',
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  requirement_note text,
  cancellation_reason text,
  cancelled_by uuid REFERENCES auth.users(id),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order items (for detailed orders)
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Handovers table
CREATE TABLE public.handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  handover_date date NOT NULL DEFAULT CURRENT_DATE,
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  handed_to uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, handover_date)
);

-- Updated at triggers
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_handovers_updated_at BEFORE UPDATE ON public.handovers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

-- Sales RLS
CREATE POLICY "Staff can view sales" ON public.sales FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'pos') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'pos')
  );
CREATE POLICY "Admin/Manager can update sales" ON public.sales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- Sale items RLS
CREATE POLICY "View sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (sale_id IN (SELECT id FROM public.sales));
CREATE POLICY "Insert sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (sale_id IN (SELECT id FROM public.sales));

-- Transactions RLS
CREATE POLICY "Staff can view transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'marketer') AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer')
  );
CREATE POLICY "Admin/Manager can update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager'));

-- Orders RLS
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can insert orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'marketer')
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR (has_role(auth.uid(), 'agent') AND status = 'pending')
    OR (has_role(auth.uid(), 'marketer') AND created_by = auth.uid())
    OR (has_role(auth.uid(), 'customer') AND customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  );

-- Order items RLS
CREATE POLICY "View order items" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Insert order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.orders));

-- Handovers RLS
CREATE POLICY "Users can view own handovers" ON public.handovers FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );
CREATE POLICY "Users can insert own handovers" ON public.handovers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users/managers can update handovers" ON public.handovers FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );

-- Enable realtime for orders (useful for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;
