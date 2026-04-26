/**
 * Check Active Sessions & Recent Logins
 * Run: node scripts/check-active-sessions.js
 * 
 * Requires: SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vrhptrtgrpftycvojaqo.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY first');
  console.error('   set SUPABASE_SERVICE_ROLE_KEY=your_key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkSessions() {
  console.log('🔍 Checking recent login activity...\n');

  // Check recently verified OTP sessions
  const { data: recentOTPs, error: otpError } = await supabase
    .from('otp_sessions')
    .select('phone_number, verified, verified_at, created_at')
    .eq('verified', true)
    .order('verified_at', { ascending: false })
    .limit(10);

  if (otpError) {
    console.error('❌ Error fetching OTP sessions:', otpError.message);
  } else if (recentOTPs && recentOTPs.length > 0) {
    console.log('✅ RECENT SUCCESSFUL LOGINS (via OTP):');
    console.log('─────────────────────────────────────────────────');
    recentOTPs.forEach(s => {
      const time = new Date(s.verified_at).toLocaleTimeString();
      console.log(`  📱 ${s.phone_number} at ${time}`);
    });
    console.log('─────────────────────────────────────────────────\n');
  } else {
    console.log('⚠️ No verified OTP sessions found yet.\n');
  }

  // Check active auth users
  const { data: activeUsers, error: authError } = await supabase
    .from('auth.users')
    .select('id, email, phone, last_sign_in_at')
    .not('last_sign_in_at', 'is', null)
    .order('last_sign_in_at', { ascending: false })
    .limit(10);

  // Note: auth.users may not be accessible via service role in standard queries
  // Let's check profiles instead
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, full_name, email, phone, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (profileError) {
    console.error('❌ Error fetching profiles:', profileError.message);
  } else if (profiles && profiles.length > 0) {
    console.log('👤 RECENT PROFILE ACTIVITY:');
    console.log('─────────────────────────────────────────────────');
    profiles.forEach(p => {
      const time = new Date(p.updated_at).toLocaleTimeString();
      console.log(`  ${p.full_name || 'Unknown'} (${p.phone || p.email || 'no contact'}) - ${time}`);
    });
    console.log('─────────────────────────────────────────────────\n');
  }

  // Check user roles
  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .order('role');

  if (roleError) {
    console.error('❌ Error fetching roles:', roleError.message);
  } else if (roles && roles.length > 0) {
    console.log('🎭 USERS BY ROLE:');
    console.log('─────────────────────────────────────────────────');
    const byRole = {};
    roles.forEach(r => {
      byRole[r.role] = (byRole[r.role] || 0) + 1;
    });
    Object.entries(byRole).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} user(s)`);
    });
    console.log('─────────────────────────────────────────────────\n');
  }
}

checkSessions();
