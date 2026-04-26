-- Migration: Fix feasibility calculator to join raw_materials instead of products
-- Date: 2026-04-26
-- Issue: The calculate_feasibility function was joining products table instead of raw_materials

-- Drop and recreate the function with correct table join
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
    rm.name as raw_material_name,
    br.total_required as required_quantity,
    coalesce(rm.current_stock, 0) as available_quantity,
    rm.unit,
    (coalesce(rm.current_stock, 0) >= br.total_required) as sufficient
  from
    bom_requirements br
  join
    raw_materials rm on br.raw_material_id = rm.id
  where
    rm.warehouse_id = p_warehouse_id;
end;
$$;

-- Grant execute permission
grant execute on function calculate_feasibility(uuid, uuid, numeric) to authenticated;

-- Add comment documenting the fix
comment on function calculate_feasibility(uuid, uuid, numeric) is 
'Calculates production feasibility by checking raw material availability. Fixed 2026-04-26: Now correctly joins raw_materials table instead of products.';

-- Migration metadata
insert into schema_migrations (version, name, applied_at)
values ('20260426000001', 'fix_feasibility_calculator', now());
