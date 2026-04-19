-- Migration to unify manufacturing expenses with general expenses

-- 1. Add boolean to expense_categories
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS is_manufacturing_overhead BOOLEAN DEFAULT false;

-- 2. Update specific categories to be manufacturing overhead
UPDATE public.expense_categories 
SET is_manufacturing_overhead = true 
WHERE name IN ('Rent', 'Electricity', 'Salaries', 'Fixed Costs', 'Utilities', 'Maintenance', 'Fuel', 'Transportation');

-- 3. Replace the calculate_overhead_per_unit function to use 'expenses'
CREATE OR REPLACE FUNCTION public.calculate_overhead_per_unit(p_warehouse_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_expenses NUMERIC;
  v_total_production INTEGER;
  v_period DATE;
BEGIN
  -- Use previous month
  v_period := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::DATE;

  SELECT COALESCE(SUM(e.amount), 0) INTO v_total_expenses
  FROM public.expenses e
  JOIN public.expense_categories ec ON e.category_id = ec.id
  WHERE e.warehouse_id = p_warehouse_id 
    AND ec.is_manufacturing_overhead = true
    AND e.expense_date >= v_period 
    AND e.expense_date < (v_period + INTERVAL '1 month')::DATE;

  SELECT COALESCE(SUM(quantity_produced), 0) INTO v_total_production
  FROM public.production_log
  WHERE warehouse_id = p_warehouse_id
    AND production_date >= v_period
    AND production_date < (v_period + INTERVAL '1 month')::DATE;

  -- If no previous month data, try current month
  IF v_total_expenses = 0 AND v_total_production = 0 THEN
    v_period := date_trunc('month', CURRENT_DATE)::DATE;
    
    SELECT COALESCE(SUM(e.amount), 0) INTO v_total_expenses
    FROM public.expenses e
    JOIN public.expense_categories ec ON e.category_id = ec.id
    WHERE e.warehouse_id = p_warehouse_id 
      AND ec.is_manufacturing_overhead = true
      AND e.expense_date >= v_period 
      AND e.expense_date < (v_period + INTERVAL '1 month')::DATE;

    SELECT COALESCE(SUM(quantity_produced), 0) INTO v_total_production
    FROM public.production_log
    WHERE warehouse_id = p_warehouse_id
      AND production_date >= v_period
      AND production_date < (v_period + INTERVAL '1 month')::DATE;
  END IF;

  IF v_total_production = 0 THEN RETURN 0; END IF;
  RETURN ROUND(v_total_expenses / v_total_production, 2);
END;
$function$;

-- 4. Drop the redundant manufacturing_expenses table
DROP TABLE IF EXISTS public.manufacturing_expenses;
