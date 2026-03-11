-- Add factory/depot location to routes (starting point for optimal path calculation)
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS factory_lat DOUBLE PRECISION;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS factory_lng DOUBLE PRECISION;

-- Add store_order to stores (navigation order within the route)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_order INTEGER;
