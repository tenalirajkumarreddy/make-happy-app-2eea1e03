-- Migration: Route Optimization Schema
-- Phase 4: Scale & Polish - Issue #13
-- Created: 2026-04-16

-- Add geolocation columns to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC,
ADD COLUMN IF NOT EXISTS visit_priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_visit_duration INTEGER; -- in minutes

-- Create index for geolocation queries
CREATE INDEX IF NOT EXISTS idx_stores_location ON stores(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create route_sessions table
CREATE TABLE IF NOT EXISTS route_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  optimized_order UUID[] DEFAULT ARRAY[]::UUID[], -- Array of store IDs in optimal order
  estimated_duration INTEGER, -- minutes
  actual_duration INTEGER, -- minutes
  total_distance NUMERIC, -- km
  starting_location JSONB, -- {lat: number, lng: number}
  status TEXT DEFAULT 'planned', -- planned, active, completed, cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(agent_id, date)
);

-- Create indexes
CREATE INDEX idx_route_sessions_agent_date ON route_sessions(agent_id, date);
CREATE INDEX idx_route_sessions_status ON route_sessions(status);
CREATE INDEX idx_route_sessions_date ON route_sessions(date);

-- RLS policies for route_sessions
ALTER TABLE route_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own or their agents' route sessions
CREATE POLICY "Users can view route sessions"
ON route_sessions FOR SELECT
TO authenticated
USING (
  -- User can see their own routes
  agent_id = auth.uid()
  OR
  -- Managers can see routes of agents in their warehouses
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN user_roles agent_ur ON agent_ur.warehouse_id = ur.warehouse_id
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('super_admin', 'manager')
    AND agent_ur.user_id = route_sessions.agent_id
  )
  OR
  -- Super admin sees all
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Policy: Agents can create/update their own route sessions
CREATE POLICY "Agents can manage their own route sessions"
ON route_sessions FOR ALL
TO authenticated
USING (
  agent_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'manager')
  )
)
WITH CHECK (
  agent_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'manager')
  )
);

