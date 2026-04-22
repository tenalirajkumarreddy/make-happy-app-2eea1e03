-- Migration: Complete BOM Cost Engine
-- Fixes missing cost calculation functions
-- Date: 2026-04-19

-- ============================================================================
-- 1. Unit Conversion Helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pieces_per_kg(p_piece_weight_grams NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_piece_weight_grams IS NULL OR p_piece_weight_grams <= 0 THEN
    RETURN NULL;
  END IF;
  -- 1 kg = 1000 grams
  -- pieces per kg = 1000 / piece_weight_grams
  RETURN FLOOR(1000.0 / p_piece_weight_grams)::INTEGER;
END;
$$;

COMMENT ON FUNCTION public.get_pieces_per_kg IS 'Calculate how many pieces make 1 kg based on piece weight';

-- ============================================================================
-- 2. Unit Conversion for BOM Quantities
-- ============================================================================

CREATE OR REPLACE FUNCTION public.convert_bom_quantity(
  p_quantity NUMERIC,
  p_from_unit TEXT,
  p_to_unit TEXT,
  p_piece_weight_grams NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result NUMERIC;
  v_pieces_per_kg NUMERIC;
BEGIN
  -- Same unit, no conversion
  IF p_from_unit = p_to_unit THEN
    RETURN p_quantity;
  END IF;
  
  -- kg to pieces
  IF p_from_unit = 'kg' AND p_to_unit = 'pieces' THEN
    IF p_piece_weight_grams IS NULL OR p_piece_weight_grams <= 0 THEN
      RETURN NULL; -- Cannot convert without piece weight
    END IF;
    v_pieces_per_kg := 1000.0 / p_piece_weight_grams;
    RETURN p_quantity * v_pieces_per_kg;
  END IF;
  
  -- pieces to kg
  IF p_from_unit = 'pieces' AND p_to_unit = 'kg' THEN
    IF p_piece_weight_grams IS NULL OR p_piece_weight_grams <= 0 THEN
      RETURN NULL;
    END IF;
    v_pieces_per_kg := 1000.0 / p_piece_weight_grams;
    RETURN p_quantity / v_pieces_per_kg;
  END IF;
  
  -- kg to grams
  IF p_from_unit = 'kg' AND p_to_unit = 'g' THEN
    RETURN p_quantity * 1000;
  END IF;
  
  -- grams to kg
  IF p_from_unit = 'g' AND p_to_unit = 'kg' THEN
    RETURN p_quantity / 1000;
  END IF;
  
  -- Add more conversions as needed
  -- Default: return original (cannot convert)
  RETURN p_quantity;
END;
$$;

-- ============================================================================
-- 3. BOM Cost Calculation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_bom_cost(
  p_product_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_bom_item RECORD;
  v_converted_quantity NUMERIC;
  v_material_cost NUMERIC;
BEGIN
  FOR v_bom_item IN
    SELECT 
      bom.id as bom_id,
      bom.quantity,
      bom.quantity_unit,
      bom.raw_material_id,
      rm.name as material_name,
      rm.unit_cost,
      rm.unit as material_unit,
      rm.piece_weight_grams,
      rm.current_stock
    FROM public.bill_of_materials bom
    JOIN public.raw_materials rm ON bom.raw_material_id = rm.id
    WHERE bom.finished_product_id = p_product_id
    AND (p_warehouse_id IS NULL OR bom.warehouse_id = p_warehouse_id)
    AND rm.is_active = true
  LOOP
    -- Convert quantity to material's unit
    v_converted_quantity := public.convert_bom_quantity(
      v_bom_item.quantity,
      v_bom_item.quantity_unit,
      v_bom_item.material_unit,
      v_bom_item.piece_weight_grams
    );
    
    -- If conversion failed, use original quantity
    IF v_converted_quantity IS NULL THEN
      v_converted_quantity := v_bom_item.quantity;
    END IF;
    
    -- Calculate cost
    v_material_cost := v_converted_quantity * COALESCE(v_bom_item.unit_cost, 0);
    
    -- Check if we have enough stock
    IF v_bom_item.current_stock < v_converted_quantity THEN
      RAISE NOTICE 'Insufficient stock for %: need %, have %',
        v_bom_item.material_name, v_converted_quantity, v_bom_item.current_stock;
    END IF;
    
    v_total_cost := v_total_cost + v_material_cost;
  END LOOP;
  
  RETURN COALESCE(v_total_cost, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_bom_cost IS 'Calculate total material cost for a finished product based on BOM';

-- ============================================================================
-- 4. Total Product Cost (BOM + Overhead)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_total_product_cost(
  p_product_id UUID,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  bom_cost NUMERIC,
  overhead_cost NUMERIC,
  wastage_cost NUMERIC,
  total_cost NUMERIC,
  cost_per_unit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bom_cost NUMERIC;
  v_overhead NUMERIC;
  v_warehouse UUID;
BEGIN
  -- Determine warehouse
  IF p_warehouse_id IS NULL THEN
    SELECT warehouse_id INTO v_warehouse
    FROM public.user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;
  ELSE
    v_warehouse := p_warehouse_id;
  END IF;
  
  -- Calculate BOM cost
  v_bom_cost := public.calculate_bom_cost(p_product_id, v_warehouse);
  
  -- Get overhead per unit
  v_overhead := public.calculate_overhead_per_unit(v_warehouse);
  
  -- Return cost breakdown
  RETURN QUERY SELECT 
    v_bom_cost,
    v_overhead,
    0::NUMERIC as wastage_cost, -- To be calculated separately
    (v_bom_cost + v_overhead),
    (v_bom_cost + v_overhead); -- Per unit if producing 1
END;
$$;

-- ============================================================================
-- 5. Complete WAC Recalculation Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_wac_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_cost NUMERIC;
  v_new_cost NUMERIC;
  v_current_stock NUMERIC;
  v_current_wac NUMERIC;
  v_total_value NUMERIC;
  v_total_qty NUMERIC;
BEGIN
  -- Get current state
  SELECT 
    current_stock,
    unit_cost
  INTO v_current_stock, v_current_wac
  FROM public.raw_materials
  WHERE id = NEW.raw_material_id;
  
  -- If this is the first stock (or reset), use purchase price
  IF COALESCE(v_current_stock, 0) = 0 OR COALESCE(v_current_wac, 0) = 0 THEN
    v_new_cost := NEW.unit_price;
  ELSE
    -- Calculate new WAC
    -- Formula: (old_qty * old_wac + new_qty * new_price) / (old_qty + new_qty)
    v_total_value := (v_current_stock * v_current_wac) + (NEW.quantity * NEW.unit_price);
    v_total_qty := v_current_stock + NEW.quantity;
    
    IF v_total_qty > 0 THEN
      v_new_cost := ROUND(v_total_value / v_total_qty, 2);
    ELSE
      v_new_cost := NEW.unit_price;
    END IF;
  END IF;
  
  -- Update raw material
  UPDATE public.raw_materials
  SET 
    unit_cost = v_new_cost,
    current_stock = COALESCE(current_stock, 0) + NEW.quantity,
    updated_at = now()
  WHERE id = NEW.raw_material_id;
  
  -- Log the cost change
  INSERT INTO public.wac_cost_history (
    raw_material_id,
    old_cost,
    new_cost,
    reason,
    adjustment_amount,
    recorded_by
  ) VALUES (
    NEW.raw_material_id,
    COALESCE(v_current_wac, 0),
    v_new_cost,
    'Purchase: ' || COALESCE(NEW.display_id, 'Manual'),
    NEW.quantity * NEW.unit_price,
    COALESCE(NEW.recorded_by, auth.uid())
  );
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_wac_on_purchase ON public.raw_material_adjustments;

CREATE TRIGGER trg_wac_on_purchase
  AFTER INSERT ON public.raw_material_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_wac_on_purchase();

-- ============================================================================
-- 6. Production Cost Calculation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_production_cost(
  p_production_log_id UUID
)
RETURNS TABLE (
  bom_cost NUMERIC,
  overhead_cost NUMERIC,
  wastage_cost NUMERIC,
  total_cost NUMERIC,
  cost_per_unit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pl RECORD;
  v_bom_cost_per_unit NUMERIC;
  v_overhead NUMERIC;
  v_wastage_cost NUMERIC;
  v_total_cost NUMERIC;
BEGIN
  -- Get production log details
  SELECT * INTO v_pl
  FROM public.production_log
  WHERE id = p_production_log_id;
  
  IF v_pl IS NULL THEN
    RAISE EXCEPTION 'Production log not found: %', p_production_log_id;
  END IF;
  
  -- Calculate BOM cost per unit
  v_bom_cost_per_unit := public.calculate_bom_cost(v_pl.product_id, v_pl.warehouse_id);
  
  -- Get overhead per unit
  v_overhead := public.calculate_overhead_per_unit(v_pl.warehouse_id);
  
  -- Calculate wastage cost
  IF v_pl.wastage_quantity > 0 THEN
    -- Wastage cost = material cost of wasted units
    -- Assuming wastage is % of total production
    v_wastage_cost := (v_bom_cost_per_unit * v_pl.wastage_quantity);
  ELSE
    v_wastage_cost := 0;
  END IF;
  
  -- Total cost for this production run
  v_total_cost := (
    v_bom_cost_per_unit + v_overhead
  ) * v_pl.quantity_produced + v_wastage_cost;
  
  -- Update the production log with calculated costs
  UPDATE public.production_log
  SET 
    wastage_cost = v_wastage_cost,
    updated_at = now()
  WHERE id = p_production_log_id;
  
  RETURN QUERY SELECT 
    v_bom_cost_per_unit * v_pl.quantity_produced,
    v_overhead * v_pl.quantity_produced,
    v_wastage_cost,
    v_total_cost,
    CASE 
      WHEN v_pl.quantity_produced > 0 THEN v_total_cost / v_pl.quantity_produced
      ELSE 0
    END;
END;
$$;

-- ============================================================================
-- 7. Stock Deduction for Production (Auto BOM consumption)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deduct_bom_stock_on_production()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bom_item RECORD;
  v_converted_quantity NUMERIC;
  v_available_stock NUMERIC;
  v_insufficient_items TEXT[];
BEGIN
  -- Loop through BOM items
  FOR v_bom_item IN
    SELECT 
      bom.raw_material_id,
      bom.quantity,
      bom.quantity_unit,
      rm.name,
      rm.current_stock,
      rm.piece_weight_grams,
      rm.unit as material_unit
    FROM public.bill_of_materials bom
    JOIN public.raw_materials rm ON bom.raw_material_id = rm.id
    WHERE bom.finished_product_id = NEW.product_id
    AND bom.warehouse_id = NEW.warehouse_id
  LOOP
    -- Calculate required quantity
    v_converted_quantity := public.convert_bom_quantity(
      bom.quantity * NEW.quantity_produced,
      bom.quantity_unit,
      v_bom_item.material_unit,
      v_bom_item.piece_weight_grams
    );
    
    -- Check stock availability
    IF COALESCE(v_bom_item.current_stock, 0) < v_converted_quantity THEN
      v_insufficient_items := array_append(
        v_insufficient_items,
        v_bom_item.name || ' (need ' || v_converted_quantity || ', have ' || COALESCE(v_bom_item.current_stock, 0) || ')'
      );
    END IF;
  END LOOP;
  
  -- If insufficient stock, raise error
  IF array_length(v_insufficient_items, 1) > 0 THEN
    RAISE EXCEPTION 'Insufficient stock for materials: %', 
      array_to_string(v_insufficient_items, ', ');
  END IF;
  
  -- Deduct stock
  FOR v_bom_item IN
    SELECT 
      bom.raw_material_id,
      bom.quantity,
      bom.quantity_unit,
      rm.piece_weight_grams,
      rm.unit as material_unit
    FROM public.bill_of_materials bom
    JOIN public.raw_materials rm ON bom.raw_material_id = rm.id
    WHERE bom.finished_product_id = NEW.product_id
    AND bom.warehouse_id = NEW.warehouse_id
  LOOP
    v_converted_quantity := public.convert_bom_quantity(
      v_bom_item.quantity * NEW.quantity_produced,
      v_bom_item.quantity_unit,
      v_bom_item.material_unit,
      v_bom_item.piece_weight_grams
    );
    
    -- Update raw material stock
    UPDATE public.raw_materials
    SET 
      current_stock = GREATEST(current_stock - v_converted_quantity, 0),
      updated_at = now()
    WHERE id = v_bom_item.raw_material_id;
    
    -- Log stock movement
    INSERT INTO public.raw_material_adjustments (
      raw_material_id,
      warehouse_id,
      quantity,
      adjustment_type,
      reason,
      recorded_by
    ) VALUES (
      v_bom_item.raw_material_id,
      NEW.warehouse_id,
      -v_converted_quantity,
      'production_consumption',
      'Production: ' || NEW.id,
      NEW.created_by
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger for production
DROP TRIGGER IF EXISTS trg_deduct_bom_stock ON public.production_log;

CREATE TRIGGER trg_deduct_bom_stock
  AFTER INSERT ON public.production_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_bom_stock_on_production();

-- ============================================================================
-- 8. Cost Variance Analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_production_variance(
  p_production_log_id UUID
)
RETURNS TABLE (
  expected_cost NUMERIC,
  actual_cost NUMERIC,
  variance_amount NUMERIC,
  variance_percent NUMERIC,
  variance_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pl RECORD;
  v_bom_cost_per_unit NUMERIC;
  v_expected_cost NUMERIC;
  v_actual_cost NUMERIC;
  v_variance NUMERIC;
  v_variance_pct NUMERIC;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_pl FROM public.production_log WHERE id = p_production_log_id;
  
  IF v_pl IS NULL THEN
    RAISE EXCEPTION 'Production log not found';
  END IF;
  
  -- Expected cost from BOM
  v_bom_cost_per_unit := public.calculate_bom_cost(v_pl.product_id, v_pl.warehouse_id);
  v_expected_cost := v_bom_cost_per_unit * v_pl.quantity_produced;
  
  -- Actual cost (from materials consumed)
  SELECT COALESCE(SUM(-quantity * unit_cost), 0)
  INTO v_actual_cost
  FROM public.raw_material_adjustments
  WHERE reason LIKE '%Production: ' || p_production_log_id || '%'
  AND adjustment_type = 'production_consumption';
  
  -- Calculate variance
  v_variance := v_actual_cost - v_expected_cost;
  v_variance_pct := CASE 
    WHEN v_expected_cost > 0 THEN (v_variance / v_expected_cost) * 100
    ELSE 0
  END;
  
  -- Determine reason
  IF v_variance > 0 THEN
    v_reason := 'Over cost: Possible excess material usage';
  ELSIF v_variance < 0 THEN
    v_reason := 'Under cost: Possible material savings';
  ELSE
    v_reason := 'On target: Costs match expected';
  END IF;
  
  IF v_pl.wastage_quantity > 0 THEN
    v_reason := v_reason || ', Wastage: ' || v_pl.wastage_quantity || ' units';
  END IF;
  
  RETURN QUERY SELECT 
    v_expected_cost,
    v_actual_cost,
    v_variance,
    v_variance_pct,
    v_reason;
END;
$$;

-- ============================================================================
-- 9. Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_pieces_per_kg TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_bom_quantity TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_bom_cost TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_total_product_cost TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_production_cost TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_production_variance TO authenticated;

-- ============================================================================
-- 10. Comments
-- ============================================================================

COMMENT ON FUNCTION public.get_pieces_per_kg IS 'Calculate pieces per kg based on piece weight';
COMMENT ON FUNCTION public.convert_bom_quantity IS 'Convert BOM quantities between units (kg, pieces, g)';
COMMENT ON FUNCTION public.calculate_bom_cost IS 'Calculate total material cost from BOM';
COMMENT ON FUNCTION public.calculate_total_product_cost IS 'Calculate total cost: BOM + Overhead';
COMMENT ON FUNCTION public.calculate_production_cost IS 'Calculate actual production cost with wastage';
COMMENT ON FUNCTION public.calculate_production_variance IS 'Compare expected vs actual production costs';
COMMENT ON TRIGGER trg_wac_on_purchase ON public.raw_material_adjustments IS 'Auto-update WAC on purchase';
COMMENT ON TRIGGER trg_deduct_bom_stock ON public.production_log IS 'Auto-deduct BOM stock on production';

-- ============================================================================
-- 11. Migration Metadata
-- ============================================================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('20260419000006', 'complete_bom_cost_engine', now());

-- Reload schema
NOTIFY pgrst, 'reload schema';
