-- Expense Claims / Reimbursement System
-- Allows field staff to claim out-of-pocket expenses for approval by admins
-- =====================================================

-- =====================================================
-- 1. EXPENSE CLAIMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id text UNIQUE NOT NULL,
  
  -- Who submitted the claim
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  -- Category (current - can be changed by reviewer)
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  
  -- Original category (preserved for audit)
  original_category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  
  -- Claim details
  amount numeric NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  receipt_url text, -- Optional receipt image URL (future enhancement)
  
  -- Workflow status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Review information
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewer_notes text,
  
  -- Amount can be adjusted by reviewer (original preserved in amount field via audit)
  approved_amount numeric CHECK (approved_amount IS NULL OR approved_amount >= 0),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_expense_claims_user ON expense_claims(user_id);
CREATE INDEX idx_expense_claims_status ON expense_claims(status);
CREATE INDEX idx_expense_claims_date ON expense_claims(expense_date DESC);
CREATE INDEX idx_expense_claims_created ON expense_claims(created_at DESC);
CREATE INDEX idx_expense_claims_category ON expense_claims(category_id);

-- Composite index for user + status queries
CREATE INDEX idx_expense_claims_user_status ON expense_claims(user_id, status);

-- =====================================================
-- 2. EXPENSE CLAIMS HISTORY TABLE (Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_claims_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  
  -- What changed
  action text NOT NULL CHECK (action IN ('created', 'category_changed', 'amount_adjusted', 'approved', 'rejected', 'reverted')),
  
  -- Who made the change
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Snapshot of relevant values at time of change
  old_status text,
  new_status text,
  old_category_id uuid,
  new_category_id uuid,
  old_amount numeric,
  new_amount numeric,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_claims_history_claim ON expense_claims_history(claim_id);
CREATE INDEX idx_expense_claims_history_created ON expense_claims_history(created_at DESC);

-- =====================================================
-- 3. RLS POLICIES
-- =====================================================
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claims_history ENABLE ROW LEVEL SECURITY;

-- Staff can view their own claims
CREATE POLICY "Users can view own expense claims" ON expense_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins/managers can view all claims
CREATE POLICY "Admins can view all expense claims" ON expense_claims
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
  );

-- Staff can insert their own claims (status must be pending)
CREATE POLICY "Users can create own expense claims" ON expense_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND status = 'pending'
  );

-- Admins can update any claim (for approval/rejection/category change)
CREATE POLICY "Admins can update expense claims" ON expense_claims
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
  );

-- Users can view history of their own claims
CREATE POLICY "Users can view own claim history" ON expense_claims_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expense_claims 
      WHERE expense_claims.id = expense_claims_history.claim_id 
      AND expense_claims.user_id = auth.uid()
    )
  );

-- Admins can view all history
CREATE POLICY "Admins can view all claim history" ON expense_claims_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
  );

-- Admins can insert history records
CREATE POLICY "Admins can insert claim history" ON expense_claims_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'manager')
    )
  );

-- System can insert history (for triggers)
CREATE POLICY "System can insert claim history" ON expense_claims_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================================================
-- 4. UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_expense_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_expense_claims_updated_at
  BEFORE UPDATE ON expense_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_expense_claims_updated_at();

-- =====================================================
-- 5. HISTORY TRIGGER (Automatic audit trail)
-- =====================================================
CREATE OR REPLACE FUNCTION log_expense_claim_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO expense_claims_history (
      claim_id, action, changed_by, new_status, new_category_id, new_amount
    ) VALUES (
      NEW.id, 'created', NEW.user_id, NEW.status, NEW.category_id, NEW.amount
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Log status changes (approval/rejection)
    IF OLD.status != NEW.status THEN
      INSERT INTO expense_claims_history (
        claim_id, action, changed_by, 
        old_status, new_status, 
        old_amount, new_amount,
        notes
      ) VALUES (
        NEW.id,
        CASE 
          WHEN NEW.status = 'approved' THEN 'approved'
          WHEN NEW.status = 'rejected' THEN 'rejected'
          WHEN OLD.status IN ('approved', 'rejected') AND NEW.status = 'pending' THEN 'reverted'
          ELSE 'created'
        END,
        COALESCE(NEW.reviewed_by, auth.uid()),
        OLD.status, NEW.status,
        OLD.approved_amount, NEW.approved_amount,
        NEW.reviewer_notes
      );
    END IF;
    
    -- Log category changes
    IF OLD.category_id IS DISTINCT FROM NEW.category_id AND OLD.status = NEW.status THEN
      INSERT INTO expense_claims_history (
        claim_id, action, changed_by,
        old_category_id, new_category_id,
        notes
      ) VALUES (
        NEW.id, 'category_changed', COALESCE(NEW.reviewed_by, auth.uid()),
        OLD.category_id, NEW.category_id,
        NEW.reviewer_notes
      );
    END IF;
    
    -- Log amount adjustments
    IF OLD.approved_amount IS DISTINCT FROM NEW.approved_amount AND OLD.status = NEW.status THEN
      INSERT INTO expense_claims_history (
        claim_id, action, changed_by,
        old_amount, new_amount,
        notes
      ) VALUES (
        NEW.id, 'amount_adjusted', COALESCE(NEW.reviewed_by, auth.uid()),
        OLD.approved_amount, NEW.approved_amount,
        NEW.reviewer_notes
      );
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_expense_claim_changes
  AFTER INSERT OR UPDATE ON expense_claims
  FOR EACH ROW
  EXECUTE FUNCTION log_expense_claim_changes();

-- =====================================================
-- 6. HELPER VIEWS
-- =====================================================

-- View for staff balance calculation (approved expense claims reduce balance)
CREATE OR REPLACE VIEW expense_claims_by_user AS
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
  COALESCE(SUM(COALESCE(approved_amount, amount)) FILTER (WHERE status = 'approved'), 0) AS approved_amount,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
FROM expense_claims
GROUP BY user_id;

-- Grant access to the view
GRANT SELECT ON expense_claims_by_user TO authenticated;

-- =====================================================
-- 7. COMMENTS
-- =====================================================
COMMENT ON TABLE expense_claims IS 'Staff expense reimbursement claims requiring manager approval';
COMMENT ON TABLE expense_claims_history IS 'Audit trail for expense claim status and category changes';
COMMENT ON COLUMN expense_claims.original_category_id IS 'Preserved category from initial submission (audit trail)';
COMMENT ON COLUMN expense_claims.approved_amount IS 'Amount approved by reviewer (may differ from claimed amount)';
COMMENT ON COLUMN expense_claims.category_id IS 'Current category - can be changed by reviewer for proper accounting';
