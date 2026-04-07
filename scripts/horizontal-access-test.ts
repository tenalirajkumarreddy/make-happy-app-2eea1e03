/**
 * Horizontal Access Control Testing Script
 * 
 * Tests whether users can access resources belonging to other users
 * by attempting unauthorized data access across different roles.
 * 
 * CRITICAL SECURITY TEST - Must pass before production launch
 * 
 * Usage:
 *   npx tsx scripts/horizontal-access-test.ts
 * 
 * Prerequisites:
 *   - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 *   - Test users created for each role (super_admin, manager, agent, marketer, pos, customer)
 *   - Test data in database (customers, sales, routes, etc.)
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment');
  process.exit(1);
}

// Test user credentials (these should be created manually before running tests)
const TEST_USERS = {
  agent1: { email: 'test-agent1@test.aquaprime.app', password: 'TestAgent1Password!' },
  agent2: { email: 'test-agent2@test.aquaprime.app', password: 'TestAgent2Password!' },
  customer1: { email: 'test-customer1@test.aquaprime.app', password: 'TestCustomer1Pass!' },
  customer2: { email: 'test-customer2@test.aquaprime.app', password: 'TestCustomer2Pass!' },
  manager: { email: 'test-manager@test.aquaprime.app', password: 'TestManagerPass!' },
};

interface TestResult {
  name: string;
  passed: boolean;
  expected: 'deny' | 'allow';
  actual: 'denied' | 'allowed' | 'error';
  details?: string;
}

const results: TestResult[] = [];

async function signIn(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  return { supabase, user: data.user, session: data.session };
}

async function testCustomerAccessOtherCustomerData() {
  console.log('\n🧪 Testing: Customer cannot access other customer data');
  
  const { supabase: client1 } = await signIn(TEST_USERS.customer1.email, TEST_USERS.customer1.password);
  
  // Get customer1's own customer_id
  const { data: profile1 } = await client1.from('profiles').select('*').single();
  const { data: customers1 } = await client1.from('customers').select('id').eq('user_id', profile1?.user_id);
  const customer1Id = customers1?.[0]?.id;
  
  // Sign in as customer2
  const { supabase: client2 } = await signIn(TEST_USERS.customer2.email, TEST_USERS.customer2.password);
  const { data: profile2 } = await client2.from('profiles').select('*').single();
  const { data: customers2 } = await client2.from('customers').select('id').eq('user_id', profile2?.user_id);
  const customer2Id = customers2?.[0]?.id;
  
  // Customer2 tries to access Customer1's sales
  const { data: sales, error } = await client2
    .from('sales')
    .select('*')
    .eq('customer_id', customer1Id);
  
  const passed = (error !== null || sales === null || sales.length === 0);
  results.push({
    name: 'Customer cannot access other customer sales',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked access' : `Customer2 accessed ${sales?.length} sales from Customer1`,
  });
  
  // Customer2 tries to update Customer1's profile
  const { error: updateError } = await client2
    .from('customers')
    .update({ full_name: 'HACKED' })
    .eq('id', customer1Id);
  
  const updateBlocked = (updateError !== null);
  results.push({
    name: 'Customer cannot update other customer profile',
    expected: 'deny',
    actual: updateBlocked ? 'denied' : 'allowed',
    passed: updateBlocked,
    details: updateBlocked ? 'RLS correctly blocked update' : 'Customer2 updated Customer1 profile!',
  });
}

async function testAgentAccessOtherAgentData() {
  console.log('\n🧪 Testing: Agent cannot access other agent private data');
  
  const { supabase: client1, user: user1 } = await signIn(TEST_USERS.agent1.email, TEST_USERS.agent1.password);
  const { supabase: client2, user: user2 } = await signIn(TEST_USERS.agent2.email, TEST_USERS.agent2.password);
  
  // Agent2 tries to view Agent1's handover balances
  const { data: handovers, error } = await client2
    .from('handover_snapshots')
    .select('*')
    .eq('user_id', user1?.id);
  
  const passed = (error !== null || handovers === null || handovers.length === 0);
  results.push({
    name: 'Agent cannot access other agent handover balances',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked access' : `Agent2 viewed ${handovers?.length} handover records from Agent1`,
  });
  
  // Agent2 tries to view Agent1's attendance records
  const { data: attendance, error: attendanceError } = await client2
    .from('attendance')
    .select('*')
    .eq('user_id', user1?.id);
  
  const attendanceBlocked = (attendanceError !== null || attendance === null || attendance.length === 0);
  results.push({
    name: 'Agent cannot access other agent attendance',
    expected: 'deny',
    actual: attendanceBlocked ? 'denied' : 'allowed',
    passed: attendanceBlocked,
    details: attendanceBlocked ? 'RLS correctly blocked access' : `Agent2 viewed ${attendance?.length} attendance records from Agent1`,
  });
}

async function testCustomerAccessKYCDocuments() {
  console.log('\n🧪 Testing: Customer cannot access other customer KYC documents');
  
  const { supabase: client1 } = await signIn(TEST_USERS.customer1.email, TEST_USERS.customer1.password);
  const { data: profile1 } = await client1.from('profiles').select('*').single();
  const { data: customers1 } = await client1.from('customers').select('id').eq('user_id', profile1?.user_id);
  const customer1Id = customers1?.[0]?.id;
  
  const { supabase: client2 } = await signIn(TEST_USERS.customer2.email, TEST_USERS.customer2.password);
  
  // Customer2 tries to list Customer1's KYC folder
  const { data: files, error } = await client2.storage
    .from('kyc-documents')
    .list(`customer_${customer1Id}`);
  
  const passed = (error !== null || files === null || files.length === 0);
  results.push({
    name: 'Customer cannot list other customer KYC documents',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'Storage RLS correctly blocked access' : `Customer2 listed ${files?.length} files from Customer1`,
  });
  
  // Customer2 tries to download a KYC document from Customer1's folder
  const { data: downloadData, error: downloadError } = await client2.storage
    .from('kyc-documents')
    .download(`customer_${customer1Id}/test-document.pdf`);
  
  const downloadBlocked = (downloadError !== null);
  results.push({
    name: 'Customer cannot download other customer KYC documents',
    expected: 'deny',
    actual: downloadBlocked ? 'denied' : 'allowed',
    passed: downloadBlocked,
    details: downloadBlocked ? 'Storage RLS correctly blocked download' : 'Customer2 downloaded Customer1 KYC document!',
  });
}

async function testRoleEscalation() {
  console.log('\n🧪 Testing: Users cannot escalate their own roles');
  
  const { supabase: client, user } = await signIn(TEST_USERS.agent1.email, TEST_USERS.agent1.password);
  
  // Agent tries to update their own role to super_admin
  const { error } = await client
    .from('user_roles')
    .update({ role: 'super_admin' })
    .eq('user_id', user?.id);
  
  const passed = (error !== null);
  results.push({
    name: 'User cannot escalate own role to super_admin',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked role escalation' : 'Agent escalated to super_admin!',
  });
  
  // Agent tries to insert a new super_admin role for themselves
  const { error: insertError } = await client
    .from('user_roles')
    .insert({ user_id: user?.id, role: 'super_admin' });
  
  const insertBlocked = (insertError !== null);
  results.push({
    name: 'User cannot insert super_admin role for themselves',
    expected: 'deny',
    actual: insertBlocked ? 'denied' : 'allowed',
    passed: insertBlocked,
    details: insertBlocked ? 'RLS correctly blocked role insertion' : 'Agent inserted super_admin role!',
  });
}

async function testCustomerCannotAccessStaffData() {
  console.log('\n🧪 Testing: Customer cannot access staff-only tables');
  
  const { supabase: client } = await signIn(TEST_USERS.customer1.email, TEST_USERS.customer1.password);
  
  // Customer tries to view staff directory
  const { data: staff, error } = await client.from('staff_directory').select('*');
  
  const passed = (error !== null || staff === null || staff.length === 0);
  results.push({
    name: 'Customer cannot view staff directory',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked access' : `Customer viewed ${staff?.length} staff records`,
  });
  
  // Customer tries to view handover snapshots
  const { data: handovers, error: handoverError } = await client.from('handover_snapshots').select('*');
  
  const handoverBlocked = (handoverError !== null || handovers === null || handovers.length === 0);
  results.push({
    name: 'Customer cannot view handover snapshots',
    expected: 'deny',
    actual: handoverBlocked ? 'denied' : 'allowed',
    passed: handoverBlocked,
    details: handoverBlocked ? 'RLS correctly blocked access' : `Customer viewed ${handovers?.length} handover records`,
  });
  
  // Customer tries to view expense claims
  const { data: expenses, error: expenseError } = await client.from('expense_claims').select('*');
  
  const expenseBlocked = (expenseError !== null || expenses === null || expenses.length === 0);
  results.push({
    name: 'Customer cannot view expense claims',
    expected: 'deny',
    actual: expenseBlocked ? 'denied' : 'allowed',
    passed: expenseBlocked,
    details: expenseBlocked ? 'RLS correctly blocked access' : `Customer viewed ${expenses?.length} expense claims`,
  });
}

async function testAgentCannotModifyOtherAgentSales() {
  console.log('\n🧪 Testing: Agent cannot modify other agent sales');
  
  const { supabase: client1, user: user1 } = await signIn(TEST_USERS.agent1.email, TEST_USERS.agent1.password);
  const { supabase: client2 } = await signIn(TEST_USERS.agent2.email, TEST_USERS.agent2.password);
  
  // Get a sale created by agent1
  const { data: agent1Sales } = await client1
    .from('sales')
    .select('id')
    .eq('created_by', user1?.id)
    .limit(1);
  
  if (!agent1Sales || agent1Sales.length === 0) {
    results.push({
      name: 'Agent cannot modify other agent sales',
      expected: 'deny',
      actual: 'error',
      passed: false,
      details: 'No sales found for agent1 - test skipped (create test data first)',
    });
    return;
  }
  
  const agent1SaleId = agent1Sales[0].id;
  
  // Agent2 tries to update agent1's sale
  const { error } = await client2
    .from('sales')
    .update({ amount: 99999 })
    .eq('id', agent1SaleId);
  
  const passed = (error !== null);
  results.push({
    name: 'Agent cannot modify other agent sales',
    expected: 'deny',
    actual: passed ? 'denied' : 'allowed',
    passed,
    details: passed ? 'RLS correctly blocked update' : 'Agent2 modified Agent1 sale!',
  });
  
  // Agent2 tries to delete agent1's sale
  const { error: deleteError } = await client2
    .from('sales')
    .delete()
    .eq('id', agent1SaleId);
  
  const deleteBlocked = (deleteError !== null);
  results.push({
    name: 'Agent cannot delete other agent sales',
    expected: 'deny',
    actual: deleteBlocked ? 'denied' : 'allowed',
    passed: deleteBlocked,
    details: deleteBlocked ? 'RLS correctly blocked deletion' : 'Agent2 deleted Agent1 sale!',
  });
}

function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 HORIZONTAL ACCESS CONTROL TEST RESULTS');
  console.log('='.repeat(80) + '\n');
  
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📋 Total:  ${results.length}\n`);
  
  if (failed.length > 0) {
    console.log('❌ FAILED TESTS:\n');
    failed.forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     Expected: ${r.expected}`);
      console.log(`     Actual: ${r.actual}`);
      console.log(`     Details: ${r.details}\n`);
    });
  }
  
  if (passed.length > 0) {
    console.log('✅ PASSED TESTS:\n');
    passed.forEach(r => {
      console.log(`  ✅ ${r.name}`);
      console.log(`     ${r.details}\n`);
    });
  }
  
  console.log('='.repeat(80));
  
  if (failed.length === 0) {
    console.log('✅ ALL HORIZONTAL ACCESS TESTS PASSED - System is secure!');
    console.log('='.repeat(80) + '\n');
    process.exit(0);
  } else {
    console.log('❌ CRITICAL SECURITY ISSUES FOUND - DO NOT DEPLOY TO PRODUCTION!');
    console.log('='.repeat(80) + '\n');
    process.exit(1);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Horizontal Access Control Security Testing...\n');
  console.log('⚠️  Prerequisites:');
  console.log('   - Test users must be created in database');
  console.log('   - Test data (sales, customers, etc.) should exist');
  console.log('   - RLS policies must be enabled on all tables\n');
  
  try {
    await testCustomerAccessOtherCustomerData();
    await testAgentAccessOtherAgentData();
    await testCustomerAccessKYCDocuments();
    await testRoleEscalation();
    await testCustomerCannotAccessStaffData();
    await testAgentCannotModifyOtherAgentSales();
    
    printResults();
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    console.error('\nMake sure test users are created and database is accessible.');
    process.exit(1);
  }
}

// Run tests
runAllTests();
