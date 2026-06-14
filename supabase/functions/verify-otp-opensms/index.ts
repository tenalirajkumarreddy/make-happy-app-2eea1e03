import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VerifyOTPRequest {
  session_token: string
  otp_code: string
}

interface OTPSession {
  id: string
  phone_number: string
  otp_code: string
  session_token: string
  expires_at: string
  verified: boolean
  attempts: number
  max_attempts: number
}

type Resolution =
  | { type: "staff"; role: string }
  | { type: "existing_customer"; customerId: string }
  | { type: "onboarding_required" };

function getSyntheticEmail(phoneNumber: string): string {
  return `phone_${phoneNumber.replace(/[^0-9]/g, '')}@phone.aquaprime.app`
}

async function ensureSupabaseAuthUser(supabase: any, phoneNumber: string): Promise<void> {
  const syntheticEmail = getSyntheticEmail(phoneNumber)

  const { error: authError } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    phone: phoneNumber,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: {
      phone_verified: true,
      auth_method: 'opensms_otp',
    },
    app_metadata: {
      provider: 'phone',
      providers: ['phone']
    }
  })

  if (authError) {
    const msg = authError.message?.toLowerCase?.() || ''
    if (msg.includes('already') && msg.includes('registered')) {
      return
    }
    throw new Error(`Failed to create auth user: ${authError.message}`)
  }
}

/**
 * After OTP verification, resolve the user's identity.
 * The handle_new_user trigger auto-creates profile + user_roles(customer).
 * We only need to:
 * 1. Check staff_invitations → upgrade role, sync staff_directory
 * 2. Check staff_directory → upgrade role
 * 3. Check customers → link user_id (safety; trigger handles this by phone)
 * 4. → onboarding_required for new customers
 */
async function resolveIdentity(
  adminClient: any,
  userId: string,
  phoneNumber: string,
  userEmail: string | null
): Promise<Resolution> {
  // STEP 1: Check staff_invitations
  const { data: matchingInvitations, error: invErr } = await adminClient
    .rpc("find_staff_invitation_by_phone", { p_phone_digits: phoneNumber });

  if (invErr) {
    console.error("find_staff_invitation_by_phone error:", invErr);
  }

  if (matchingInvitations && matchingInvitations.length >= 1) {
    const invitation = matchingInvitations[0];

    const { data: existingStaff } = await adminClient
      .rpc("find_staff_by_phone", { p_phone_digits: phoneNumber });

    const existingDir = existingStaff && existingStaff.length > 0 ? existingStaff[0] : null;

    if (existingDir) {
      await adminClient.from("staff_directory").update({
        user_id: userId, phone: phoneNumber,
        full_name: invitation.full_name || "Staff", role: invitation.role, is_active: true,
        warehouse_id: invitation.warehouse_id || null,
      }).eq("id", existingDir.id);
    } else {
      await adminClient.from("staff_directory").insert({
        user_id: userId, phone: phoneNumber, email: userEmail || null,
        full_name: invitation.full_name || "Staff", role: invitation.role,
        avatar_url: null, is_active: true,
        warehouse_id: invitation.warehouse_id || null,
      });
    }

    await adminClient.from("staff_invitations").update({
      status: "accepted", accepted_at: invitation.accepted_at || new Date().toISOString(),
    }).eq("id", invitation.id);

    // Remove trigger-created customer role, assign staff role
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("user_roles").insert({
      user_id: userId, role: invitation.role,
      warehouse_id: invitation.warehouse_id || null,
    });

    // Profile already exists from trigger — just update fields
    await adminClient.from("profiles").update({
      full_name: invitation.full_name || "Staff",
      email: userEmail || null, phone: phoneNumber,
      is_active: true, phone_verified: true, onboarding_complete: true,
    }).eq("user_id", userId);

    return { type: "staff", role: invitation.role };
  }

  // STEP 2: Check staff_directory (pre-registered staff, no invitation needed)
  const { data: matchingStaff, error: staffErr } = await adminClient
    .rpc("find_staff_by_phone", { p_phone_digits: phoneNumber });

  if (staffErr) {
    console.error("find_staff_by_phone error:", staffErr);
  }

  if (matchingStaff && matchingStaff.length >= 1) {
    const staff = matchingStaff[0];

    await adminClient.from("staff_directory")
      .update({ user_id: userId }).eq("id", staff.id);

    // Remove trigger-created customer role, assign staff role
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("user_roles").insert({
      user_id: userId, role: staff.role,
      warehouse_id: staff.warehouse_id || null,
    });

    // Profile already exists from trigger — just update fields
    await adminClient.from("profiles").update({
      full_name: staff.full_name || "Staff",
      email: userEmail || null, phone: phoneNumber,
      is_active: true, phone_verified: true, onboarding_complete: true,
    }).eq("user_id", userId);

    return { type: "staff", role: staff.role };
  }

  // STEP 3: Check customers by phone — link user_id (trigger does this, safety fallback)
  const { data: matchingCustomers, error: custErr } = await adminClient
    .rpc("find_customer_by_phone", { p_phone_digits: phoneNumber });

  if (custErr) {
    console.error("find_customer_by_phone error:", custErr);
  }

  if (matchingCustomers && matchingCustomers.length >= 1) {
    const customer = matchingCustomers[0];

    if (!customer.user_id || customer.user_id !== userId) {
      await adminClient.from("customers")
        .update({ user_id: userId }).eq("id", customer.id);
    }

    // Profile + customer role already exist from trigger
    return { type: "existing_customer", customerId: customer.id };
  }

  // STEP 4: No match - new user, onboarding required
  // Profile + customer role already created by trigger
  return { type: "onboarding_required" };
}

