
-- Activity logs table
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );

CREATE POLICY "System can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Company settings table
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view settings" ON public.company_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage settings" ON public.company_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Seed default company settings
INSERT INTO public.company_settings (key, value) VALUES
  ('company_name', 'BizManager Corp'),
  ('gst_number', ''),
  ('customer_care_number', ''),
  ('address', ''),
  ('location_validation', 'false'),
  ('auto_orders', 'false'),
  ('push_notifications', 'false'),
  ('partial_collections', 'false');

-- Index for activity logs
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
