-- ============================================
-- MOCK DATA: Handovers & Expense Claims
-- For Testing Role-Based Access
-- ============================================

-- First, let's get the staff user IDs (run this after having staff users)
-- This assumes you have users with these roles in your system

-- Helper function to get user_id by role
CREATE OR REPLACE FUNCTION get_user_by_role(p_role text)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT ur.user_id INTO v_user_id
  FROM user_roles ur
  WHERE ur.role = p_role
  LIMIT 1;
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MOCK HANDOVERS
-- ============================================

-- Handover 1: Agent → Manager (Pending - awaiting confirmation)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  get_user_by_role('manager'),
  5000.00,
  3000.00,
  8000.00,
  'awaiting_confirmation',
  'Daily collection handover',
  NOW() - INTERVAL '2 hours',
  CURRENT_DATE
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 2: Agent → Manager (Confirmed - completed)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, confirmed_by, confirmed_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  get_user_by_role('manager'),
  12000.00,
  8000.00,
  20000.00,
  'confirmed',
  'Yesterday collection',
  NOW() - INTERVAL '1 day',
  get_user_by_role('manager'),
  NOW() - INTERVAL '20 hours',
  CURRENT_DATE - 1
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 3: Marketer → Manager (Rejected)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, rejected_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('marketer'),
  get_user_by_role('manager'),
  3000.00,
  2000.00,
  5000.00,
  'rejected',
  'Incorrect amount - please verify',
  NOW() - INTERVAL '3 hours',
  NOW() - INTERVAL '1 hour',
  CURRENT_DATE
WHERE get_user_by_role('marketer') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 4: POS → Manager (Cancelled by sender)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('pos'),
  get_user_by_role('manager'),
  1500.00,
  500.00,
  2000.00,
  'cancelled',
  'Cancelled - customer returned',
  NOW() - INTERVAL '5 hours',
  CURRENT_DATE
WHERE get_user_by_role('pos') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 5: Agent → Agent (Peer to peer - pending)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  (SELECT user_id FROM user_roles WHERE role = 'agent' OFFSET 1 LIMIT 1), -- second agent
  2500.00,
  1500.00,
  4000.00,
  'awaiting_confirmation',
  'Covering for sick colleague',
  NOW() - INTERVAL '30 minutes',
  CURRENT_DATE
WHERE get_user_by_role('agent') IS NOT NULL;

-- Handover 6: Agent → Manager (Confirmed from 2 days ago)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, confirmed_by, confirmed_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  get_user_by_role('manager'),
  8000.00,
  12000.00,
  20000.00,
  'confirmed',
  'Wednesday collection',
  NOW() - INTERVAL '2 days',
  get_user_by_role('manager'),
  NOW() - INTERVAL '46 hours',
  CURRENT_DATE - 2
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 7: Marketer → Manager (Confirmed from last week)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, confirmed_by, confirmed_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('marketer'),
  get_user_by_role('manager'),
  5000.00,
  5000.00,
  10000.00,
  'confirmed',
  'Weekend sales',
  NOW() - INTERVAL '5 days',
  get_user_by_role('manager'),
  NOW() - INTERVAL '4 days 20 hours',
  CURRENT_DATE - 5
WHERE get_user_by_role('marketer') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 8: Manager → Super Admin (Pending - for admin to test)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('manager'),
  get_user_by_role('super_admin'),
  50000.00,
  75000.00,
  125000.00,
  'awaiting_confirmation',
  'Weekly consolidation from all agents',
  NOW() - INTERVAL '1 hour',
  CURRENT_DATE
WHERE get_user_by_role('manager') IS NOT NULL AND get_user_by_role('super_admin') IS NOT NULL;

-- Handover 9: Agent → Manager (Large amount pending)
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  get_user_by_role('manager'),
  25000.00,
  35000.00,
  60000.00,
  'awaiting_confirmation',
  'Large collection - end of month',
  NOW() - INTERVAL '15 minutes',
  CURRENT_DATE
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Handover 10: Multiple small handovers from yesterday
INSERT INTO handovers (id, user_id, handed_to, cash_amount, upi_amount, total_amount, status, notes, created_at, confirmed_by, confirmed_at, handover_date)
SELECT 
  gen_random_uuid(),
  get_user_by_role('agent'),
  get_user_by_role('manager'),
  500.00,
  500.00,
  1000.00,
  'confirmed',
  'Quick morning collection',
  NOW() - INTERVAL '1 day 2 hours',
  get_user_by_role('manager'),
  NOW() - INTERVAL '1 day 1 hour',
  CURRENT_DATE - 1
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- ============================================
-- MOCK EXPENSE CLAIMS
-- ============================================

