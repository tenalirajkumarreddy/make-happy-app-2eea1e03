-- Backfill warehouse_id on existing orders where it's null
-- Resolves from the creator's user_roles.warehouse_id, then falls back to default warehouse

UPDATE public.orders o
SET warehouse_id = COALESCE(
  (SELECT warehouse_id FROM public.user_roles WHERE user_id = o.created_by AND warehouse_id IS NOT NULL LIMIT 1),
  (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1)
)
WHERE o.warehouse_id IS NULL;
