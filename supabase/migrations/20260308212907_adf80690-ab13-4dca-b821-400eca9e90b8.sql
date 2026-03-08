
-- Add notes column to handovers
ALTER TABLE public.handovers ADD COLUMN IF NOT EXISTS notes text;

-- Create daily balance snapshots table
CREATE TABLE public.handover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  balance_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE public.handover_snapshots ENABLE ROW LEVEL SECURITY;

-- Staff can view their own snapshots, admins/managers can view all
CREATE POLICY "Users can view own snapshots"
ON public.handover_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
);

-- System inserts snapshots (via edge function with service role)
CREATE POLICY "System can insert snapshots"
ON public.handover_snapshots FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);
