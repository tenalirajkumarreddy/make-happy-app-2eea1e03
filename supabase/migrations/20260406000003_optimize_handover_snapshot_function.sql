-- Create aggregation function for daily handover snapshots
-- This replaces N+1 queries with a single optimized query

CREATE OR REPLACE FUNCTION get_daily_handover_aggregates(p_snapshot_date date)
RETURNS TABLE (
  user_id uuid,
  sales_total numeric,
  sent_confirmed_total numeric,
  sent_pending_total numeric,
  received_confirmed_total numeric,
  balance numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH staff_users AS (
    -- Get all staff users (non-customers)
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    WHERE ur.role != 'customer'
  ),
  sales_totals AS (
    -- Aggregate sales by user
    SELECT 
      s.recorded_by as user_id,
      COALESCE(SUM(s.cash_amount + s.upi_amount), 0) as total
    FROM sales s
    WHERE DATE(s.created_at) = p_snapshot_date
    GROUP BY s.recorded_by
  ),
  handovers_sent_confirmed AS (
    -- Aggregate confirmed handovers sent by user
    SELECT 
      h.user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) as total
    FROM handovers h
    WHERE h.status = 'confirmed'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.user_id
  ),
  handovers_sent_pending AS (
    -- Aggregate pending handovers sent by user
    SELECT 
      h.user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) as total
    FROM handovers h
    WHERE h.status = 'awaiting_confirmation'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.user_id
  ),
  handovers_received_confirmed AS (
    -- Aggregate confirmed handovers received by user
    SELECT 
      h.handed_to as user_id,
      COALESCE(SUM(h.cash_amount + h.upi_amount), 0) as total
    FROM handovers h
    WHERE h.status = 'confirmed'
      AND DATE(h.created_at) = p_snapshot_date
    GROUP BY h.handed_to
  )
  SELECT 
    su.user_id,
    COALESCE(st.total, 0) as sales_total,
    COALESCE(hsc.total, 0) as sent_confirmed_total,
    COALESCE(hsp.total, 0) as sent_pending_total,
    COALESCE(hrc.total, 0) as received_confirmed_total,
    -- Calculate balance: sales + received - sent_confirmed - sent_pending
    COALESCE(st.total, 0) + COALESCE(hrc.total, 0) - COALESCE(hsc.total, 0) - COALESCE(hsp.total, 0) as balance
  FROM staff_users su
  LEFT JOIN sales_totals st ON su.user_id = st.user_id
  LEFT JOIN handovers_sent_confirmed hsc ON su.user_id = hsc.user_id
  LEFT JOIN handovers_sent_pending hsp ON su.user_id = hsp.user_id
  LEFT JOIN handovers_received_confirmed hrc ON su.user_id = hrc.user_id
  ORDER BY su.user_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION get_daily_handover_aggregates(date) IS 
  'Optimized aggregation for daily handover snapshots. Replaces N+1 query pattern with single bulk query.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_daily_handover_aggregates(date) TO service_role;
