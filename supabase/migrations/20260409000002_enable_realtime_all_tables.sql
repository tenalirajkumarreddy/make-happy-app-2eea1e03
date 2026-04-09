BEGIN;

DO $$
DECLARE
  schema_record record;
BEGIN
  -- Add all tables in public schema to supabase_realtime
  FOR schema_record IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', schema_record.tablename);
    EXCEPTION WHEN duplicate_object THEN
      -- Ignore if already in publication
    END;
  END LOOP;
END
$$;

COMMIT;