-- Ensure we have expense categories first
-- Expense 1: Agent - Fuel (Pending)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, expense_date, description, status, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('agent'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%fuel%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%fuel%' LIMIT 1),
  850.00,
  CURRENT_DATE - 2,
  'Fuel for route coverage - 3 days',
  'pending',
  NOW() - INTERVAL '2 hours'
WHERE get_user_by_role('agent') IS NOT NULL;

-- Expense 2: Marketer - Travel (Pending)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, expense_date, description, status, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('marketer'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%travel%' OR name ILIKE '%transport%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%travel%' OR name ILIKE '%transport%' LIMIT 1),
  1250.00,
  CURRENT_DATE - 1,
  'Train ticket for store visit',
  'pending',
  NOW() - INTERVAL '4 hours'
WHERE get_user_by_role('marketer') IS NOT NULL;

-- Expense 3: POS - Supplies (Approved)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, approved_amount, expense_date, description, status, reviewed_by, reviewed_at, reviewer_notes, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('pos'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%supply%' OR name ILIKE '%office%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%supply%' OR name ILIKE '%office%' LIMIT 1),
  450.00,
  450.00,
  CURRENT_DATE - 3,
  'Printer paper and stationery',
  'approved',
  get_user_by_role('manager'),
  NOW() - INTERVAL '2 days',
  'Approved - standard office supplies',
  NOW() - INTERVAL '3 days'
WHERE get_user_by_role('pos') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Expense 4: Agent - Food (Rejected)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, expense_date, description, status, reviewed_by, reviewed_at, reviewer_notes, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('agent'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%food%' OR name ILIKE '%meal%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%food%' OR name ILIKE '%meal%' LIMIT 1),
  2500.00,
  CURRENT_DATE - 1,
  'Client dinner',
  'rejected',
  get_user_by_role('manager'),
  NOW() - INTERVAL '12 hours',
  'Personal expense - not business related',
  NOW() - INTERVAL '1 day'
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Expense 5: Agent - Phone Bill (Approved with modified amount)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, approved_amount, expense_date, description, status, reviewed_by, reviewed_at, reviewer_notes, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('agent'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%phone%' OR name ILIKE '%mobile%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%phone%' OR name ILIKE '%mobile%' LIMIT 1),
  1200.00,
  800.00,
  CURRENT_DATE - 5,
  'Monthly phone reimbursement',
  'approved',
  get_user_by_role('manager'),
  NOW() - INTERVAL '4 days',
  'Approved 800 - policy limit is 800/month',
  NOW() - INTERVAL '5 days'
WHERE get_user_by_role('agent') IS NOT NULL AND get_user_by_role('manager') IS NOT NULL;

-- Expense 6: Marketer - Accommodation (Pending - high value)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, expense_date, description, status, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('marketer'),
  (SELECT id FROM expense_categories WHERE name ILIKE '%hotel%' OR name ILIKE '%stay%' LIMIT 1),
  (SELECT id FROM expense_categories WHERE name ILIKE '%hotel%' OR name ILIKE '%stay%' LIMIT 1),
  3500.00,
  CURRENT_DATE - 1,
  'Hotel stay for outstation store visit - 2 nights',
  'pending',
  NOW() - INTERVAL '6 hours'
WHERE get_user_by_role('marketer') IS NOT NULL;

-- Expense 7: POS - Miscellaneous (Pending)
INSERT INTO expense_claims (id, display_id, user_id, category_id, original_category_id, amount, expense_date, description, status, created_at)
SELECT 
  gen_random_uuid(),
  'EXC-' || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0'),
  get_user_by_role('pos'),
  (SELECT id FROM expense_categories LIMIT 1),
  (SELECT id FROM expense_categories LIMIT 1),
  150.00,
  CURRENT_DATE,
  'Miscellaneous small expense',
  'pending',
  NOW() - INTERVAL '30 minutes'
WHERE get_user_by_role('pos') IS NOT NULL;

-- ============================================
-- CLEANUP: Drop helper function
-- ============================================
DROP FUNCTION IF EXISTS get_user_by_role(text);

-- ============================================
-- SUMMARY OUTPUT
-- ============================================
DO $$
DECLARE
  handover_count int;
  expense_count int;
BEGIN
  SELECT COUNT(*) INTO handover_count FROM handovers;
  SELECT COUNT(*) INTO expense_count FROM expense_claims;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MOCK DATA CREATED SUCCESSFULLY';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Handovers created: %', handover_count;
  RAISE NOTICE 'Expense claims created: %', expense_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Scenarios Available:';
  RAISE NOTICE '- Pending handovers awaiting confirmation';
  RAISE NOTICE '- Confirmed handovers (history)';
  RAISE NOTICE '- Rejected handovers';
  RAISE NOTICE '- Cancelled handovers';
  RAISE NOTICE '- Peer-to-peer handovers (agent→agent)';
  RAISE NOTICE '- Manager→Admin handovers';
  RAISE NOTICE '- Large amount handovers (60K)';
  RAISE NOTICE '- Pending expense claims for approval';
  RAISE NOTICE '- Approved expenses with modified amounts';
  RAISE NOTICE '- Rejected expenses';
  RAISE NOTICE '========================================';
END $$;
