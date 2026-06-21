-- Migration: Deduplicate record_sale_return to a single canonical 6-arg function
-- Date: 2026-06-22
--
-- Issue: Multiple overloaded versions (5-arg and 6-arg) existed simultaneously,
-- causing "Could not choose the best candidate function" error.
--
-- Fix: Drop ALL existing signatures, create a single canonical 6-arg version.
-- The p_notes parameter is optional (DEFAULT NULL) so older code without it still works.

DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.record_sale_return(
    p_sale_id           UUID,
    p_returned_by       UUID,
    p_reason            TEXT,
    p_items             JSONB,
    p_created_at        TIMESTAMPTZ DEFAULT NULL,
    p_notes             TEXT DEFAULT NULL
)
RETURNS TABLE(return_id UUID, display_id TEXT, new_outstanding NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_display_id TEXT;
    v_sale RECORD;
    v_item JSONB;
    v_sale_item_id UUID;
    v_product_id UUID;
    v_return_qty NUMERIC;
    v_damaged_qty NUMERIC;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_total_return_amount NUMERIC := 0;
    v_original_qty NUMERIC;
    v_new_outstanding NUMERIC;
    v_good_qty NUMERIC;
    v_store_old_outstanding NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock & fetch the sale
    SELECT * INTO v_sale
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale % not found', p_sale_id;
    END IF;

    -- Lock the store row for consistency
    SELECT outstanding INTO v_store_old_outstanding
    FROM public.stores WHERE id = v_sale.store_id FOR UPDATE;

    -- Generate display ID
    v_display_id := 'SR-' || to_char(COALESCE(p_created_at, now()), 'YYYYMMDD') || '-' || floor(random() * 100000)::TEXT || '-RETURN';

    -- Insert return header with notes
    INSERT INTO public.sale_returns (
        sale_id, store_id, customer_id, created_by, reason, display_id,
        return_date, total_amount, status, created_at, notes
    ) VALUES (
        p_sale_id, v_sale.store_id, v_sale.customer_id, p_returned_by, p_reason, v_display_id,
        COALESCE(p_created_at, now())::date, 0, 'pending', COALESCE(p_created_at, now()), p_notes
    )
    RETURNING id INTO v_return_id;

    -- Process each returned item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sale_item_id := (v_item->>'sale_item_id')::UUID;
        v_product_id := (v_item->>'product_id')::UUID;
        v_return_qty := COALESCE((v_item->>'return_qty')::NUMERIC, 0);
        v_damaged_qty := COALESCE((v_item->>'damaged_qty')::NUMERIC, 0);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);

        IF v_damaged_qty > v_return_qty THEN
            RAISE EXCEPTION 'Damaged quantity (%) exceeds return quantity (%)', v_damaged_qty, v_return_qty;
        END IF;

        SELECT quantity, unit_price INTO v_original_qty, v_unit_price
        FROM public.sale_items WHERE id = v_sale_item_id AND sale_id = p_sale_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sale item % not found', v_sale_item_id;
        END IF;

        -- Calculate subtotal
        v_subtotal := v_unit_price * v_return_qty;
        v_total_return_amount := v_total_return_amount + v_subtotal;

        -- Insert return item
        INSERT INTO public.sale_return_items (return_id, product_id, return_qty, damaged_qty, unit_price, total_price, created_at)
        VALUES (v_return_id, v_product_id, v_return_qty, v_damaged_qty, v_unit_price, v_subtotal, COALESCE(p_created_at, now()));

    END LOOP;

    -- Update the sale_return total
    UPDATE public.sale_returns SET total_amount = v_total_return_amount WHERE id = v_return_id;

    -- Calculate new outstanding for the sale
    v_new_outstanding := GREATEST(v_sale.outstanding_amount - v_total_return_amount, 0);

    -- Update sale
    UPDATE public.sales SET
        outstanding_amount = v_new_outstanding,
        is_fully_returned = TRUE
    WHERE id = p_sale_id;

    -- Store outstanding update
    UPDATE public.stores SET outstanding = outstanding - v_total_return_amount
    WHERE id = v_sale.store_id;

    -- Also update the new outstanding for the sale tracker
    v_new_outstanding := v_store_old_outstanding - v_total_return_amount;

    RETURN QUERY SELECT v_return_id, v_display_id, v_new_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale_return(UUID, UUID, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO authenticated;
