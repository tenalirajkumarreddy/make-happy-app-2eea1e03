-- DB-backed rate limiting for edge functions
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id    TEXT NOT NULL,
  action     TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits (user_id, action, window_start);

-- Atomic rate limit check + increment
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id   TEXT,
  p_action    TEXT,
  p_max_count INTEGER,
  p_window_ms BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
  v_reset_time TIMESTAMPTZ;
  v_retry_after INTEGER;
BEGIN
  -- Calculate the current window start
  v_window_start := v_now - (p_window_ms || ' milliseconds')::INTERVAL;

  -- Clear stale entries for this user+action
  DELETE FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
    AND window_start < v_window_start
    AND window_start < v_now - INTERVAL '1 hour'; -- keep 1h of history

  -- Upsert: increment if within window, reset if expired
  INSERT INTO public.rate_limits (user_id, action, count, window_start, created_at, updated_at)
  VALUES (p_user_id, p_action, 1, v_now, v_now, v_now)
  ON CONFLICT (user_id, action) DO UPDATE SET
    count = CASE
      WHEN public.rate_limits.window_start < v_window_start THEN 1
      ELSE public.rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start < v_window_start THEN v_now
      ELSE public.rate_limits.window_start
    END,
    updated_at = v_now
  RETURNING count, window_start INTO v_count, v_reset_time;

  -- If over limit, return rejection
  IF v_count > p_max_count THEN
    v_retry_after := EXTRACT(EPOCH FROM (v_reset_time + (p_window_ms || ' milliseconds')::INTERVAL - v_now))::INTEGER;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after', v_retry_after
    );
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;
