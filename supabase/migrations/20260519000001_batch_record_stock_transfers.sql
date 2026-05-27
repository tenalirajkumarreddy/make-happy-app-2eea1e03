-- Migration: Batch record_stock_transfers for atomic multi-product transfers
-- Wraps the existing record_stock_transfer in a loop within a single transaction.
-- If ANY transfer fails, ALL are rolled back.

CREATE OR REPLACE FUNCTION public.record_stock_transfers(
  p_transfer_type text,
  p_from_warehouse_id uuid DEFAULT NULL,
  p_from_user_id uuid DEFAULT NULL,
  p_to_warehouse_id uuid DEFAULT NULL,
  p_to_user_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item       jsonb;
  v_result     jsonb;
  v_results    jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_quantity   numeric;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSONB array of [{product_id, quantity}]';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;

    SELECT record_stock_transfer(
      p_transfer_type,
      p_from_warehouse_id,
      p_from_user_id,
      p_to_warehouse_id,
      p_to_user_id,
      v_product_id,
      v_quantity,
      p_description
    ) INTO v_result;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object(
    'success',  true,
    'results',  v_results,
    'count',    jsonb_array_length(v_results)
  );
END;
$function$;
