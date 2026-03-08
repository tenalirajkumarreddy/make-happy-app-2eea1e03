
-- Route sessions for agent tracking
CREATE TABLE public.route_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Store visits within a route session
CREATE TABLE public.store_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.route_sessions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  notes text,
  UNIQUE(session_id, store_id)
);

-- RLS for route_sessions
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.route_sessions FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR user_id = auth.uid()
);
CREATE POLICY "Users can insert own sessions" ON public.route_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sessions" ON public.route_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS for store_visits
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View visits" ON public.store_visits FOR SELECT TO authenticated USING (
  session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);
CREATE POLICY "Insert visits" ON public.store_visits FOR INSERT TO authenticated WITH CHECK (
  session_id IN (SELECT id FROM public.route_sessions WHERE user_id = auth.uid() AND status = 'active')
);

-- Function to check duplicate customer phone
CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers WHERE phone = NEW.phone AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid) AND is_active = true
  ) THEN
    RAISE EXCEPTION 'A customer with phone % already exists', NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_customer_phone_duplicate
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_customer_phone();
