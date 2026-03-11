-- Ensure agent_routes table exists with enabled column
CREATE TABLE IF NOT EXISTS public.agent_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, route_id)
);

-- Add enabled column if it doesn't exist (idempotent)
ALTER TABLE public.agent_routes ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- RLS
ALTER TABLE public.agent_routes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_routes' AND policyname = 'Admin manage agent_routes'
  ) THEN
    CREATE POLICY "Admin manage agent_routes"
      ON public.agent_routes FOR ALL
      USING (public.has_role('super_admin', auth.uid()) OR public.has_role('manager', auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_routes' AND policyname = 'Staff view own agent_routes'
  ) THEN
    CREATE POLICY "Staff view own agent_routes"
      ON public.agent_routes FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
