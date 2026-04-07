# Horizontal Access Control Testing

## Overview

Horizontal access control vulnerabilities occur when users can access or modify resources belonging to other users at the same privilege level. This is one of the most common and critical security vulnerabilities in multi-tenant applications.

**CRITICAL**: This test must pass before production launch to prevent data breaches.

---

## Test Coverage

The horizontal access testing script covers the following attack vectors:

### 1. Customer-to-Customer Access
- ✅ Customer cannot view other customer sales
- ✅ Customer cannot update other customer profiles
- ✅ Customer cannot list other customer KYC documents
- ✅ Customer cannot download other customer KYC documents

### 2. Agent-to-Agent Access
- ✅ Agent cannot view other agent handover balances
- ✅ Agent cannot view other agent attendance records
- ✅ Agent cannot modify other agent sales
- ✅ Agent cannot delete other agent sales

### 3. Role Escalation Prevention
- ✅ User cannot update their own role to super_admin
- ✅ User cannot insert super_admin role for themselves

### 4. Cross-Role Access
- ✅ Customer cannot view staff directory
- ✅ Customer cannot view handover snapshots
- ✅ Customer cannot view expense claims

---

## Prerequisites

### 1. Test Users

Create the following test users in the database:

```sql
-- Note: Use Supabase Auth admin to create these users first, then link them

-- Agent 1
INSERT INTO user_roles (user_id, role) 
VALUES ('agent1-uuid-here', 'agent');

INSERT INTO staff_directory (user_id, full_name, email, role, is_active)
VALUES ('agent1-uuid-here', 'Test Agent 1', 'test-agent1@test.aquaprime.app', 'agent', true);

-- Agent 2
INSERT INTO user_roles (user_id, role) 
VALUES ('agent2-uuid-here', 'agent');

INSERT INTO staff_directory (user_id, full_name, email, role, is_active)
VALUES ('agent2-uuid-here', 'Test Agent 2', 'test-agent2@test.aquaprime.app', 'agent', true);

-- Customer 1
INSERT INTO customers (user_id, full_name, phone, email)
VALUES ('customer1-uuid-here', 'Test Customer 1', '+911234567890', 'test-customer1@test.aquaprime.app');

-- Customer 2
INSERT INTO customers (user_id, full_name, phone, email)
VALUES ('customer2-uuid-here', 'Test Customer 2', '+911234567891', 'test-customer2@test.aquaprime.app');

-- Manager
INSERT INTO user_roles (user_id, role) 
VALUES ('manager-uuid-here', 'manager');

INSERT INTO staff_directory (user_id, full_name, email, role, is_active)
VALUES ('manager-uuid-here', 'Test Manager', 'test-manager@test.aquaprime.app', 'manager', true);
```

### 2. Test Data

Create some sample sales data for testing:

```sql
-- Create a sale for Agent 1
INSERT INTO sales (customer_id, store_id, amount, created_by, display_id)
SELECT 
  (SELECT id FROM customers WHERE user_id = 'customer1-uuid-here'),
  (SELECT id FROM stores LIMIT 1),
  1000,
  'agent1-uuid-here',
  'SALE-TEST-001';
```

### 3. Environment Variables

Ensure `.env` file contains:

```env
VITE_SUPABASE_URL=https://vrhptrtgrpftycvojaqo.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Running the Tests

### Command:

```bash
npx tsx scripts/horizontal-access-test.ts
```

### Expected Output:

```
🚀 Starting Horizontal Access Control Security Testing...

⚠️  Prerequisites:
   - Test users must be created in database
   - Test data (sales, customers, etc.) should exist
   - RLS policies must be enabled on all tables

🧪 Testing: Customer cannot access other customer data
🧪 Testing: Agent cannot access other agent private data
🧪 Testing: Customer cannot access other customer KYC documents
🧪 Testing: Users cannot escalate their own roles
🧪 Testing: Customer cannot access staff-only tables
🧪 Testing: Agent cannot modify other agent sales

================================================================================
📊 HORIZONTAL ACCESS CONTROL TEST RESULTS
================================================================================

✅ Passed: 13
❌ Failed: 0
📋 Total:  13

