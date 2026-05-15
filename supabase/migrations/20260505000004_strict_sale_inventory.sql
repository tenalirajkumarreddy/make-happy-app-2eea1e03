-- Migration: Strict stock validation for sales
-- Date: 2026-05-05

CREATE OR REPLACE FUNCTION public.handle_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_warehouse_id UUID;
    v_user_role TEXT;
    v_sale_recorded_by UUID;
    v_is_admin_or_manager BOOLEAN;
    v_rows_affected INTEGER;
    v_pending_outgoing NUMERIC;
    v_physical_qty NUMERIC;
    v_product_name TEXT;
BEGIN
    -- Get the sale info
    SELECT s.recorded_by INTO v_sale_recorded_by
    FROM public.sales s WHERE s.id = NEW.sale_id;
    
    -- Get user's role
    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_sale_recorded_by
    LIMIT 1;
    
    v_is_admin_or_manager := v_user_role IN ('super_admin', 'manager');
    
    -- Find warehouse with fallback
    SELECT COALESCE(ur.warehouse_id, w.id) INTO v_warehouse_id
    FROM public.user_roles ur
    CROSS JOIN (SELECT id FROM public.warehouses WHERE is_default = true LIMIT 1) w
    WHERE ur.user_id = v_sale_recorded_by;
    
    IF v_warehouse_id IS NULL THEN
        SELECT id INTO v_warehouse_id FROM public.warehouses ORDER BY created_at LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found';
    END IF;

    SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;

    IF v_is_admin_or_manager THEN
        -- Admin/Manager: deduct from warehouse stock only
        -- Calculate pending outgoing from this warehouse
        SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
        FROM public.stock_transfers
        WHERE status IN ('pending', 'awaiting_acceptance')
          AND from_warehouse_id = v_warehouse_id
          AND product_id = NEW.product_id;

        -- Strict update on product_stock
        UPDATE public.product_stock
        SET quantity = quantity - NEW.quantity,
            updated_at = now()
        WHERE warehouse_id = v_warehouse_id
          AND product_id = NEW.product_id
          AND (quantity - v_pending_outgoing) >= NEW.quantity;
            
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        IF v_rows_affected = 0 THEN
            SELECT quantity INTO v_physical_qty FROM public.product_stock 
            WHERE warehouse_id = v_warehouse_id AND product_id = NEW.product_id;
            
            RAISE EXCEPTION 'insufficient_stock: % (Truly Available: %, Physical: %, Pending Outgoing: %)', 
                v_product_name, 
                COALESCE(v_physical_qty, 0) - v_pending_outgoing,
                COALESCE(v_physical_qty, 0),
                v_pending_outgoing;
        END IF;

        -- Log movement
        INSERT INTO public.stock_movements (
            product_id, warehouse_id, quantity, type, 
            reference_id, reason, created_by, created_at
        ) VALUES (
            NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
            NEW.sale_id::text, 'Admin/Manager sale - warehouse stock', v_sale_recorded_by, now()
        );
    ELSE
        -- Agent/Marketer/POS: try staff stock first
        -- Calculate pending outgoing from this staff
        SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
        FROM public.stock_transfers
        WHERE status IN ('pending', 'awaiting_acceptance')
          AND from_user_id = v_sale_recorded_by
          AND product_id = NEW.product_id
          AND from_warehouse_id = v_warehouse_id;

        -- Strict update on staff_stock
        UPDATE public.staff_stock
        SET quantity = quantity - NEW.quantity,
            updated_at = now(),
            last_sale_at = now(),
            is_negative = (quantity - NEW.quantity) < 0
        WHERE user_id = v_sale_recorded_by 
          AND product_id = NEW.product_id
          AND warehouse_id = v_warehouse_id
          AND (quantity - v_pending_outgoing) >= NEW.quantity;
        
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        IF v_rows_affected > 0 THEN
            -- Log staff stock movement
            INSERT INTO public.stock_movements (
                product_id, warehouse_id, quantity, type,
                reference_id, reason, created_by, created_at
            ) VALUES (
                NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
                NEW.sale_id::text, 'Staff sale - staff stock', v_sale_recorded_by, now()
            );
        ELSE
            -- Deduct from warehouse as fallback (also strict)
            -- Calculate pending outgoing from this warehouse
            SELECT COALESCE(SUM(quantity), 0) INTO v_pending_outgoing
            FROM public.stock_transfers
            WHERE status IN ('pending', 'awaiting_acceptance')
              AND from_warehouse_id = v_warehouse_id
              AND product_id = NEW.product_id;

            UPDATE public.product_stock
            SET quantity = quantity - NEW.quantity,
                updated_at = now()
            WHERE warehouse_id = v_warehouse_id
              AND product_id = NEW.product_id
              AND (quantity - v_pending_outgoing) >= NEW.quantity;
            
            GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
            IF v_rows_affected = 0 THEN
                -- Check why it failed (row missing or insufficient)
                SELECT quantity INTO v_physical_qty FROM public.product_stock 
                WHERE warehouse_id = v_warehouse_id AND product_id = NEW.product_id;
                
                RAISE EXCEPTION 'insufficient_stock: % (Staff/Warehouse fallback failed. Truly Available: %, Physical: %, Pending Outgoing: %)', 
                    v_product_name, 
                    COALESCE(v_physical_qty, 0) - v_pending_outgoing,
                    COALESCE(v_physical_qty, 0),
                    v_pending_outgoing;
            END IF;
                
            -- Log movement
            INSERT INTO public.stock_movements (
                product_id, warehouse_id, quantity, type,
                reference_id, reason, created_by, created_at
            ) VALUES (
                NEW.product_id, v_warehouse_id, -NEW.quantity, 'sale',
                NEW.sale_id::text, 'Staff sale - warehouse fallback', v_sale_recorded_by, now()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
