-- ==============================================
-- pg_cron Schedule: Daily Replenishment Worker
-- Runs at 6:00 AM IST daily
-- ==============================================

-- Enable extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the cron secret in business_settings
INSERT INTO business_settings (setting_key, setting_value, description)
VALUES ('daily_worker_cron_secret', 'crn_7xK9mP3vL5nQ8wR2tY6uJ4iH1oZ0fE_aB9cD2eF5gH8iJ1kL4mN7oP0qR3sT6uW9xY2zA5bC8dE1fG4hI7jK0lM3nP6qR9sT2vU5wX8yZ1', 'Secret for CRON-authorized access to daily-replenishment-worker')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = now();

-- Unschedule any existing job with the same name to avoid duplicates
SELECT cron.unschedule('daily-replenishment-worker');

-- Schedule the job: daily at 6:30 AM UTC
-- This is approximately 12:00 PM IST
SELECT cron.schedule(
    'daily-replenishment-worker',
    '30 6 * * *',
    $$
    SELECT net.http_post(
        url := 'https://vrhptrtgrpftycvojaqo.supabase.co/functions/v1/daily-replenishment-worker',
        headers := jsonb_object('X-Cron-Secret', 'crn_7xK9mP3vL5nQ8wR2tY6uJ4iH1oZ0fE_aB9cD2eF5gH8iJ1kL4mN7oP0qR3sT6uW9xY2zA5bC8dE1fG4hI7jK0lM3nP6qR9sT2vU5wX8yZ1')
    );
    $$
);
