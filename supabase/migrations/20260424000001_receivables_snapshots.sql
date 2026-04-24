-- Daily Receivables Aging Snapshot
-- Captures point-in-time outstanding balance aging buckets per warehouse
-- Run via edge function: daily-receivables-snapshot

CREATE TABLE IF NOT EXISTS daily_receivables_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  bucket_current numeric NOT NULL DEFAULT 0,
  bucket_31_60 numeric NOT NULL DEFAULT 0,
  bucket_61_90 numeric NOT NULL DEFAULT 0,
  bucket_90_plus numeric NOT NULL DEFAULT 0,
  closing_outstanding numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, store_id)
);

CREATE INDEX IF NOT EXISTS idx_receivables_snapshots_date ON daily_receivables_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_receivables_snapshots_warehouse ON daily_receivables_snapshots(warehouse_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_receivables_snapshots_customer ON daily_receivables_snapshots(customer_id, snapshot_date DESC);

-- Daily Store Performance Snapshot (complementary to receivables aging)
CREATE TABLE IF NOT EXISTS daily_store_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  route_order int,
  sales_count int NOT NULL DEFAULT 0,
  sales_amount numeric NOT NULL DEFAULT 0,
  collections_amount numeric NOT NULL DEFAULT 0,
  credit_given numeric NOT NULL DEFAULT 0,
  new_outstanding numeric NOT NULL DEFAULT 0,
  closing_outstanding numeric NOT NULL DEFAULT 0,
  visited boolean,
  visited_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_snapshots_date ON daily_store_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_store_snapshots_route ON daily_store_snapshots(route_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_store_snapshots_warehouse ON daily_store_snapshots(warehouse_id, snapshot_date DESC);

-- Daily User Performance Snapshot
CREATE TABLE IF NOT EXISTS daily_user_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_count int NOT NULL DEFAULT 0,
  sales_amount numeric NOT NULL DEFAULT 0,
  collections_count int NOT NULL DEFAULT 0,
  collections_amount numeric NOT NULL DEFAULT 0,
  cash_collected numeric NOT NULL DEFAULT 0,
  upi_collected numeric NOT NULL DEFAULT 0,
  visits_count int NOT NULL DEFAULT 0,
  routes_covered int NOT NULL DEFAULT 0,
  expenses_approved numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_snapshots_date ON daily_user_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_snapshots_warehouse ON daily_user_snapshots(warehouse_id, snapshot_date DESC);

-- SQL function for computing receivables aging buckets
CREATE OR REPLACE FUNCTION compute_receivables_aging(
  p_date date DEFAULT current_date
)
RETURNS TABLE (
  store_id uuid,
  customer_id uuid,
  warehouse_id uuid,
  bucket_current numeric,
  bucket_31_60 numeric,
  bucket_61_90 numeric,
  bucket_90_plus numeric,
  closing_outstanding numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH last_payment AS (
    SELECT
      t.store_id,
      MAX(t.transaction_date) as last_payment_date
    FROM transactions t
    WHERE t.type = 'payment' AND t.transaction_date <= p_date
    GROUP BY t.store_id
  ),
  store_sales AS (
    SELECT
      s.store_id,
      s.id as sale_id,
      s.total_amount,
      s.created_at,
      s.outstanding_amount,
      st.customer_id,
      st.warehouse_id,
      st.outstanding as current_outstanding
    FROM sales s
    JOIN stores st ON st.id = s.store_id
    WHERE DATE(s.created_at) <= p_date
  ),
  aging AS (
    SELECT
      ss.store_id,
      ss.customer_id,
      ss.warehouse_id,
      ss.current_outstanding,
      CASE
        WHEN lp.last_payment_date IS NULL THEN ss.current_outstanding
        WHEN p_date - COALESCE(lp.last_payment_date, p_date::date) <= 30 THEN ss.current_outstanding
        ELSE 0
      END as bucket_current,
      CASE
        WHEN lp.last_payment_date IS NULL THEN 0
        WHEN p_date - lp.last_payment_date > 30 AND p_date - lp.last_payment_date <= 60 THEN ss.current_outstanding
        ELSE 0
      END as bucket_31_60,
      CASE
        WHEN lp.last_payment_date IS NULL THEN 0
        WHEN p_date - lp.last_payment_date > 60 AND p_date - lp.last_payment_date <= 90 THEN ss.current_outstanding
        ELSE 0
      END as bucket_61_90,
      CASE
        WHEN lp.last_payment_date IS NULL AND p_date - (SELECT MIN(created_at) FROM sales WHERE store_id = ss.store_id) > 90 THEN ss.current_outstanding
        WHEN lp.last_payment_date IS NOT NULL AND p_date - lp.last_payment_date > 90 THEN ss.current_outstanding
        ELSE 0
      END as bucket_90_plus
    FROM store_sales ss
    LEFT JOIN last_payment lp ON lp.store_id = ss.store_id
    WHERE ss.current_outstanding > 0
  )
  SELECT
    a.store_id,
    a.customer_id,
    a.warehouse_id,
    SUM(a.bucket_current) as bucket_current,
    SUM(a.bucket_31_60) as bucket_31_60,
    SUM(a.bucket_61_90) as bucket_61_90,
    SUM(a.bucket_90_plus) as bucket_90_plus,
    SUM(a.current_outstanding) as closing_outstanding
  FROM aging a
  GROUP BY a.store_id, a.customer_id, a.warehouse_id;
END;
$$;

-- SQL function for daily store snapshot
CREATE OR REPLACE FUNCTION compute_daily_store_snapshot(
  p_date date DEFAULT current_date
)
RETURNS TABLE (
  store_id uuid,
  route_id uuid,
  warehouse_id uuid,
  route_order int,
  sales_count int,
  sales_amount numeric,
  collections_amount numeric,
  credit_given numeric,
  new_outstanding numeric,
  closing_outstanding numeric,
  visited boolean,
  visited_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH day_sales AS (
    SELECT
      s.store_id,
      COUNT(*) as cnt,
      SUM(s.total_amount) as amt,
      SUM(s.outstanding_amount) as credit
    FROM sales s
    WHERE DATE(s.created_at) = p_date
    GROUP BY s.store_id
  ),
  day_collections AS (
    SELECT
      t.store_id,
      SUM(t.amount) as coll
    FROM transactions t
    WHERE t.type = 'payment' AND DATE(t.transaction_date) = p_date
    GROUP BY t.store_id
  ),
  day_visits AS (
    SELECT
      sv.store_id,
      true as visited,
      MIN(sv.visited_at) as visited_at
    FROM store_visits sv
    WHERE DATE(sv.visited_at) = p_date
    GROUP BY sv.store_id
  )
  SELECT
    st.id as store_id,
    st.route_id,
    st.warehouse_id,
    st.store_order as route_order,
    COALESCE(ds.cnt, 0) as sales_count,
    COALESCE(ds.amt, 0) as sales_amount,
    COALESCE(dc.coll, 0) as collections_amount,
    COALESCE(ds.credit, 0) as credit_given,
    COALESCE(ds.credit, 0) - COALESCE(dc.coll, 0) as new_outstanding,
    st.outstanding as closing_outstanding,
    COALESCE(dv.visited, false) as visited,
    dv.visited_at
  FROM stores st
  LEFT JOIN day_sales ds ON ds.store_id = st.id
  LEFT JOIN day_collections dc ON dc.store_id = st.id
  LEFT JOIN day_visits dv ON dv.store_id = st.id
  WHERE st.is_active = true;
END;
$$;

-- SQL function for daily user snapshot
CREATE OR REPLACE FUNCTION compute_daily_user_snapshot(
  p_date date DEFAULT current_date
)
RETURNS TABLE (
  user_id uuid,
  warehouse_id uuid,
  sales_count int,
  sales_amount numeric,
  collections_count int,
  collections_amount numeric,
  cash_collected numeric,
  upi_collected numeric,
  visits_count int,
  routes_covered int,
  expenses_approved numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.recorded_by, t.recorded_by) as user_id,
    COALESCE(s.warehouse_id, '00000000-0000-0000-0000-000000000001') as warehouse_id,
    COUNT(DISTINCT s.id) as sales_count,
    COALESCE(SUM(s.total_amount), 0) as sales_amount,
    COUNT(DISTINCT t.id) as collections_count,
    COALESCE(SUM(t.amount), 0) as collections_amount,
    COALESCE(SUM(CASE WHEN t.payment_method = 'cash' THEN t.amount ELSE 0 END), 0) as cash_collected,
    COALESCE(SUM(CASE WHEN t.payment_method = 'upi' THEN t.amount ELSE 0 END), 0) as upi_collected,
    0::int as visits_count,
    0::int as routes_covered,
    0::numeric as expenses_approved
  FROM (
    SELECT DISTINCT recorded_by, warehouse_id FROM sales WHERE DATE(created_at) = p_date
    UNION
    SELECT DISTINCT recorded_by, '00000000-0000-0000-0000-000000000001' FROM transactions WHERE DATE(transaction_date) = p_date
  ) base
  LEFT JOIN sales s ON s.recorded_by = base.recorded_by AND DATE(s.created_at) = p_date
  LEFT JOIN transactions t ON t.recorded_by = base.recorded_by AND DATE(t.transaction_date) = p_date AND t.type = 'payment'
  GROUP BY base.recorded_by;
END;
$$;