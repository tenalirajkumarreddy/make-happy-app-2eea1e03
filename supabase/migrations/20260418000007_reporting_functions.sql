-- supabase/migrations/20260418000007_reporting_functions.sql

CREATE OR REPLACE FUNCTION public.get_staff_performance_logs(p_warehouse_id uuid)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    staff_name text,
    log_type text,
    product_id uuid,
    product_name text,
    expected_quantity numeric,
    actual_quantity numeric,
    difference numeric,
    notes text,
    created_by uuid,
    reviewer_name text,
    created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        spl.id,
        spl.user_id,
        w.full_name AS staff_name,
        spl.log_type,
        spl.product_id,
        p.name AS product_name,
        spl.expected_quantity,
        spl.actual_quantity,
        spl.difference,
        spl.notes,
        spl.created_by,
        u.raw_user_meta_data->>'full_name' AS reviewer_name,
        spl.created_at
    FROM
        public.staff_performance_logs spl
    JOIN
        public.workers w ON spl.user_id = w.id
    JOIN
        public.products p ON spl.product_id = p.id
    LEFT JOIN
        auth.users u ON spl.created_by = u.id
    WHERE
        w.warehouse_id = p_warehouse_id
    ORDER BY
        spl.created_at DESC;
END;
$$;

-- We need a way to view all stock movements for auditing.
-- This function will join transfers and direct movements (purchase/sale).

CREATE TYPE stock_movement_record AS (
    id uuid,
    created_at timestamptz,
    display_id text,
    product_name text,
    type text,
    quantity_change numeric,
    from_location text,
    to_location text,
    reason text,
    initiated_by text
);

CREATE OR REPLACE FUNCTION public.get_stock_movement_history(
    p_warehouse_id uuid,
    p_product_id uuid DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date timestamptz DEFAULT NULL,
    p_type text DEFAULT NULL
)
RETURNS SETOF stock_movement_record
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH movements AS (
        -- Warehouse to Staff
        SELECT
            st.id,
            st.created_at,
            st.display_id,
            p.name as product_name,
            st.transfer_type as type,
            st.quantity as quantity_change,
            wh.name as from_location,
            s.full_name as to_location,
            st.description as reason,
            creator.raw_user_meta_data->>'full_name' as initiated_by
        FROM public.stock_transfers st
        JOIN public.products p ON st.product_id = p.id
        JOIN public.warehouses wh ON st.from_warehouse_id = wh.id
        JOIN public.workers s ON st.to_user_id = s.id
        JOIN auth.users creator ON st.created_by = creator.id
        WHERE st.from_warehouse_id = p_warehouse_id AND st.transfer_type = 'warehouse_to_staff'

        UNION ALL

        -- Staff to Warehouse (Returns)
        SELECT
            st.id,
            st.created_at,
            st.display_id,
            p.name as product_name,
            st.transfer_type as type,
            st.actual_quantity as quantity_change,
            s.full_name as from_location,
            wh.name as to_location,
            st.description as reason,
            creator.raw_user_meta_data->>'full_name' as initiated_by
        FROM public.stock_transfers st
        JOIN public.products p ON st.product_id = p.id
        JOIN public.warehouses wh ON st.to_warehouse_id = wh.id
        JOIN public.workers s ON st.from_user_id = s.id
        JOIN auth.users creator ON st.created_by = creator.id
        WHERE st.to_warehouse_id = p_warehouse_id AND st.transfer_type = 'staff_to_warehouse'

        UNION ALL

        -- Staff to Staff
        SELECT
            st.id,
            st.created_at,
            st.display_id,
            p.name as product_name,
            st.transfer_type as type,
            st.quantity as quantity_change,
            s_from.full_name as from_location,
            s_to.full_name as to_location,
            st.description as reason,
            creator.raw_user_meta_data->>'full_name' as initiated_by
        FROM public.stock_transfers st
        JOIN public.products p ON st.product_id = p.id
        JOIN public.workers s_from ON st.from_user_id = s_from.id
        JOIN public.workers s_to ON st.to_user_id = s_to.id
        JOIN auth.users creator ON st.created_by = creator.id
        WHERE s_from.warehouse_id = p_warehouse_id -- Assumes both staff are in the same warehouse context

        UNION ALL

        -- Purchases and Sales (Direct warehouse movements)
        SELECT
            sm.id,
            sm.created_at,
            sm.id::text as display_id,
            p.name as product_name,
            sm.type,
            sm.quantity,
            CASE WHEN sm.quantity > 0 THEN 'External' ELSE wh.name END as from_location,
            CASE WHEN sm.quantity > 0 THEN wh.name ELSE 'External' END as to_location,
            sm.reason,
            creator.raw_user_meta_data->>'full_name' as initiated_by
        FROM public.stock_movements sm
        JOIN public.products p ON sm.product_id = p.id
        JOIN public.warehouses wh ON sm.warehouse_id = wh.id
        JOIN auth.users creator ON sm.created_by = creator.id
        WHERE sm.warehouse_id = p_warehouse_id AND sm.type IN ('purchase', 'sale')
    )
    SELECT *
    FROM movements
    WHERE
        (p_product_id IS NULL OR movements.product_name = (SELECT name FROM products WHERE id = p_product_id))
    AND (p_user_id IS NULL OR from_location = (SELECT full_name FROM workers WHERE id = p_user_id) OR to_location = (SELECT full_name FROM workers WHERE id = p_user_id))
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
    AND (p_type IS NULL OR type = p_type)
    ORDER BY created_at DESC;
END;
$$;
