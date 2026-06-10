-- Enable Realtime for the notifications table so that in-app notification delivery
-- works via Supabase Realtime subscriptions (useNotifications.ts, useRealtimeSync.ts).
-- Without this ALTER PUBLICATION, the client-side postgres_changes subscription
-- never receives INSERT/UPDATE events for notifications.
-- Ensure notifications table has REPLICA IDENTITY FULL so Supabase Realtime
-- sends complete row payloads for all events (INSERT, UPDATE, DELETE).
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Ensure notifications is in the Realtime publication.
-- Using IF NOT EXISTS makes this migration safe for re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
