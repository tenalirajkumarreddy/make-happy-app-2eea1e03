-- Add warehouse_id to vendors if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'warehouse_id'
    ) THEN
        ALTER TABLE public.vendors 
        ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT;
        
        CREATE INDEX idx_vendors_warehouse_id ON public.vendors(warehouse_id);
    END IF;
END $$;

-- Populate existing vendors with default warehouse
DO $$
DECLARE
    v_default_warehouse_id UUID;
BEGIN
    -- Get the ID of the default warehouse (or the first active one)
    SELECT id INTO v_default_warehouse_id 
    FROM public.warehouses 
    WHERE is_default = true AND is_active = true 
    LIMIT 1;

    -- Fallback to any active warehouse if no default is found
    IF v_default_warehouse_id IS NULL THEN
        SELECT id INTO v_default_warehouse_id 
        FROM public.warehouses 
        WHERE is_active = true 
        LIMIT 1;
    END IF;

    -- If we have a warehouse, update existing records
    IF v_default_warehouse_id IS NOT NULL THEN
        UPDATE public.vendors 
        SET warehouse_id = v_default_warehouse_id 
        WHERE warehouse_id IS NULL;
    END IF;
END $$;
