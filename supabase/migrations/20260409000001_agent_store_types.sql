-- Create agent_store_types table for per-user store-type access control
-- Permissive default: no rows = unrestricted (sees all store types)
CREATE TABLE IF NOT EXISTS public.agent_store_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_type_id uuid NOT NULL REFERENCES public.store_types(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_type_id)
);

ALTER TABLE public.agent_store_types ENABLE ROW LEVEL SECURITY;

-- Admin/manager full access (has_role signature is (uuid, app_role))
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_store_types' AND policyname = 'Admin manage agent_store_types'
  ) THEN
    CREATE POLICY "Admin manage agent_store_types"
      ON public.agent_store_types FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager'));
  END IF;
END $$;

-- Staff can view their own rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_store_types' AND policyname = 'Staff view own agent_store_types'
  ) THEN
    CREATE POLICY "Staff view own agent_store_types"
      ON public.agent_store_types FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
