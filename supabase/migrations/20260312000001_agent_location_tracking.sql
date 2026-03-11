-- Add current location columns to route_sessions for real-time agent tracking
ALTER TABLE public.route_sessions
  ADD COLUMN IF NOT EXISTS current_lat double precision,
  ADD COLUMN IF NOT EXISTS current_lng double precision,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
