-- Create RPC function for atomic product access matrix synchronization
-- This replaces the dangerous soft-delete-then-reinsert pattern with a single transaction
-- Prevents race conditions and ensures data integrity

CREATE OR REPLACE FUNCTION sync_product_access_matrix(
  p_access_payload JSONB, -- Array of {product_id, store_type_id}
  p_pricing_payload JSONB  -- Array of {product_id, store_type_id, price}
)
RETURNS void AS $$
DECLARE
  v_access_count INT;
  v_pricing_count INT;
BEGIN
  -- Input validation
  IF p_access_payload IS NULL OR jsonb_typeof(p_access_payload) != 'array' THEN
    RAISE EXCEPTION 'access_payload must be a JSON array';
  END IF;
  
  IF p_pricing_payload IS NULL OR jsonb_typeof(p_pricing_payload) != 'array' THEN
    RAISE EXCEPTION 'pricing_payload must be a JSON array';
  END IF;

  -- ===== STORE TYPE PRODUCTS SYNC =====
  -- Soft delete all existing active records
  UPDATE store_type_products 
  SET deleted_at = NOW()
  WHERE deleted_at IS NULL;
  
  -- Insert new access records in batches
  v_access_count := 0;
  INSERT INTO store_type_products (store_type_id, product_id)
  SELECT 
    (elem->>'store_type_id')::UUID,
    (elem->>'product_id')::UUID
  FROM jsonb_array_elements(p_access_payload) AS elem
  WHERE elem ? 'store_type_id' AND elem ? 'product_id'
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_access_count = ROW_COUNT;

  -- ===== STORE TYPE PRICING SYNC =====
  -- Soft delete all existing active records
  UPDATE store_type_pricing 
  SET deleted_at = NOW()
  WHERE deleted_at IS NULL;
  
  -- Insert new pricing records in batches
  v_pricing_count := 0;
  INSERT INTO store_type_pricing (store_type_id, product_id, price)
  SELECT 
    (elem->>'store_type_id')::UUID,
    (elem->>'product_id')::UUID,
    (elem->>'price')::DECIMAL
  FROM jsonb_array_elements(p_pricing_payload) AS elem
  WHERE elem ? 'store_type_id' AND elem ? 'product_id' AND elem ? 'price'
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_pricing_count = ROW_COUNT;

  -- Log the operation (optional, for audit trail)
  RAISE NOTICE 'Synced % product access records and % pricing records', v_access_count, v_pricing_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION sync_product_access_matrix(JSONB, JSONB) TO authenticated;

-- =============================================
-- COMMENTS AND DOCUMENTATION
-- =============================================
COMMENT ON FUNCTION sync_product_access_matrix(JSONB, JSONB) IS '
Atomic synchronization of product access matrix.

Parameters:
  p_access_payload: JSONB array of objects with {product_id, store_type_id}
  p_pricing_payload: JSONB array of objects with {product_id, store_type_id, price}

This function:
  1. Soft-deletes all existing active records
  2. Inserts new records from provided payload
  3. Runs in a single transaction for atomicity
  
Usage example:
  SELECT sync_product_access_matrix(
    ''[{"product_id": "uuid1", "store_type_id": "uuid2"}]'',
    ''[{"product_id": "uuid1", "store_type_id": "uuid2", "price": 100.00}]''
  );
';

-- =============================================
-- VERIFICATION QUERIES (run these to verify RPC installation)
-- =============================================
/*
-- Check function exists
SELECT 
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as returns
FROM pg_proc 
WHERE proname = 'sync_product_access_matrix';

-- Test the function with sample data
SELECT sync_product_access_matrix(
  '[{
    "product_id": "00000000-0000-0000-0000-000000000001",
    "store_type_id": "00000000-0000-0000-0000-000000000001"
  }]'::jsonb,
  '[{
    "product_id": "00000000-0000-0000-0000-000000000001",
    "store_type_id": "00000000-0000-0000-0000-000000000001",
    "price": 99.99
  }]'::jsonb
);

-- Verify records were created
SELECT COUNT(*) FROM store_type_products WHERE deleted_at IS NULL;
SELECT COUNT(*) FROM store_type_pricing WHERE deleted_at IS NULL;

-- Verify soft delete works (call function again with empty arrays)
SELECT sync_product_access_matrix('[]'::jsonb, '[]'::jsonb);
SELECT COUNT(*) FROM store_type_products WHERE deleted_at IS NULL; -- Should be 0
*/
