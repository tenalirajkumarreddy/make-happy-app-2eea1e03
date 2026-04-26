-- =============================================================================
-- Migration: Stock Transfer Notifications & Request/Approval System
-- Date: 2026-04-26
-- Description: 
--   1. Add notification triggers for stock transfers
--   2. Create stock_requests table for user→user and user→warehouse transfers
--   3. Add approval workflow functions
-- =============================================================================

-- =============================================================================
-- TABLE: stock_requests (for pending approvals)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stock_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT UNIQUE,
    
    -- Request details
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    
    -- Transfer parties
    from_user_id UUID REFERENCES auth.users(id),  -- NULL if from warehouse
    from_warehouse_id UUID REFERENCES public.warehouses(id),  -- NULL if from user
    to_user_id UUID REFERENCES auth.users(id),  -- NULL if to warehouse
    to_warehouse_id UUID REFERENCES public.warehouses(id),  -- NULL if to user
    
    -- Request metadata
    request_type TEXT NOT NULL CHECK (request_type IN ('user_to_user', 'user_to_warehouse', 'warehouse_to_user')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    
    -- Requester and approver
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES auth.users(id),
    rejected_at TIMESTAMPTZ,
    
    -- Notes
    request_notes TEXT,
    response_notes TEXT,
    
    -- Linked transfer (once approved)
    transfer_id UUID REFERENCES public.stock_transfers(id),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON public.stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_to_user ON public.stock_requests(to_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_stock_requests_from_user ON public.stock_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_requested_by ON public.stock_requests(requested_by);

-- Enable RLS
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own requests"
ON public.stock_requests FOR SELECT
TO authenticated
USING (
    requested_by = auth.uid() 
    OR from_user_id = auth.uid() 
    OR to_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('super_admin', 'manager')
    )
);

CREATE POLICY "Users can create requests"
ON public.stock_requests FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admins and managers can update requests"
ON public.stock_requests FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('super_admin', 'manager')
    )
    OR to_user_id = auth.uid()  -- Recipient can approve/reject user_to_user
);

-- =============================================================================
-- FUNCTION: Request Stock (User → User or User → Warehouse)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_stock_transfer(
    p_product_id UUID,
    p_quantity NUMERIC,
    p_from_user_id UUID,  -- NULL if from warehouse
    p_from_warehouse_id UUID,  -- NULL if from user
    p_to_user_id UUID,  -- NULL if to warehouse
    p_to_warehouse_id UUID,  -- NULL if to user
    p_request_type TEXT,  -- 'user_to_user', 'user_to_warehouse', 'warehouse_to_user'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id UUID;
    v_display_id TEXT;
    v_from_name TEXT;
    v_to_name TEXT;
    v_product_name TEXT;
BEGIN
    -- Validate input
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity must be greater than 0');
    END IF;
    
    -- Get product name
    SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id;
    IF v_product_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    -- Generate display ID
    v_display_id := public.generate_display_id('REQ', 'stock_request_seq');
    
    -- Create request
    INSERT INTO public.stock_requests (
        display_id, product_id, quantity,
        from_user_id, from_warehouse_id, to_user_id, to_warehouse_id,
        request_type, status, requested_by, request_notes
    ) VALUES (
        v_display_id, p_product_id, p_quantity,
        p_from_user_id, p_from_warehouse_id, p_to_user_id, p_to_warehouse_id,
        p_request_type, 'pending', auth.uid(), p_notes
    ) RETURNING id INTO v_request_id;
    
    -- Get names for notification
    SELECT full_name INTO v_from_name FROM public.profiles WHERE user_id = COALESCE(p_from_user_id, auth.uid());
    SELECT full_name INTO v_to_name FROM public.profiles WHERE user_id = COALESCE(p_to_user_id, auth.uid());
    
    -- Send notification to approver (for user→warehouse) or recipient (for user→user)
    IF p_request_type = 'user_to_warehouse' THEN
        -- Notify admins/managers
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        SELECT user_id, 
               'Stock Return Requested',
               v_from_name || ' requested to return ' || p_quantity || 'x ' || v_product_name || ' to warehouse',
               'system',
               'stock_request',
               v_request_id::TEXT
        FROM public.user_roles 
        WHERE role IN ('super_admin', 'manager');
    ELSIF p_request_type = 'user_to_user' AND p_to_user_id IS NOT NULL THEN
        -- Notify recipient
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (p_to_user_id,
                'Stock Transfer Request',
                v_from_name || ' wants to transfer ' || p_quantity || 'x ' || v_product_name || ' to you',
                'system',
                'stock_request',
                v_request_id::TEXT);
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'display_id', v_display_id,
        'message', 'Request submitted successfully'
    );
END;
$$;