// Universal test OTP - works for ANY phone number in development
// Set USE_REAL_OTP=true in production to disable this bypass
const UNIVERSAL_TEST_OTP = '000000'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)
    const anonClient = createClient(supabaseUrl, supabaseAnonKey)

    const { session_token, otp_code }: VerifyOTPRequest = await req.json()

    if (!session_token || !otp_code) {
      return new Response(
        JSON.stringify({ error: 'Session token and OTP code are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate OTP session
    const { data: otpSession, error: fetchError } = await adminClient
      .from('otp_sessions')
      .select('*')
      .eq('session_token', session_token)
      .maybeSingle()

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`)
    }

    if (!otpSession) {
      return new Response(
        JSON.stringify({ error: 'Invalid OTP session' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const session = otpSession as OTPSession
    const currentAttempts = session.attempts ?? 0
    const maxAttempts = session.max_attempts ?? 5

    // Check if max attempts exceeded
    if (currentAttempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: 'Maximum OTP attempts exceeded. Please request a new OTP.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check for test mode bypass (universal OTP works for any phone in dev mode)
    const isTestOTP = otp_code.trim() === UNIVERSAL_TEST_OTP
    const useRealOTP = Deno.env.get('USE_REAL_OTP') === 'true'

    if (isTestOTP && !useRealOTP) {
      console.log(`[TEST MODE] Accepting universal test OTP for ${session.phone_number}`)
      // Update the session's OTP to match for successful verification
      await adminClient
        .from('otp_sessions')
        .update({ otp_code: UNIVERSAL_TEST_OTP })
        .eq('id', session.id)
    }

    // Verify OTP code
    if (session.otp_code !== otp_code.trim()) {
      // Increment attempt counter on failure
      await adminClient
        .from('otp_sessions')
        .update({ attempts: currentAttempts + 1 })
        .eq('id', session.id)

      const remainingAttempts = maxAttempts - currentAttempts - 1
      return new Response(
        JSON.stringify({
          error: 'Invalid OTP code',
          remaining_attempts: remainingAttempts,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    try {
      // Ensure phone-based auth user exists
      await ensureSupabaseAuthUser(adminClient, session.phone_number)
      const syntheticEmail = getSyntheticEmail(session.phone_number)

      // Generate a magic link token hash and exchange it for a session
      const { data: authTokens, error: tokenError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: syntheticEmail,
      })

      if (tokenError || !authTokens) {
        throw new Error(`Token generation failed: ${tokenError?.message}`)
      }

      const tokenHash = authTokens.properties?.hashed_token
      if (!tokenHash) {
        throw new Error('Token generation failed: missing token hash')
      }

      const { data: otpVerified, error: verifyError } = await anonClient.auth.verifyOtp({
        type: 'magiclink',
        token_hash: tokenHash,
      })

      if (verifyError || !otpVerified.session) {
        throw new Error(`Session creation failed: ${verifyError?.message || 'No session returned'}`)
      }

      // Mark OTP session as verified
      await adminClient
        .from('otp_sessions')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      const appUserId = otpVerified.user?.id;

      // --- IDENTITY RESOLUTION ---
      // Check staff_invitations → staff_directory → customers → onboarding
      let resolution: Resolution = { type: "onboarding_required" };

      if (appUserId) {
        resolution = await resolveIdentity(
          adminClient,
          appUserId,
          session.phone_number,
          otpVerified.user?.email || null
        );
      }

      console.log('OTP verified successfully:', {
        phone: session.phone_number.replace(/(\d{2})(\d+)(\d{4})/, '$1***$3'),
        userId: appUserId,
        resolution: resolution.type,
      })

      return new Response(
        JSON.stringify({
          success: true,
          access_token: otpVerified.session.access_token,
          refresh_token: otpVerified.session.refresh_token,
          expires_at: otpVerified.session.expires_at,
          user: {
            id: appUserId,
            phone: session.phone_number,
          },
          resolution,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (authError) {
      console.error('Authentication error:', authError)

      return new Response(
        JSON.stringify({
          error: 'Failed to create authentication session',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

  } catch (error) {
    console.error('Function error:', error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})