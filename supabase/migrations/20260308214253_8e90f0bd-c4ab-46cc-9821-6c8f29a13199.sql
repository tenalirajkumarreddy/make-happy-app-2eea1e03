
-- Fix SELECT policy: allow handed_to user to see handovers sent to them
DROP POLICY IF EXISTS "Users can view own handovers" ON public.handovers;
CREATE POLICY "Users can view own handovers" ON public.handovers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
  OR handed_to = auth.uid()
);

-- Fix UPDATE policy: allow handed_to user to confirm/reject
DROP POLICY IF EXISTS "Users/managers can update handovers" ON public.handovers;
CREATE POLICY "Users/managers can update handovers" ON public.handovers
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
  OR handed_to = auth.uid()
);
