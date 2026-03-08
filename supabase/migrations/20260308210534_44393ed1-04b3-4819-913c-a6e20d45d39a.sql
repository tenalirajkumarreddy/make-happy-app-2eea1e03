-- Step 1: Create POS store type
INSERT INTO public.store_types (id, name, order_type, is_active, auto_order_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'POS/Counter', 'simple', true, false)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create POS customer
INSERT INTO public.customers (id, display_id, name, is_active, kyc_status, opening_balance)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST-POS', 'POS', true, 'not_requested', 0)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create POS store referencing the above
INSERT INTO public.stores (id, display_id, name, customer_id, store_type_id, is_active, outstanding, opening_balance)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'STR-POS',
  'POS Counter',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  true, 0, 0
) ON CONFLICT (id) DO NOTHING;

-- Step 4: Protect from deletion
CREATE POLICY "Cannot delete system POS store"
ON public.stores FOR DELETE
TO authenticated
USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Cannot delete system POS customer"
ON public.customers FOR DELETE
TO authenticated
USING (id != '00000000-0000-0000-0000-000000000001'::uuid);

-- Step 5: Protect from deactivation
CREATE OR REPLACE FUNCTION public.protect_pos_system_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.is_active := true;
    NEW.name := OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_pos_store
BEFORE UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.protect_pos_system_records();

CREATE TRIGGER protect_pos_customer
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.protect_pos_system_records();