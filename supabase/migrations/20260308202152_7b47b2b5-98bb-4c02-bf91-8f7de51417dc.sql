
CREATE TABLE public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  old_outstanding numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  adjustment_amount numeric NOT NULL DEFAULT 0,
  reason text,
  adjusted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view balance adjustments"
ON public.balance_adjustments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'agent') OR
  has_role(auth.uid(), 'marketer')
);

CREATE POLICY "Authorized staff can insert balance adjustments"
ON public.balance_adjustments
FOR INSERT
TO authenticated
WITH CHECK (adjusted_by = auth.uid());
