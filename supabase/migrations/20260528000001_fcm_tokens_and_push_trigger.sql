-- Create fcm_tokens table if not exists (for schema versioning)
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY fcm_tokens_select_own ON public.fcm_tokens
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY fcm_tokens_insert_own ON public.fcm_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY fcm_tokens_delete_own ON public.fcm_tokens
  FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY fcm_tokens_service_role ON public.fcm_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  orders_enabled boolean DEFAULT true,
  sales_enabled boolean DEFAULT true,
  transfers_enabled boolean DEFAULT true,
  handovers_enabled boolean DEFAULT true,
  system_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences" ON public.user_notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Trigger: on notification insert push to FCM via edge function
CREATE OR REPLACE FUNCTION public.handle_notification_insert_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  supabase_url text;
  is_enabled boolean;
BEGIN
  -- Determine if this category is enabled by the user's notification preferences
  SELECT 
    CASE 
      WHEN NEW.type IN ('order', 'order_created', 'order_assigned', 'order_fulfilled') THEN COALESCE(p.orders_enabled, true)
      WHEN NEW.type IN ('payment', 'sales', 'sale') THEN COALESCE(p.sales_enabled, true)
      WHEN NEW.type IN ('stock_transfer', 'stock_request') THEN COALESCE(p.transfers_enabled, true)
      WHEN NEW.type IN ('handover') THEN COALESCE(p.handovers_enabled, true)
      ELSE COALESCE(p.system_enabled, true)
    END INTO is_enabled
  FROM (SELECT 1) dummy
  LEFT JOIN public.user_notification_preferences p ON p.user_id = NEW.user_id;

  -- Default to true if user has no record in the preferences table yet
  IF is_enabled IS NULL THEN
    is_enabled := true;
  END IF;

  -- Skip sending FCM push notification if disabled
  IF NOT is_enabled THEN
    RETURN NEW;
  END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://vrhptrtgrpftycvojaqo.supabase.co';
  END IF;

  PERFORM
    net.http_post(
      url := supabase_url || '/functions/v1/notify-fcm-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU'
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', NEW.message,
        'type', NEW.type,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id
      ),
      timeout_milliseconds := 10000
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_insert_fcm ON public.notifications;

CREATE TRIGGER trg_notification_insert_fcm
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_insert_fcm();
