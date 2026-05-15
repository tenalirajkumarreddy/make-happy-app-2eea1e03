-- Trigger: auto-create POS store when a warehouse is created
CREATE OR REPLACE FUNCTION public.handle_warehouse_created()
RETURNS TRIGGER AS $$
DECLARE
  pos_store_type_id uuid := '00000000-0000-0000-0000-000000000001'; -- POS/Counter
  warehouse_customer_id uuid;
BEGIN
  -- Use the warehouse creator as customer if available, else first system customer
  warehouse_customer_id := COALESCE(
    NEW.created_by,
    (SELECT id FROM customers ORDER BY created_at LIMIT 1)
  );

  -- Create a POS store linked to this warehouse
  INSERT INTO public.stores (display_id, name, customer_id, store_type_id, address, city, phone, warehouse_id, is_active, created_by, opening_balance, outstanding)
  VALUES (
    'POS-' || UPPER(SUBSTRING(NEW.id::text, 1, 8)),
    COALESCE(NEW.name, 'Warehouse') || ' - POS',
    warehouse_customer_id,
    pos_store_type_id,
    COALESCE(NEW.address, NEW.location),
    NEW.city,
    NEW.phone,
    NEW.id,
    true,
    NEW.created_by,
    0,
    0
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_warehouse_created ON public.warehouses;
CREATE TRIGGER on_warehouse_created
  AFTER INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.handle_warehouse_created();