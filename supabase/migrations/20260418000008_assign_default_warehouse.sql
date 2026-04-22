-- Fix for existing records that are missing a warehouse_id.
-- This ensures they become visible in the UI when filtered by the default warehouse.

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

    -- If we still have no warehouse, exit without doing anything
    IF v_default_warehouse_id IS NULL THEN
        RETURN;
    END IF;

    -- Update core entities
    UPDATE public.stores SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.customers SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.routes SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.products SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    
    -- Update transactions & orders
    UPDATE public.sales SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.transactions SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.orders SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    
    -- Update inventory related
    UPDATE public.product_stock SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    UPDATE public.staff_stock SET warehouse_id = v_default_warehouse_id WHERE warehouse_id IS NULL;
    
    -- Update HR & Vendors if columns exist
    -- Safely execute dynamic SQL to avoid errors if columns don't exist yet in the local DB state
    BEGIN
        EXECUTE 'UPDATE public.staff_directory SET warehouse_id = $1 WHERE warehouse_id IS NULL' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_column THEN END;

    BEGIN
        EXECUTE 'UPDATE public.staff_invitations SET warehouse_id = $1 WHERE warehouse_id IS NULL' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_column THEN END;
    
    BEGIN
        EXECUTE 'UPDATE public.vendors SET warehouse_id = $1 WHERE warehouse_id IS NULL' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN END;
    
    BEGIN
        EXECUTE 'UPDATE public.raw_materials SET warehouse_id = $1 WHERE warehouse_id IS NULL' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN END;
    
    BEGIN
        EXECUTE 'UPDATE public.workers SET warehouse_id = $1 WHERE warehouse_id IS NULL' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN END;

    BEGIN
        EXECUTE 'UPDATE public.user_roles SET warehouse_id = $1 WHERE warehouse_id IS NULL AND role != ''super_admin''' USING v_default_warehouse_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN END;

END $$;
