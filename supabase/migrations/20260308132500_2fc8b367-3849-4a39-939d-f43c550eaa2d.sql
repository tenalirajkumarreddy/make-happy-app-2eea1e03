
-- Fix overly permissive INSERT policy on activity_logs
DROP POLICY "System can insert activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
