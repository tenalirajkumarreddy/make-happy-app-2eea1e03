-- supabase/migrations/20260418000002_bom_functions.sql

-- Function to get a summary of all Bills of Materials
create or replace function get_bom_summary(p_warehouse_id uuid)
returns table (
    finished_product_id uuid,
    finished_product_name text,
    raw_material_count bigint,
    last_updated timestamptz
)
language plpgsql
as $$
begin
    return query
    select
        p.id as finished_product_id,
        p.name as finished_product_name,
        count(bom.raw_material_id) as raw_material_count,
        max(bom.updated_at) as last_updated
    from
        products p
    join
        bill_of_materials bom on p.id = bom.finished_product_id
    where
        p.warehouse_id = p_warehouse_id
        and p.is_raw_material = false
    group by
        p.id, p.name;
end;
$$;

-- Type definition for the items in the upsert function
create type bom_item as (
    raw_material_id uuid,
    quantity numeric
);

-- Function to upsert a Bill of Materials
create or replace function upsert_bom(p_finished_product_id uuid, p_warehouse_id uuid, p_items bom_item[])
returns void
language plpgsql
as $$
declare
    item bom_item;
begin
    -- Ensure the user has permission for the warehouse
    if not exists (select 1 from user_warehouses where user_id = auth.uid() and warehouse_id = p_warehouse_id) then
        raise exception 'User does not have access to this warehouse';
    end if;

    -- Delete existing BOM for the finished product
    delete from bill_of_materials where finished_product_id = p_finished_product_id;

    -- Insert new BOM items
    foreach item in array p_items
    loop
        insert into bill_of_materials (finished_product_id, raw_material_id, quantity, warehouse_id)
        values (p_finished_product_id, item.raw_material_id, item.quantity, p_warehouse_id);
    end loop;
end;
$$;

-- Grant usage on the new functions and types
grant execute on function get_bom_summary(uuid) to authenticated;
grant execute on function upsert_bom(uuid, uuid, bom_item[]) to authenticated;
