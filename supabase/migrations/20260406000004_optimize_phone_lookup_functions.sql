-- Create helper function for phone-based identity lookup
-- This replaces full table scans with indexed queries

-- First, add an index on the last 10 digits of phone numbers for efficient matching
CREATE INDEX IF NOT EXISTS idx_customers_phone_last10 ON customers((RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10)));
CREATE INDEX IF NOT EXISTS idx_staff_directory_phone_last10 ON staff_directory((RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10)));
CREATE INDEX IF NOT EXISTS idx_staff_invitations_phone_last10 ON staff_invitations((RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10)));

-- Function to find staff by phone number (last 10 digits)
CREATE OR REPLACE FUNCTION find_staff_by_phone(p_phone_digits text)
RETURNS TABLE (
  id uuid,
  phone text,
  user_id uuid,
  role text,
  full_name text,
  avatar_url text,
  is_active boolean,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Extract last 10 digits for comparison
  WITH phone_key AS (
    SELECT RIGHT(REGEXP_REPLACE(p_phone_digits, '[^0-9]', '', 'g'), 10) as key
  )
  SELECT 
    sd.id,
    sd.phone,
    sd.user_id,
    sd.role,
    sd.full_name,
    sd.avatar_url,
    sd.is_active,
    'staff_directory'::text as source
  FROM staff_directory sd, phone_key pk
  WHERE sd.is_active = true
    AND sd.phone IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(sd.phone, '[^0-9]', '', 'g'), 10) = pk.key
  LIMIT 2; -- Limit 2 to detect duplicates
$$;

-- Function to find staff invitation by phone
CREATE OR REPLACE FUNCTION find_staff_invitation_by_phone(p_phone_digits text)
RETURNS TABLE (
  id uuid,
  phone text,
  email text,
  full_name text,
  role text,
  status text,
  accepted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH phone_key AS (
    SELECT RIGHT(REGEXP_REPLACE(p_phone_digits, '[^0-9]', '', 'g'), 10) as key
  )
  SELECT 
    si.id,
    si.phone,
    si.email,
    si.full_name,
    si.role,
    si.status,
    si.accepted_at
  FROM staff_invitations si, phone_key pk
  WHERE si.phone IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(si.phone, '[^0-9]', '', 'g'), 10) = pk.key
    AND si.status IN ('accepted', 'pending')
  LIMIT 2;
$$;

-- Function to find customer by phone
CREATE OR REPLACE FUNCTION find_customer_by_phone(p_phone_digits text)
RETURNS TABLE (
  id uuid,
  phone text,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH phone_key AS (
    SELECT RIGHT(REGEXP_REPLACE(p_phone_digits, '[^0-9]', '', 'g'), 10) as key
  )
  SELECT 
    c.id,
    c.phone,
    c.user_id
  FROM customers c, phone_key pk
  WHERE c.phone IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 10) = pk.key
  LIMIT 2;
$$;

-- Comments
COMMENT ON FUNCTION find_staff_by_phone(text) IS 
  'Optimized phone lookup for staff. Uses indexed last-10-digits matching instead of full table scan.';

COMMENT ON FUNCTION find_staff_invitation_by_phone(text) IS 
  'Optimized phone lookup for staff invitations. Uses indexed last-10-digits matching.';

COMMENT ON FUNCTION find_customer_by_phone(text) IS 
  'Optimized phone lookup for customers. Uses indexed last-10-digits matching.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION find_staff_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION find_staff_invitation_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION find_customer_by_phone(text) TO service_role;
