
CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'agent',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage invitations"
  ON public.staff_invitations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Managers can view invitations"
  ON public.staff_invitations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));