✅ PASSED TESTS:

  ✅ Customer cannot access other customer sales
     RLS correctly blocked access

  ✅ Customer cannot update other customer profile
     RLS correctly blocked update

  ... (all tests listed)

================================================================================
✅ ALL HORIZONTAL ACCESS TESTS PASSED - System is secure!
================================================================================
```

---

## Failure Response

If any test fails, **DO NOT DEPLOY TO PRODUCTION**. Example failure output:

```
❌ FAILED TESTS:

  ❌ Customer cannot access other customer sales
     Expected: deny
     Actual: allowed
     Details: Customer2 accessed 15 sales from Customer1

================================================================================
❌ CRITICAL SECURITY ISSUES FOUND - DO NOT DEPLOY TO PRODUCTION!
================================================================================
```

### Remediation Steps:

1. **Identify the vulnerable table**: Check which test failed
2. **Review RLS policies**: Verify policies exist and are correct
3. **Check policy logic**: Ensure policies properly filter by user_id/customer_id
4. **Test manually**: Reproduce the issue in Supabase dashboard
5. **Fix the policy**: Update the RLS policy in a migration
6. **Re-run tests**: Verify the fix works
7. **Document the fix**: Update audit progress

---

## Common RLS Policy Patterns

### Customer-scoped access:

```sql
-- Customers can only see their own data
CREATE POLICY "Customers can view own sales"
ON sales FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);
```

### Staff-scoped access:

```sql
-- Staff can only see their own handovers
CREATE POLICY "Staff can view own handovers"
ON handover_snapshots FOR SELECT
TO authenticated
USING (user_id = auth.uid());
```

### Role-based access:

```sql
-- Only super_admin and manager can view all expense claims
CREATE POLICY "Managers can view all expense claims"
ON expense_claims FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'manager')
  )
);
```

---

## Continuous Security Testing

### Recommended Schedule:

- **Before every production deployment**: Run full test suite
- **Weekly**: Run tests against staging environment
- **After RLS policy changes**: Run tests immediately
- **After schema changes**: Review and update tests if needed

### CI/CD Integration:

Add to your GitHub Actions workflow:

```yaml
- name: Run Horizontal Access Tests
  run: npx tsx scripts/horizontal-access-test.ts
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

---

## Test Maintenance

### Adding New Tests:

When adding new features with user-scoped data:

1. Identify the data model (table/bucket)
2. Determine the access control rules
3. Write RLS policies
4. Add test cases to `horizontal-access-test.ts`
5. Run tests and verify they pass

### Example: Adding Product Inventory Test:

```typescript
async function testAgentCannotAccessOtherAgentInventory() {
  console.log('\n🧪 Testing: Agent cannot access other agent inventory');
  
  const { supabase: client1, user: user1 } = await signIn(TEST_USERS.agent1.email, TEST_USERS.agent1.password);
  const { supabase: client2 } = await signIn(TEST_USERS.agent2.email, TEST_USERS.agent2.password);
  
  // Agent2 tries to view Agent1's inventory
  const { data, error } = await client2
    .from('agent_inventory')
    .select('*')
    .eq('agent_id', user1?.id);
  
  const passed = (error !== null || data === null || data.length === 0);
  results.push({
    name: 'Agent cannot access other agent inventory',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked access' : `Agent2 accessed ${data?.length} inventory items from Agent1`,
  });
}
```

---

## Security Best Practices

1. **Always use RLS**: Never rely on client-side checks alone
2. **Test both reads and writes**: Verify SELECT, INSERT, UPDATE, DELETE
3. **Test storage buckets**: Don't forget file access controls
4. **Test edge cases**: Empty results, deleted users, inactive accounts
5. **Automate testing**: Run tests in CI/CD pipeline
6. **Document exceptions**: If any cross-user access is intentional, document why

---

## Related Documentation

- `docs/RLS_SECURITY_AUDIT.md` - RLS policy reference
- `docs/AUDIT_PROGRESS.md` - Overall audit status
- `supabase/migrations/` - RLS policy migrations
- `scripts/audit-rls.sql` - RLS audit queries

---

**Status**: Test script created, awaiting test user setup and execution  
**Priority**: CRITICAL - Must pass before production launch  
**Last Updated**: 2026-04-07
