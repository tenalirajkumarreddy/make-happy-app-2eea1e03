-- ============================================================================
-- MIGRATION: Vendor Balance Tracking System
-- Applied: 2026-04-12
-- ============================================================================
-- Purpose: Track vendor balances and transactions

-- 1. Add balance columns to vendors table
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_purchases NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_payments NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_terms INTEGER DEFAULT 30; -- Days

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vendors_balance ON public.vendors(current_balance) WHERE current_balance != 0;
CREATE INDEX IF NOT EXISTS idx_vendors_credit ON public.vendors(credit_limit) WHERE credit_limit > 0;

-- 2. Create vendor_transactions table
CREATE TABLE IF NOT EXISTS public.vendor_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT UNIQUE NOT NULL,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'credit_note', 'debit_note', 'opening_balance')),
    amount NUMERIC NOT NULL DEFAULT 0,
    balance_before NUMERIC NOT NULL DEFAULT 0,
    balance_after NUMERIC NOT NULL DEFAULT 0,
    reference_id TEXT, -- Link to purchase_id, payment_id, etc.
    reference_type TEXT, -- 'purchase', 'raw_material_adjustment', etc.
    description TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_vendor ON public.vendor_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_type ON public.vendor_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_created ON public.vendor_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_reference ON public.vendor_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.vendor_transactions ENABLE ROW LEVEL SECURITY;

-- 3. Create update_vendor_balance trigger
CREATE OR REPLACE FUNCTION public.update_vendor_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_id UUID;
    v_amount NUMERIC;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Get vendor ID based on transaction type
    IF TG_TABLE_NAME = 'purchases' THEN
        v_vendor_id := NEW.vendor_id;
        v_amount := NEW.total_amount;
    ELSIF TG_TABLE_NAME = 'raw_material_adjustments' THEN
        -- Get vendor from adjustment if available
        SELECT vendor_id INTO v_vendor_id
        FROM public.raw_material_adjustments
        WHERE id = NEW.id;
        v_amount := NEW.quantity_change * COALESCE(NEW.unit_price, 0);
    END IF;
    
    -- Skip if no vendor
    IF v_vendor_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get current balance
    SELECT current_balance INTO v_old_balance
    FROM public.vendors
    WHERE id = v_vendor_id
    FOR UPDATE;
    
    -- Calculate new balance (purchases increase balance owed TO vendor)
    IF TG_TABLE_NAME = 'purchases' THEN
        v_new_balance := COALESCE(v_old_balance, 0) + COALESCE(v_amount, 0);
    ELSE
        v_new_balance := COALESCE(v_old_balance, 0) + COALESCE(v_amount, 0);
    END IF;
    
    -- Update vendor
    UPDATE public.vendors
    SET 
        current_balance = v_new_balance,
        total_purchases = CASE WHEN TG_TABLE_NAME = 'purchases' THEN total_purchases + COALESCE(v_amount, 0) ELSE total_purchases END,
        last_purchase_at = CASE WHEN TG_TABLE_NAME = 'purchases' THEN NOW() ELSE last_purchase_at END,
        updated_at = NOW()
    WHERE id = v_vendor_id;
    
    RETURN NEW;
END;
$$;

-- Apply trigger to purchases
DROP TRIGGER IF EXISTS trigger_update_vendor_balance_on_purchase ON public.purchases;
CREATE TRIGGER trigger_update_vendor_balance_on_purchase
    AFTER INSERT ON public.purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vendor_balance();

