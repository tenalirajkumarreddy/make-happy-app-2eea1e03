-- Fix 3 issues with handover confirmation balance flow:
-- 1. Sender's staff_cash_accounts never decreases on confirm
-- 2. Race condition — no lock protection on confirm
-- 3. Two competing implementations (confirm_handover vs confirm_handover_v2)

-- Drop old versions first
DROP FUNCTION IF EXISTS public.confirm_handover(UUID, UUID);
DROP FUNCTION IF EXISTS public.confirm_handover_v2(UUID, UUID);

-- Consolidated confirm_handover with advisory lock + race condition protection
CREATE OR REPLACE FUNCTION public.confirm_handover(
  p_handover_id UUID,
  p_confirmed_by UUID
)
RETURNS TABLE(id UUID, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.handovers WHERE id = p_handover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;

  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Handover is already confirmed'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Cannot confirm a cancelled handover'; END IF;
  IF v_status != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Invalid handover status: %. Only pending handovers can be confirmed', v_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.handovers WHERE id = p_handover_id AND handed_to = p_confirmed_by
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_confirmed_by AND role IN ('super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm this handover';
  END IF;

  PERFORM pg_advisory_lock(hashtext(p_handover_id::text));

  SELECT status INTO v_status FROM public.handovers WHERE id = p_handover_id;
  IF v_status != 'awaiting_confirmation' THEN
    PERFORM pg_advisory_unlock(hashtext(p_handover_id::text));
    RAISE EXCEPTION 'Handover was modified by another transaction. Current status: %', v_status;
  END IF;

  UPDATE public.handovers
  SET status       = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = NOW(),
      updated_at   = NOW()
  WHERE public.handovers.id = p_handover_id;

  PERFORM pg_advisory_unlock(hashtext(p_handover_id::text));

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (p_confirmed_by, 'Confirmed handover', 'handover', p_handover_id,
    jsonb_build_object('handover_id', p_handover_id, 'confirmed_by', p_confirmed_by));

  RETURN QUERY SELECT h.id, h.status::TEXT FROM public.handovers h WHERE h.id = p_handover_id;
END;
$$;

-- Fix trigger: also decrease sender's staff_cash_accounts on confirm
CREATE OR REPLACE FUNCTION public.create_income_on_handover_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    SELECT ur.warehouse_id INTO v_warehouse_id
    FROM public.user_roles ur
    WHERE ur.user_id = NEW.user_id
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
      SELECT id INTO v_warehouse_id
      FROM public.warehouses
      ORDER BY created_at
      LIMIT 1;
    END IF;

    INSERT INTO public.income_entries (
      entry_type, source_type, source_id,
      cash_amount, upi_amount,
      recorded_by, warehouse_id, notes
    ) VALUES (
      'collection', 'handover', NEW.id,
      COALESCE(NEW.cash_amount, 0),
      COALESCE(NEW.upi_amount, 0),
      NEW.confirmed_by,
      v_warehouse_id,
      'Handover from ' ||
        COALESCE((SELECT full_name FROM public.profiles WHERE user_id = NEW.user_id), 'Staff') ||
        ' on ' || TO_CHAR(NEW.handover_date, 'YYYY-MM-DD')
    );

    -- Increase receiver's staff_cash_accounts
    UPDATE public.staff_cash_accounts
    SET
      cash_amount = COALESCE(cash_amount, 0) + COALESCE(NEW.cash_amount, 0),
      upi_amount  = COALESCE(upi_amount, 0)  + COALESCE(NEW.upi_amount, 0),
      updated_at  = NOW()
    WHERE user_id = NEW.confirmed_by;

    IF NOT FOUND THEN
      INSERT INTO public.staff_cash_accounts (
        user_id, warehouse_id,
        cash_amount, upi_amount,
        account_type
      ) VALUES (
        NEW.confirmed_by, v_warehouse_id,
        COALESCE(NEW.cash_amount, 0),
        COALESCE(NEW.upi_amount, 0),
        'manager'
      );
    END IF;

    -- Decrease sender's staff_cash_accounts if they have one
    UPDATE public.staff_cash_accounts
    SET
      cash_amount = GREATEST(COALESCE(cash_amount, 0) - COALESCE(NEW.cash_amount, 0), 0),
      upi_amount  = GREATEST(COALESCE(upi_amount, 0)  - COALESCE(NEW.upi_amount, 0), 0),
      updated_at  = NOW()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;
