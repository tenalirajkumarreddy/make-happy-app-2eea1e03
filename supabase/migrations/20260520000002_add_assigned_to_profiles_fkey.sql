-- FK constraint for orders.assigned_to → profiles(user_id)
-- Enables Supabase REST API join: profiles!orders_assigned_to_profiles_fkey(full_name)
-- profiles.user_id = auth.users.id, so this is consistent with the existing
-- orders_assigned_to_auth_fkey → auth.users(id) constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_to_profiles_fkey'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_assigned_to_profiles_fkey
      FOREIGN KEY (assigned_to) REFERENCES profiles(user_id) NOT VALID;
  END IF;
END $$;
