
CREATE TABLE public.store_qr_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL,
  payee_name TEXT,
  raw_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(upi_id)
);

ALTER TABLE public.store_qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view store QR codes" ON public.store_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert store QR codes" ON public.store_qr_codes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'agent'::app_role) OR has_role(auth.uid(), 'marketer'::app_role));
CREATE POLICY "Admin can update store QR codes" ON public.store_qr_codes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admin can delete store QR codes" ON public.store_qr_codes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
