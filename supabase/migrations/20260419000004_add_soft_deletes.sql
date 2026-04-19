-- ==========================================================================
-- Add soft delete support for critical tables
-- 
-- PROBLEM: Hard deletes cause data loss and break historical records
-- SOLUTION: Add deleted_at columns and views to filter deleted records
-- ==========================================================================

-- ==========================================================================
-- 1. Add deleted_at columns to critical tables
-- ==========================================================================

-- Customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Store types
ALTER TABLE public.store_types ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.store_types ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Routes
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- ==========================================================================
-- 2. Create views that exclude deleted records (for application use)
-- ==========================================================================

-- Active customers view
CREATE OR REPLACE VIEW public.active_customers AS
SELECT *
FROM public.customers
WHERE deleted_at IS NULL;

-- Active stores view
CREATE OR REPLACE VIEW public.active_stores AS
SELECT *
FROM public.stores
WHERE deleted_at IS NULL;

-- Active products view
CREATE OR REPLACE VIEW public.active_products AS
SELECT *
FROM public.products
WHERE deleted_at IS NULL;

-- Active store types view
CREATE OR REPLACE VIEW public.active_store_types AS
SELECT *
FROM public.store_types
WHERE deleted_at IS NULL;

-- Active routes view
CREATE OR REPLACE VIEW public.active_routes AS
SELECT *
FROM public.routes
WHERE deleted_at IS NULL;

-- ==========================================================================
-- 3. Create soft delete function
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_record(
  p_table_name text,
  p_record_id uuid,
  p_deleted_by uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
BEGIN
  -- Validate table name to prevent injection
  IF p_table_name NOT IN ('customers', 'stores', 'products', 'store_types', 'routes') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Build and execute soft delete
  v_sql := format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table_name
  );
  
  EXECUTE v_sql USING p_deleted_by, p_record_id;
  
  RETURN FOUND;
END;
$$;

-- ==========================================================================
-- 4. Create restore function
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.restore_deleted_record(
  p_table_name text,
  p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
BEGIN
  -- Validate table name to prevent injection
  IF p_table_name NOT IN ('customers', 'stores', 'products', 'store_types', 'routes') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Build and execute restore
  v_sql := format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    p_table_name
  );
  
  EXECUTE v_sql USING p_record_id;
  
  RETURN FOUND;
END;
$$;

-- ==========================================================================
-- 5. Create audit log trigger for soft deletes
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  deleted_at timestamptz DEFAULT now(),
  deleted_by uuid REFERENCES auth.users(id),
  restored_at timestamptz,
  restored_by uuid REFERENCES auth.users(id),
  record_data jsonb -- Snapshot of deleted record
);

-- Trigger function to log deletions
CREATE OR REPLACE FUNCTION public.log_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Record was just soft deleted
    INSERT INTO public.deletion_audit_log (
      table_name, record_id, deleted_by, record_data
    ) VALUES (
      TG_TABLE_NAME,
      NEW.id,
      NEW.deleted_by,
      to_jsonb(OLD)
    );
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- Record was restored
    UPDATE public.deletion_audit_log
    SET restored_at = now(),
        restored_by = auth.uid()
    WHERE table_name = TG_TABLE_NAME AND record_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to tables
DROP TRIGGER IF EXISTS trg_log_soft_delete_customers ON public.customers;
CREATE TRIGGER trg_log_soft_delete_customers
  AFTER UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_soft_delete();

DROP TRIGGER IF EXISTS trg_log_soft_delete_stores ON public.stores;
CREATE TRIGGER trg_log_soft_delete_stores
  AFTER UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.log_soft_delete();

DROP TRIGGER IF EXISTS trg_log_soft_delete_products ON public.products;
CREATE TRIGGER trg_log_soft_delete_products
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_soft_delete();

-- ==========================================================================
-- 6. Update RLS policies to respect soft deletes
-- ==========================================================================

-- Customers: Only show non-deleted
DROP POLICY IF EXISTS "Only show active customers" ON public.customers;
CREATE POLICY "Only show active customers" ON public.customers
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- Stores: Only show non-deleted
DROP POLICY IF EXISTS "Only show active stores" ON public.stores;
CREATE POLICY "Only show active stores" ON public.stores
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- Products: Only show non-deleted
DROP POLICY IF EXISTS "Only show active products" ON public.products;
CREATE POLICY "Only show active products" ON public.products
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- ==========================================================================
-- 7. Grant permissions
-- ==========================================================================

GRANT SELECT ON public.active_customers TO authenticated;
GRANT SELECT ON public.active_stores TO authenticated;
GRANT SELECT ON public.active_products TO authenticated;
GRANT SELECT ON public.active_store_types TO authenticated;
GRANT SELECT ON public.active_routes TO authenticated;

GRANT EXECUTE ON FUNCTION public.soft_delete_record TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_record TO authenticated;

-- Comments
COMMENT ON FUNCTION public.soft_delete_record IS 'Soft deletes a record by setting deleted_at timestamp';
COMMENT ON FUNCTION public.restore_deleted_record IS 'Restores a soft-deleted record by clearing deleted_at';

-- Migration metadata
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260419000004', 'add_soft_deletes', now());
