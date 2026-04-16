-- supabase/migrations/20260418000005_payroll_functions.sql

-- Function to calculate total amount for a payroll and update it
CREATE OR REPLACE FUNCTION public.update_payroll_total(p_payroll_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_salary NUMERIC;
  total_bonus NUMERIC;
  total_deduction NUMERIC;
BEGIN
  -- Calculate totals from payroll_items
  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'salary' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'bonus' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'deduction' THEN amount ELSE 0 END), 0)
  INTO
    total_salary,
    total_bonus,
    total_deduction
  FROM public.payroll_items
  WHERE payroll_id = p_payroll_id;

  -- Update the payroll record
  UPDATE public.payrolls
  SET
    total_amount = total_salary + total_bonus - total_deduction,
    updated_at = timezone('utc', now())
  WHERE id = p_payroll_id;
END;
$$;

-- Trigger to automatically update payroll total when an item is changed
CREATE OR REPLACE FUNCTION public.handle_payroll_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM public.update_payroll_total(NEW.payroll_id);
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.update_payroll_total(OLD.payroll_id);
  END IF;
  RETURN NULL; -- result is ignored since this is an AFTER trigger
END;
$$;

CREATE TRIGGER on_payroll_item_change
AFTER INSERT OR UPDATE OR DELETE ON public.payroll_items
FOR EACH ROW EXECUTE FUNCTION public.handle_payroll_item_change();


-- Function to process a payroll run
CREATE OR REPLACE FUNCTION public.process_payroll(p_payroll_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First, ensure totals are up to date
  PERFORM public.update_payroll_total(p_payroll_id);

  -- Then, update the status to 'completed'
  UPDATE public.payrolls
  SET
    status = 'completed',
    updated_at = timezone('utc', now())
  WHERE id = p_payroll_id AND status = 'draft';

  -- Here you could add logic to generate payslips, send notifications, etc.
  -- For now, we just update the status.
END;
$$;

-- Grant execute permission to the function
GRANT EXECUTE ON FUNCTION public.update_payroll_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payroll(uuid) TO authenticated;

-- RLS for payrolls and payroll_items should already be in place from previous migration
-- but let's ensure they are correct.

ALTER POLICY "Allow full access to own warehouse data" ON public.payrolls
  USING (warehouse_id IN (SELECT public.get_my_claim('warehouse_id')::uuid));

ALTER POLICY "Allow full access to own warehouse data" ON public.payroll_items
  USING (warehouse_id IN (SELECT public.get_my_claim('warehouse_id')::uuid));