-- 4. Create record_vendor_purchase function
CREATE OR REPLACE FUNCTION public.record_vendor_purchase(
    p_vendor_id UUID,
    p_warehouse_id UUID,
    p_items JSONB, -- Array of {raw_material_id, quantity, unit_price}
    p_total_amount NUMERIC,
    p_invoice_number TEXT DEFAULT NULL,
    p_invoice_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purchase_id UUID;
    v_display_id TEXT;
    v_item JSONB;
    v_vendor_balance NUMERIC;
    v_vendor_name TEXT;
BEGIN
    -- Generate display ID
    v_display_id := 'PUR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6));
    
    -- Get vendor info
    SELECT name, current_balance INTO v_vendor_name, v_vendor_balance
    FROM public.vendors
    WHERE id = p_vendor_id;
    
    IF v_vendor_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Vendor not found');
    END IF;
    
    -- Create purchase record
    INSERT INTO public.purchases (
        display_id,
        vendor_id,
        warehouse_id,
        total_amount,
        invoice_number,
        invoice_date,
        notes,
        status,
        created_by
    ) VALUES (
        v_display_id,
        p_vendor_id,
        p_warehouse_id,
        p_total_amount,
        p_invoice_number,
        COALESCE(p_invoice_date, CURRENT_DATE),
        p_notes,
        'completed',
        COALESCE(p_user_id, auth.uid())
    )
    RETURNING id INTO v_purchase_id;
    
    -- Create purchase items and update stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.purchase_items (
            purchase_id,
            raw_material_id,
            quantity,
            unit_price,
            total_price
        ) VALUES (
            v_purchase_id,
            (v_item->>'raw_material_id')::UUID,
            (v_item->>'quantity')::NUMERIC,
            (v_item->>'unit_price')::NUMERIC,
            ((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC)
        );
        
        -- Update raw material stock
        INSERT INTO public.raw_material_stock (raw_material_id, warehouse_id, quantity)
        VALUES ((v_item->>'raw_material_id')::UUID, p_warehouse_id, (v_item->>'quantity')::NUMERIC)
        ON CONFLICT (raw_material_id, warehouse_id)
        DO UPDATE SET 
            quantity = raw_material_stock.quantity + EXCLUDED.quantity,
            updated_at = NOW();
    END LOOP;
    
    -- Create vendor transaction record
    INSERT INTO public.vendor_transactions (
        display_id,
        vendor_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_id,
        reference_type,
        description,
        created_by
    ) VALUES (
        'VTRANS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6)),
        p_vendor_id,
        'purchase',
        p_total_amount,
        v_vendor_balance,
        v_vendor_balance + p_total_amount,
        v_purchase_id::TEXT,
        'purchase',
        'Purchase ' || v_display_id || COALESCE(': ' || p_notes, ''),
        COALESCE(p_user_id, auth.uid())
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'display_id', v_display_id,
        'vendor_name', v_vendor_name,
        'amount', p_total_amount,
        'new_balance', v_vendor_balance + p_total_amount
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Create record_vendor_payment function
CREATE OR REPLACE FUNCTION public.record_vendor_payment(
    p_vendor_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'cash',
    p_reference_number TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_balance NUMERIC;
    v_vendor_name TEXT;
    v_new_balance NUMERIC;
BEGIN
    -- Get vendor info
    SELECT name, current_balance INTO v_vendor_name, v_vendor_balance
    FROM public.vendors
    WHERE id = p_vendor_id;
    
    IF v_vendor_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Vendor not found');
    END IF;
    
    -- Validate payment amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than 0');
    END IF;
    
    -- Calculate new balance (payment reduces balance)
    v_new_balance := GREATEST(0, v_vendor_balance - p_amount);
    
    -- Update vendor balance
    UPDATE public.vendors
    SET 
        current_balance = v_new_balance,
        total_payments = total_payments + p_amount,
        last_payment_at = NOW(),
        updated_at = NOW()
    WHERE id = p_vendor_id;
    
    -- Create vendor transaction record
    INSERT INTO public.vendor_transactions (
        display_id,
        vendor_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        description,
        notes,
        created_by
    ) VALUES (
        'VTRANS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6)),
        p_vendor_id,
        'payment',
        p_amount,
        v_vendor_balance,
        v_new_balance,
        'payment',
        'Payment ' || p_payment_method || COALESCE(' Ref: ' || p_reference_number, ''),
        p_notes,
        COALESCE(p_user_id, auth.uid())
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'vendor_name', v_vendor_name,
        'amount_paid', p_amount,
        'old_balance', v_vendor_balance,
        'new_balance', v_new_balance
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_vendor_purchase TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment TO authenticated;

-- 6. Create vendor_balance_summary view
DROP VIEW IF EXISTS public.vendor_balance_summary;
CREATE VIEW public.vendor_balance_summary AS
SELECT 
    v.*,
    CASE 
        WHEN v.credit_limit > 0 THEN 
            ROUND((v.current_balance / v.credit_limit) * 100, 2)
        ELSE 0
    END as credit_utilization_percent,
    CASE 
        WHEN v.credit_limit > 0 AND v.current_balance >= v.credit_limit THEN 'over_limit'
        WHEN v.credit_limit > 0 AND v.current_balance >= v.credit_limit * 0.8 THEN 'near_limit'
        WHEN v.current_balance > 0 THEN 'active'
        ELSE 'paid'
    END as balance_status,
    COALESCE(v.total_purchases - v.total_payments, 0) as net_purchases,
    EXTRACT(DAY FROM (NOW() - v.last_purchase_at)) as days_since_last_purchase
FROM public.vendors v;

-- Grant access
GRANT SELECT ON public.vendor_balance_summary TO authenticated;

-- 7. Create RLS policies for vendor_transactions
CREATE POLICY "vendor_transactions_super_admin_all" ON public.vendor_transactions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "vendor_transactions_manager_all" ON public.vendor_transactions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'));

CREATE POLICY "vendor_transactions_view_own" ON public.vendor_transactions
    FOR SELECT USING (created_by = auth.uid());

-- Add comments
COMMENT ON TABLE public.vendor_transactions IS 'Transaction history for vendors including purchases and payments';
COMMENT ON FUNCTION public.record_vendor_purchase IS 'Records a vendor purchase and updates balances';
COMMENT ON FUNCTION public.record_vendor_payment IS 'Records a vendor payment and updates balances';
COMMENT ON VIEW public.vendor_balance_summary IS 'Vendor summary with balance calculations and status';
