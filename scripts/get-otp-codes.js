/**
 * Test Helper: Fetch OTP codes from Supabase database
 * Run: node scripts/get-otp-codes.js
 * 
 * This helps during multi-role browser testing by showing
 * the latest OTP codes sent to each phone number.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vrhptrtgrpftycvojaqo.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Set it with: set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  console.error('   You can find this in your Supabase Dashboard → Project Settings → API');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getLatestOTPs() {
  console.log('🔍 Fetching latest OTP codes from database...\n');

  const { data, error } = await supabase
    .from('otp_sessions')
    .select('phone_number, otp_code, created_at, verified')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('📭 No OTP sessions found in database.');
    console.log('   Send an OTP first by entering a phone number on the login page.');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📱 LATEST OTP CODES (last 10)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Phone Number        | OTP Code | Created At           | Used');
  console.log('───────────────────────────────────────────────────────────────');

  data.forEach(session => {
    const phone = session.phone_number.padEnd(19);
    const otp = session.otp_code;
    const created = new Date(session.created_at).toLocaleTimeString();
    const status = session.verified ? '✅ Yes' : '⬜ No';
    console.log(`${phone}| ${otp}    | ${created}      | ${status}`);
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n💡 Tip: Use the OTP code BEFORE it expires (10 minutes)');
}

getLatestOTPs();
