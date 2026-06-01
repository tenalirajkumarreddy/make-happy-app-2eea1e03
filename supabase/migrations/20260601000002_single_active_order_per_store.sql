-- Migration: Enforce at most one active (pending/confirmed) order per store
-- Date: 2026-06-01
--
-- Resolves any pre-existing duplicates by cancelling older pending/confirmed orders,
-- then creates a partial unique index to guarantee the invariant going forward.

WITH ranked AS (
  SELECT id, store_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at DESC) as rn
  FROM orders
  WHERE status IN ('pending', 'confirmed')
)
UPDATE orders o
SET status = 'cancelled',
    cancellation_reason = 'Auto-cancelled: duplicate active order',
    updated_at = now()
FROM ranked r
WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_single_active_per_store
ON public.orders(store_id)
WHERE status IN ('pending', 'confirmed');
