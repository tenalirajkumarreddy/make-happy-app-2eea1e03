-- ============================================
-- VERIFY MOCK DATA
-- Run this to check if mock data was created
-- ============================================

-- Check handovers
SELECT 
  'HANDOVERS' as table_name,
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount
FROM handovers
GROUP BY status
ORDER BY status;

-- Check expense claims
SELECT 
  'EXPENSE CLAIMS' as table_name,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM expense_claims
GROUP BY status
ORDER BY status;

-- Sample handover details
SELECT 
  h.display_id,
  p1.full_name as from_user,
  p2.full_name as to_user,
  h.total_amount,
  h.status,
  h.created_at
FROM handovers h
LEFT JOIN profiles p1 ON h.user_id = p1.user_id
LEFT JOIN profiles p2 ON h.handed_to = p2.user_id
ORDER BY h.created_at DESC
LIMIT 5;

-- Sample expense details
SELECT 
  e.display_id,
  p.full_name as submitted_by,
  ec.name as category,
  e.amount,
  e.status,
  e.description
FROM expense_claims e
LEFT JOIN profiles p ON e.user_id = p.user_id
LEFT JOIN expense_categories ec ON e.category_id = ec.id
ORDER BY e.created_at DESC
LIMIT 5;
