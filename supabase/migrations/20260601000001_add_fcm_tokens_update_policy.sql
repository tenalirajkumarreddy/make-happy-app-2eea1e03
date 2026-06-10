-- Add missing UPDATE policy for fcm_tokens upserts
CREATE POLICY fcm_tokens_update_own ON public.fcm_tokens
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
