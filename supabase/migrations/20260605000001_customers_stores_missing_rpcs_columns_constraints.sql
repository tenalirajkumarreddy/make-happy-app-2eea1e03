-- Migration: Capture missing customers/stores RPCs, columns, constraints, fixes
-- Date: 2026-06-05
--
-- Four RPCs exist on live DB but were never captured in any migration:
--   get_accessible_customers, bulk_update_customers, bulk_update_stores,
--   create_store_with_display_id
--
-- check_duplicate_customer_phone() is defined as a TRIGGER in all SQL files,
-- but the frontend calls it as an RPC with parameters -- incompatible.
--
-- warehouse_id and created_by columns on customers/stores are backfilled
-- but never added via ALTER TABLE in any migration.
--
-- Changes:
-- 1. ADD COLUMN IF NOT EXISTS for warehouse_id, created_by on customers/stores
-- 2. CREATE OR REPLACE FUNCTION: check_duplicate_customer_phone (RPC)
-- 3. CREATE OR REPLACE FUNCTION: get_accessible_customers
-- 4. CREATE OR REPLACE FUNCTION: bulk_update_customers
-- 5. CREATE OR REPLACE FUNCTION: bulk_update_stores
-- 6. CREATE OR REPLACE FUNCTION: create_store_with_display_id
-- 7. CREATE OR REPLACE FUNCTION: deactivate_customer_with_stores
-- 8. CHECK constraints: stores.outstanding >= 0, customers.kyc_status
-- 9. BEFORE DELETE trigger to prevent customer cascade-delete

-- ============================================================
-- PART 1: MISSING COLUMNS
-- ============================================================

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- PART 2: CHECK CONSTRAINTS
-- ============================================================

ALTER TABLE public.stores ADD CONSTRAINT IF NOT EXISTS stores_outstanding_check CHECK (outstanding >= 0) NOT VALID;
ALTER TABLE public.stores VALIDATE CONSTRAINT stores_outstanding_check;

ALTER TABLE public.customers ADD CONSTRAINT IF NOT EXISTS customers_kyc_status_check CHECK (kyc_status IN ('not_requested', 'pending', 'verified', 'rejected')) NOT VALID;
ALTER TABLE public.customers VALIDATE CONSTRAINT customers_kyc_status_check;

-- ============================================================
-- PART 3: MISSING RPCs
-- ============================================================

