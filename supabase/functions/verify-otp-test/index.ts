// Edge Function: OTP Verification with Test Bypass
// Allows universal test OTP "000000" for development testing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Test phone numbers with universal OTP
const TEST_PHONES = new Set([
  '+917997222262',  // super_admin
  '+916305295757',  // manager
  '+919494910007',  // agent
  '+919879879870',  // marketer
  '+918888888888',  // operator
  '+919090909090',  // customer
]);

const UNIVERSAL_TEST_OTP = '000000';

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ error: 'Phone and OTP required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a test phone with universal OTP
    if (TEST_PHONES.has(phone) && otp === UNIVERSAL_TEST_OTP) {
      console.log(`[TEST MODE] Bypassing OTP for ${phone}`);
      
      // Create or update OTP session
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Find user by phone
      const { data: userData } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('phone', phone)
        .maybeSingle();

      if (!userData?.user_id) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create verified OTP session
      await supabaseAdmin.from('otp_sessions').upsert({
        phone_number: phone,
        otp_code: UNIVERSAL_TEST_OTP,
        session_token: `test-${crypto.randomUUID()}`,
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        verified: true,
        verified_at: new Date().toISOString(),
        attempts: 0,
        max_attempts: 3,
      }, { onConflict: 'phone_number' });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Test OTP verified',
          user_id: userData.user_id,
          test_mode: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normal OTP verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabase = createClient(supabaseUrl!, Deno.env.get('SUPABASE_ANON_KEY')!);

    const { data, error } = await supabase.rpc('verify_otp_with_test_bypass', {
      p_phone: phone,
      p_otp: otp
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OTP verification error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
