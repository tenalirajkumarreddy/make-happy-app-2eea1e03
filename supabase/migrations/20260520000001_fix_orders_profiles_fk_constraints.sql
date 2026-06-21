-- Fix FK constraints on orders that reference profiles(id) instead of profiles(user_id)
-- profiles.id is a gen_random_uuid() independent of auth.users.id, so referencing it
-- breaks inserts (Orders.tsx passes user!.id = auth.users.id, which never matches profiles.id).
-- profiles.user_id = auth.users.id, so referencing profiles(user_id) is correct.
-- The constraint names must be preserved because Supabase REST API uses them for joins:
--   profiles!orders_created_by_profiles_fkey_temp(full_name)
--   profiles!orders_cancelled_by_profiles_fkey(full_name)
--   profiles!orders_fulfilled_by_profiles_fkey(full_name)

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_created_by_profiles_fkey_temp;
ALTER TABLE orders ADD CONSTRAINT orders_created_by_profiles_fkey_temp
  FOREIGN KEY (created_by) REFERENCES profiles(user_id) NOT VALID;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cancelled_by_profiles_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_cancelled_by_profiles_fkey
  FOREIGN KEY (cancelled_by) REFERENCES profiles(user_id) NOT VALID;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfilled_by_profiles_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_fulfilled_by_profiles_fkey
  FOREIGN KEY (fulfilled_by) REFERENCES profiles(user_id) NOT VALID;