-- =============================================================================
-- FUNCTION: Approve/Reject Stock Request
-- =============================================================================
CREATE OR REPLACE FUNCTION public.respond_stock_request(
    p_request_id UUID,
    p_action TEXT,  -- 'approve' or 'reject'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_transfer_result JSONB;
    v_approver_name TEXT;
    v_recipient_id UUID;
BEGIN
    -- Get request details
    SELECT * INTO v_request FROM public.stock_requests WHERE id = p_request_id;
    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;
    
    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request already ' || v_request.status);
    END IF;
    
    -- Check permissions
    IF v_request.request_type = 'user_to_user' THEN
        -- Recipient can approve
        IF v_request.to_user_id != auth.uid() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Only the recipient can approve this request');
        END IF;
        v_recipient_id := v_request.from_user_id;
    ELSE
        -- Admin/manager required for warehouse transfers
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('super_admin', 'manager')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
        END IF;
        v_recipient_id := v_request.requested_by;
    END IF;
    
    -- Get approver name
    SELECT full_name INTO v_approver_name FROM public.profiles WHERE user_id = auth.uid();
    
    IF p_action = 'approve' THEN
        -- Execute the transfer based on type
        IF v_request.request_type = 'user_to_user' THEN
            -- Staff to staff transfer
            v_transfer_result := public.batch_stock_transfer(
                jsonb_build_array(jsonb_build_object(
                    'product_id', v_request.product_id,
                    'quantity', v_request.quantity,
                    'transfer_type', 'staff_to_staff',
                    'from_user_id', v_request.from_user_id,
                    'to_user_id', v_request.to_user_id,
                    'from_warehouse_id', v_request.from_warehouse_id,
                    'to_warehouse_id', v_request.to_warehouse_id,
                    'description', COALESCE(v_request.request_notes, 'Approved transfer request')
                ))::jsonb,
                auth.uid()
            );
        ELSIF v_request.request_type = 'user_to_warehouse' THEN
            -- Staff to warehouse (return)
            v_transfer_result := public.batch_stock_transfer(
                jsonb_build_array(jsonb_build_object(
                    'product_id', v_request.product_id,
                    'quantity', v_request.quantity,
                    'transfer_type', 'staff_to_warehouse',
                    'from_user_id', v_request.from_user_id,
                    'to_warehouse_id', v_request.to_warehouse_id,
                    'description', COALESCE(v_request.request_notes, 'Approved return request')
                ))::jsonb,
                auth.uid()
            );
        END IF;
        
        -- Check if transfer succeeded
        IF NOT (v_transfer_result->>'success')::boolean THEN
            RETURN jsonb_build_object('success', false, 'error', v_transfer_result->>'error');
        END IF;
        
        -- Update request
        UPDATE public.stock_requests 
        SET status = 'approved',
            approved_by = auth.uid(),
            approved_at = NOW(),
            response_notes = p_notes,
            transfer_id = (v_transfer_result->'transfers'->0->>'id')::uuid
        WHERE id = p_request_id;
        
        -- Notify requester
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (v_recipient_id,
                'Stock Request Approved',
                v_approver_name || ' approved your request for ' || v_request.quantity || ' items',
                'system',
                'stock_request',
                p_request_id::TEXT);
                
    ELSIF p_action = 'reject' THEN
        -- Update request
        UPDATE public.stock_requests 
        SET status = 'rejected',
            rejected_by = auth.uid(),
            rejected_at = NOW(),
            response_notes = p_notes
        WHERE id = p_request_id;
        
        -- Notify requester
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
        VALUES (v_recipient_id,
                'Stock Request Rejected',
                v_approver_name || ' rejected your request: ' || COALESCE(p_notes, 'No reason provided'),
                'system',
                'stock_request',
                p_request_id::TEXT);
    END IF;
    
    RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

-- =============================================================================
-- TRIGGER: Notify on Direct Stock Transfer (Admin/Manager initiated)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_stock_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product_name TEXT;
    v_from_name TEXT;
    v_quantity NUMERIC;
BEGIN
    -- Only notify on new transfers
    IF TG_OP = 'INSERT' THEN
        -- Get product name
        SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
        v_quantity := NEW.quantity;
        
        -- Get sender name
        SELECT full_name INTO v_from_name 
        FROM public.profiles 
        WHERE user_id = COALESCE(NEW.from_user_id, NEW.created_by);
        
        -- Notify recipient if it's a direct transfer
        IF NEW.transfer_type IN ('warehouse_to_staff', 'staff_to_staff') AND NEW.to_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
            VALUES (NEW.to_user_id,
                    'Stock Received',
                    'You received ' || v_quantity || 'x ' || COALESCE(v_product_name, 'items') || ' from ' || COALESCE(v_from_name, 'warehouse'),
                    'system',
                    'stock_transfer',
                    NEW.id::TEXT);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS stock_transfer_notification ON public.stock_transfers;
CREATE TRIGGER stock_transfer_notification
AFTER INSERT ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.notify_stock_transfer();

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.request_stock_transfer(UUID, NUMERIC, UUID, UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_stock_request(UUID, TEXT, TEXT) TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_requests TO authenticated;