-- Function to calculate route metrics (estimated)
CREATE OR REPLACE FUNCTION calculate_route_metrics(
  p_store_ids UUID[],
  p_starting_lat NUMERIC DEFAULT NULL,
  p_starting_lng NUMERIC DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_distance NUMERIC := 0;
  v_total_duration INTEGER := 0;
  v_store_record RECORD;
  v_prev_lat NUMERIC;
  v_prev_lng NUMERIC;
  v_distance NUMERIC;
BEGIN
  -- Add time for each store visit
  SELECT COALESCE(SUM(avg_visit_duration), 0) + (array_length(p_store_ids, 1) * 15)
  INTO v_total_duration
  FROM stores
  WHERE id = ANY(p_store_ids);
  
  -- Calculate travel distance (simplified - uses haversine formula)
  IF p_starting_lat IS NOT NULL AND p_starting_lng IS NOT NULL THEN
    v_prev_lat := p_starting_lat;
    v_prev_lng := p_starting_lng;
  ELSE
    -- Use first store as starting point
    SELECT latitude, longitude 
    INTO v_prev_lat, v_prev_lng
    FROM stores 
    WHERE id = p_store_ids[1];
  END IF;
  
  FOR v_store_record IN 
    SELECT latitude, longitude, avg_visit_duration 
    FROM stores 
    WHERE id = ANY(p_store_ids)
    ORDER BY array_position(p_store_ids, id)
  LOOP
    IF v_store_record.latitude IS NOT NULL AND v_store_record.longitude IS NOT NULL 
       AND v_prev_lat IS NOT NULL AND v_prev_lng IS NOT NULL THEN
      -- Haversine formula
      v_distance := 2 * 6371 * asin(
        sqrt(
          (sin(radians((v_store_record.latitude - v_prev_lat) / 2))) ^ 2 +
          cos(radians(v_prev_lat)) * cos(radians(v_store_record.latitude)) *
          (sin(radians((v_store_record.longitude - v_prev_lng) / 2))) ^ 2
        )
      );
      v_total_distance := v_total_distance + v_distance;
      -- Add travel time (avg 30 km/h in city = 2 min per km)
      v_total_duration := v_total_duration + (v_distance * 2)::INTEGER;
    END IF;
    
    v_prev_lat := v_store_record.latitude;
    v_prev_lng := v_store_record.longitude;
  END LOOP;
  
  RETURN jsonb_build_object(
    'total_distance', ROUND(v_total_distance, 2),
    'estimated_duration', v_total_duration,
    'store_count', array_length(p_store_ids, 1)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to optimize route (simple nearest neighbor algorithm)
CREATE OR REPLACE FUNCTION optimize_route_nearest_neighbor(
  p_store_ids UUID[],
  p_starting_lat NUMERIC DEFAULT NULL,
  p_starting_lng NUMERIC DEFAULT NULL
) RETURNS UUID[] AS $$
DECLARE
  v_unvisited UUID[] := p_store_ids;
  v_optimized UUID[] := ARRAY[]::UUID[];
  v_current_lat NUMERIC;
  v_current_lng NUMERIC;
  v_nearest_id UUID;
  v_nearest_distance NUMERIC;
  v_distance NUMERIC;
  v_store_record RECORD;
BEGIN
  -- Set starting point
  IF p_starting_lat IS NOT NULL AND p_starting_lng IS NOT NULL THEN
    v_current_lat := p_starting_lat;
    v_current_lng := p_starting_lng;
  ELSE
    -- Use first store as starting point
    SELECT latitude, longitude 
    INTO v_current_lat, v_current_lng
    FROM stores 
    WHERE id = p_store_ids[1];
    v_unvisited := v_unvisited[2:array_length(v_unvisited, 1)];
    v_optimized := array_append(v_optimized, p_store_ids[1]);
  END IF;
  
  -- Nearest neighbor algorithm
  WHILE array_length(v_unvisited, 1) > 0 LOOP
    v_nearest_distance := NULL;
    v_nearest_id := NULL;
    
    FOR v_store_record IN 
      SELECT id, latitude, longitude 
      FROM stores 
      WHERE id = ANY(v_unvisited)
    LOOP
      IF v_store_record.latitude IS NOT NULL AND v_store_record.longitude IS NOT NULL THEN
        v_distance := 2 * 6371 * asin(
          sqrt(
            (sin(radians((v_store_record.latitude - v_current_lat) / 2))) ^ 2 +
            cos(radians(v_current_lat)) * cos(radians(v_store_record.latitude)) *
            (sin(radians((v_store_record.longitude - v_current_lng) / 2))) ^ 2
          )
        );
        
        IF v_nearest_distance IS NULL OR v_distance < v_nearest_distance THEN
          v_nearest_distance := v_distance;
          v_nearest_id := v_store_record.id;
        END IF;
      END IF;
    END LOOP;
    
    -- If no store with coordinates found, take first unvisited
    IF v_nearest_id IS NULL THEN
      v_nearest_id := v_unvisited[1];
      SELECT latitude, longitude 
      INTO v_current_lat, v_current_lng
      FROM stores 
      WHERE id = v_nearest_id;
    ELSE
      -- Update current position
      SELECT latitude, longitude 
      INTO v_current_lat, v_current_lng
      FROM stores 
      WHERE id = v_nearest_id;
    END IF;
    
    v_optimized := array_append(v_optimized, v_nearest_id);
    v_unvisited := array_remove(v_unvisited, v_nearest_id);
  END LOOP;
  
  RETURN v_optimized;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_route_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_route_sessions_updated_at ON route_sessions;
CREATE TRIGGER update_route_sessions_updated_at
  BEFORE UPDATE ON route_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_route_sessions_updated_at();

-- Comments
COMMENT ON TABLE route_sessions IS 'Optimized route sessions for field agents';
COMMENT ON COLUMN route_sessions.optimized_order IS 'Array of store IDs in optimal visiting order';
COMMENT ON COLUMN route_sessions.estimated_duration IS 'Estimated time in minutes including travel and visits';
COMMENT ON FUNCTION optimize_route_nearest_neighbor IS 'Simple nearest neighbor TSP approximation for route optimization';
