-- supabase/migrations/20260418000003_feasibility_calculator.sql

create or replace function calculate_feasibility(
    p_warehouse_id uuid,
    p_finished_product_id uuid,
    p_quantity_to_produce numeric
)
returns table (
    raw_material_id uuid,
    raw_material_name text,
    required_quantity numeric,
    available_quantity numeric,
    unit text,
    sufficient boolean
)
language plpgsql
as $$
begin
    return query
    with bom_requirements as (
        -- Calculate total required quantity for each raw material
        select
            bom.raw_material_id,
            (bom.quantity * p_quantity_to_produce) as total_required
        from
            bill_of_materials bom
        where
            bom.finished_product_id = p_finished_product_id
    )
    select
        br.raw_material_id,
        p.name as raw_material_name,
        br.total_required as required_quantity,
        coalesce(ps.quantity, 0) as available_quantity,
        p.unit,
        (coalesce(ps.quantity, 0) >= br.total_required) as sufficient
    from
        bom_requirements br
    join
        products p on br.raw_material_id = p.id
    left join
        product_stock ps on br.raw_material_id = ps.product_id and ps.warehouse_id = p_warehouse_id;
end;
$$;

grant execute on function calculate_feasibility(uuid, uuid, numeric) to authenticated;