-- 3.1 check_duplicate_customer_phone as RPC (not trigger)
CREATE OR REPLACE FUNCTION public.check_duplicate_customer_phone(
  p_phone text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, display_id text, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.display_id, c.is_active
  FROM public.customers c
  WHERE c.phone = p_phone
    AND (p_exclude_id IS NULL OR c.id != p_exclude_id);
END;
$$;

-- 3.2 get_accessible_customers — role-aware customer listing with aggregates
CREATE OR REPLACE FUNCTION public.get_accessible_customers(
  p_user_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  display_id text,
  name text,
  phone text,
  email text,
  is_active boolean,
  kyc_status text,
  created_at timestamptz,
  store_count bigint,
  total_outstanding numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id LIMIT 1;

  -- Super admin and manager: all customers in warehouse
  IF v_role IN ('super_admin', 'manager') THEN
    RETURN QUERY
    SELECT
      c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
      COUNT(s.id)::bigint AS store_count,
      COALESCE(SUM(s.outstanding), 0) AS total_outstanding
    FROM public.customers c
    LEFT JOIN public.stores s ON s.customer_id = c.id AND s.is_active = true
    WHERE (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  -- Agent / marketer / operator: customers with stores on their assigned routes
  ELSIF v_role IN ('agent', 'marketer', 'operator') THEN
    RETURN QUERY
    SELECT
      c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
      COUNT(DISTINCT s.id)::bigint AS store_count,
      COALESCE(SUM(s.outstanding) FILTER (WHERE s.is_active = true), 0) AS total_outstanding
    FROM public.customers c
    LEFT JOIN public.stores s ON s.customer_id = c.id
    LEFT JOIN public.route_sessions rs ON rs.user_id = p_user_id AND rs.status = 'active'
    LEFT JOIN public.route_visits rv ON rv.session_id = rs.id AND rv.store_id = s.id
    WHERE (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
      AND (
        -- Staff can see customers with stores even without active session
        EXISTS (SELECT 1 FROM public.stores s2 WHERE s2.customer_id = c.id)
      )
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  -- Customer role: only themselves
  ELSE
    RETURN QUERY
    SELECT
      c.id, c.display_id, c.name, c.phone, c.email, c.is_active, c.kyc_status, c.created_at,
      COUNT(s.id)::bigint AS store_count,
      COALESCE(SUM(s.outstanding), 0) AS total_outstanding
    FROM public.customers c
    LEFT JOIN public.stores s ON s.customer_id = c.id AND s.is_active = true
    WHERE c.user_id = p_user_id
      AND (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

-- 3.3 bulk_update_customers
CREATE OR REPLACE FUNCTION public.bulk_update_customers(p_updates json)
RETURNS TABLE(customer_id uuid, success boolean, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec json;
BEGIN
  FOR rec IN SELECT * FROM json_array_elements(p_updates)
  LOOP
    BEGIN
      UPDATE public.customers
      SET
        name = COALESCE((rec->>'name')::text, name),
        phone = COALESCE((rec->>'phone')::text, phone),
        email = COALESCE((rec->>'email')::text, email),
        updated_at = now()
      WHERE id = (rec->>'id')::uuid;

      customer_id := (rec->>'id')::uuid;
      success := true;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      customer_id := (rec->>'id')::uuid;
      success := false;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- 3.4 bulk_update_stores
CREATE OR REPLACE FUNCTION public.bulk_update_stores(p_updates json)
RETURNS TABLE(store_id uuid, success boolean, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec json;
BEGIN
  FOR rec IN SELECT * FROM json_array_elements(p_updates)
  LOOP
    BEGIN
      UPDATE public.stores
      SET
        name = COALESCE((rec->>'name')::text, name),
        phone = COALESCE((rec->>'phone')::text, phone),
        updated_at = now()
      WHERE id = (rec->>'id')::uuid;

      store_id := (rec->>'id')::uuid;
      success := true;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      store_id := (rec->>'id')::uuid;
      success := false;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- 3.5 create_store_with_display_id — used by CSV import and CreateStoreWizard
CREATE SEQUENCE IF NOT EXISTS public.stores_display_id_seq;
CREATE OR REPLACE FUNCTION public.create_store_with_display_id(
  p_name text,
  p_customer_id uuid,
  p_store_type_id uuid,
  p_route_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS SETOF public.stores
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_display_id text;
  v_store public.stores;
BEGIN
  v_display_id := 'STR-' || LPAD(NEXTVAL('public.stores_display_id_seq')::text, 4, '0');

  INSERT INTO public.stores (
    display_id, name, customer_id, store_type_id, route_id,
    phone, address, warehouse_id, lat, lng
  ) VALUES (
    v_display_id, p_name, p_customer_id, p_store_type_id, p_route_id,
    p_phone, p_address, p_warehouse_id, p_lat, p_lng
  )
  RETURNING * INTO v_store;

  RETURN NEXT v_store;
END;
$$;

-- ============================================================
-- PART 4: ATOMIC CUSTOMER+STORES DEACTIVATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.deactivate_customer_with_stores(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.stores SET is_active = false, updated_at = now() WHERE customer_id = p_customer_id AND is_active = true;
  UPDATE public.customers SET is_active = false, updated_at = now() WHERE id = p_customer_id;
END;
$$;

-- ============================================================
-- PART 5: PREVENT CUSTOMER HARD-DELETE (protects against ON DELETE CASCADE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_customer_delete()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Cannot delete customers directly. Use is_active = false to deactivate.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_delete_trigger ON public.customers;
CREATE TRIGGER prevent_customer_delete_trigger
  BEFORE DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_delete();
