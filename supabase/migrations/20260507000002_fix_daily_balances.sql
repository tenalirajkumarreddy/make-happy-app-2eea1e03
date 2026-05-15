-- Fix transactions column references (cash -> cash_amount, upi -> upi_amount)

CREATE OR REPLACE FUNCTION public.get_user_daily_balance(p_user_id uuid)
 RETURNS TABLE(today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, today_sent_pending numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_profile_holding NUMERIC;
BEGIN
    SELECT holding_balance INTO v_profile_holding
    FROM public.profiles
    WHERE id = p_user_id;

    v_profile_holding := COALESCE(v_profile_holding, 0);

    SELECT 
        COALESCE(SUM(cash_amount + upi_amount), 0) INTO today_sales
    FROM public.sales s
    WHERE s.recorded_by = p_user_id 
      AND DATE(s.created_at) = v_today;

    SELECT 
        COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO today_payments
    FROM public.transactions t
    WHERE t.recorded_by = p_user_id 
      AND DATE(t.created_at) = v_today;

    SELECT 
        COALESCE(SUM(cash_amount + upi_amount), 0) INTO today_received
    FROM public.handovers h
    WHERE h.handed_to = p_user_id 
      AND h.status = 'confirmed' 
      AND h.handover_date = v_today;

    SELECT 
        COALESCE(SUM(cash_amount + upi_amount), 0) INTO today_sent_confirmed
    FROM public.handovers h
    WHERE h.user_id = p_user_id 
      AND h.status = 'confirmed' 
      AND h.handover_date = v_today;

    SELECT 
        COALESCE(SUM(cash_amount + upi_amount), 0) INTO today_sent_pending
    FROM public.handovers h
    WHERE h.user_id = p_user_id 
      AND h.status = 'awaiting_confirmation' 
      AND h.handover_date = v_today;

    prev_pending := v_profile_holding - (COALESCE(today_sales, 0) + COALESCE(today_payments, 0) + COALESCE(today_received, 0) - COALESCE(today_sent_confirmed, 0));
    total_holding := v_profile_holding;

    RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_staff_balances()
 RETURNS TABLE(user_id uuid, full_name text, role text, today_sales numeric, today_payments numeric, today_received numeric, today_sent_confirmed numeric, prev_pending numeric, total_holding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    r RECORD;
    v_today DATE := CURRENT_DATE;
    v_today_sales NUMERIC;
    v_today_payments NUMERIC;
    v_today_received NUMERIC;
    v_today_sent_confirmed NUMERIC;
    v_prev_pending NUMERIC;
    v_total_holding NUMERIC;
BEGIN
    FOR r IN
        SELECT p.id, p.full_name, pr.role, COALESCE(p.holding_balance, 0) as holding
        FROM public.profiles p
        JOIN public.user_roles pr ON p.id = pr.user_id
        WHERE pr.role IN ('agent', 'pos', 'marketer', 'manager', 'operator', 'super_admin')
    LOOP
        v_total_holding := r.holding;

        SELECT COALESCE(SUM(cash_amount + upi_amount), 0) INTO v_today_sales
        FROM public.sales s
        WHERE s.recorded_by = r.id AND DATE(s.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + COALESCE(upi_amount, 0)), 0) INTO v_today_payments
        FROM public.transactions t
        WHERE t.recorded_by = r.id AND DATE(t.created_at) = v_today;

        SELECT COALESCE(SUM(cash_amount + upi_amount), 0) INTO v_today_received
        FROM public.handovers h
        WHERE h.handed_to = r.id AND h.status = 'confirmed' AND h.handover_date = v_today;

        SELECT COALESCE(SUM(cash_amount + upi_amount), 0) INTO v_today_sent_confirmed
        FROM public.handovers h
        WHERE h.user_id = r.id AND h.status = 'confirmed' AND h.handover_date = v_today;

        v_prev_pending := v_total_holding - (v_today_sales + v_today_payments + v_today_received - v_today_sent_confirmed);

        user_id := r.id;
        full_name := r.full_name;
        role := r.role;
        today_sales := v_today_sales;
        today_payments := v_today_payments;
        today_received := v_today_received;
        today_sent_confirmed := v_today_sent_confirmed;
        prev_pending := v_prev_pending;
        total_holding := v_total_holding;
        RETURN NEXT;
    END LOOP;
END;
$function$;
