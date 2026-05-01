#!/usr/bin/env node
/**
 * Test OTP Flow Script
 * 
 * Usage:
 *   node scripts/test-otp-flow.js <phone_number>
 * 
 * Example:
 *   node scripts/test-otp-flow.js +919999999999
 * 
 * This script tests the OTP flow with the universal test OTP: 000000
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vrhptrtgrpftycvojaqo.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU';

async function testOTPSend(phone) {
  console.log(`\n🧪 Testing OTP Send for: ${phone}`);
  console.log('='.repeat(50));

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp-opensms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ phone }),
    });

    const data = await response.json();
    console.log('📤 Response Status:', response.status);
    console.log('📦 Response Data:', JSON.stringify(data, null, 2));

    if (response.ok && data.success) {
      console.log('✅ OTP Send Successful');
      console.log(`📱 Masked Phone: ${data.phone}`);
      console.log(`🔑 Session Token: ${data.session_token}`);
      return data.session_token;
    } else {
      console.error('❌ OTP Send Failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Network Error:', error.message);
    return null;
  }
}

async function testOTPVerify(sessionToken, otp = '000000') {
  console.log(`\n🧪 Testing OTP Verify with: ${otp}`);
  console.log('='.repeat(50));

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp-opensms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        session_token: sessionToken,
        otp_code: otp,
      }),
    });

    const data = await response.json();
    console.log('📤 Response Status:', response.status);
    console.log('📦 Response Data:', JSON.stringify(data, null, 2));

    if (response.ok && data.success) {
      console.log('✅ OTP Verify Successful');
      console.log(`👤 User ID: ${data.user?.id}`);
      console.log(`🔐 Role: ${data.resolution?.type}`);
      console.log(`🏷️  Role Detail: ${data.resolution?.role || 'N/A'}`);
      return data;
    } else {
      console.error('❌ OTP Verify Failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Network Error:', error.message);
    return null;
  }
}

async function main() {
  const phone = process.argv[2] || '+919999999999';
  
  console.log('🚀 OTP Flow Test');
  console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);
  console.log(`📱 Testing Phone: ${phone}`);
  console.log(`🔑 Universal Test OTP: 000000`);

  // Step 1: Send OTP
  const sessionToken = await testOTPSend(phone);
  if (!sessionToken) {
    console.error('\n💥 Failed at OTP Send step');
    process.exit(1);
  }

  // Wait a moment
  console.log('\n⏳ Waiting 1 second...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 2: Verify with test OTP
  const result = await testOTPVerify(sessionToken, '000000');
  if (!result) {
    console.error('\n💥 Failed at OTP Verify step');
    process.exit(1);
  }

  // Step 3: Verify with wrong OTP (should fail)
  console.log('\n🧪 Testing with wrong OTP (should fail)...');
  await testOTPVerify(sessionToken, '123456');

  console.log('\n✅ Test Complete!');
}

main().catch(console.error);
