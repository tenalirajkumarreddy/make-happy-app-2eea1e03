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
 * After OTP verification, resolve the user's identity:
 * 1. Check staff_invitations by phone → create staff_directory, assign role
 * 2. Check staff_directory by phone → link user_id, assign role
 * 3. Check customers by phone (and by auth user_id link) → link user_id
 * 4. None found → onboarding_required
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
    // If RPC fails, try direct query as fallback
    const { data: fallbackInv } = await adminClient
      .from("staff_invitations")
      .select("id, phone, email, full_name, role, status, accepted_at")
      .like("phone", `%${phoneNumber.replace(/\D/g, '').slice(-10)}%`)
      .in("status", ["pending", "accepted"])
      .limit(1);
    if (fallbackInv?.length) matchingInvitations = fallbackInv;
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
      }).eq("id", existingDir.id);
    } else {
      await adminClient.from("staff_directory").insert({
        user_id: userId, phone: phoneNumber, email: userEmail || null,
        full_name: invitation.full_name || "Staff", role: invitation.role,
        avatar_url: null, is_active: true,
      });
    }

    await adminClient.from("staff_invitations").update({
      status: "accepted", accepted_at: invitation.accepted_at || new Date().toISOString(),
    }).eq("id", invitation.id);

    await adminClient.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await adminClient.from("user_roles").insert({ user_id: userId, role: invitation.role });
    if (roleErr) {
      console.error("Failed to insert user role:", roleErr);
      throw new Error(`Failed to assign staff role: ${roleErr.message}`);
    }

    const { error: profileErr } = await adminClient.from("profiles").upsert({
      user_id: userId, full_name: invitation.full_name || "Staff",
      email: userEmail || null, phone: phoneNumber,
      avatar_url: null, is_active: true, phone_verified: true, onboarding_complete: true,
    }, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to upsert profile:", profileErr);
      throw new Error(`Failed to create profile: ${profileErr.message}`);
    }

    return { type: "staff", role: invitation.role };
  }

  // STEP 2: Check staff_directory
  const { data: matchingStaff, error: staffErr } = await adminClient
    .rpc("find_staff_by_phone", { p_phone_digits: phoneNumber });

  if (staffErr) {
    console.error("find_staff_by_phone error:", staffErr);
    // Fallback direct query
    const digits = phoneNumber.replace(/\D/g, '').slice(-10);
    const { data: fallbackStaff } = await adminClient
      .from("staff_directory")
      .select("id, phone, user_id, role, full_name, avatar_url")
      .eq("is_active", true)
      .like("phone", `%${digits}%`)
      .is("user_id", null)
      .limit(1);
    if (fallbackStaff?.length) matchingStaff = fallbackStaff;
  }

  if (matchingStaff && matchingStaff.length >= 1) {
    const staff = matchingStaff[0];

    const { error: dirErr } = await adminClient.from("staff_directory")
      .update({ user_id: userId }).eq("id", staff.id);
    if (dirErr) {
      console.error("Failed to update staff_directory:", dirErr);
      throw new Error(`Failed to link staff record: ${dirErr.message}`);
    }

    await adminClient.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await adminClient.from("user_roles").insert({ user_id: userId, role: staff.role });
    if (roleErr) {
      console.error("Failed to insert user role:", roleErr);
      throw new Error(`Failed to assign staff role: ${roleErr.message}`);
    }

    const { error: profileErr } = await adminClient.from("profiles").upsert({
      user_id: userId, full_name: staff.full_name || "Staff",
      email: userEmail || null, phone: phoneNumber,
      avatar_url: staff.avatar_url || null, is_active: true, phone_verified: true, onboarding_complete: true,
    }, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to upsert profile:", profileErr);
      throw new Error(`Failed to create profile: ${profileErr.message}`);
    }

    return { type: "staff", role: staff.role };
  }

  // STEP 2b: Check existing user_roles for already-linked staff (edge case: staff was created
  // directly in user_roles/profiles without a staff_directory entry, e.g. invited via admin panel)
  const { data: existingRole } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingRole && existingRole.role !== "customer") {
    console.log("Staff found via existing user_roles for userId:", userId, "role:", existingRole.role);

    const { error: profileErr } = await adminClient.from("profiles").upsert({
      user_id: userId, full_name: "Staff",
      email: userEmail || null, phone: phoneNumber,
      is_active: true, phone_verified: true, onboarding_complete: true,
    }, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to upsert profile:", profileErr);
    }

    return { type: "staff", role: existingRole.role };
  }

  // STEP 2c: Check seeded app_users records by phone.
  // Some environments seed staff in app_users first, with a separate auth UID created later.
  const phoneDigits = phoneNumber.replace(/\D/g, '').slice(-10);
  const { data: appUserMatch, error: appUserErr } = await adminClient
    .from("app_users")
    .select("id, phone, google_email, full_name, role, is_active")
    .eq("is_active", true)
    .or(`phone.ilike.%${phoneDigits}%,phone.ilike.%${phoneNumber}`)
    .limit(1);

  if (appUserErr) {
    console.error("app_users lookup error:", appUserErr);
  }

  if (appUserMatch && appUserMatch.length >= 1) {
    const appUser = appUserMatch[0];

    if (appUser.role && appUser.role !== "customer") {
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      const { error: roleErr } = await adminClient.from("user_roles").insert({
        user_id: userId,
        role: appUser.role,
      });
      if (roleErr) {
        console.error("Failed to insert app_users-derived role:", roleErr);
        throw new Error(`Failed to assign staff role from app_users: ${roleErr.message}`);
      }

      const { error: profileErr } = await adminClient.from("profiles").upsert({
        user_id: userId,
        full_name: appUser.full_name || "Staff",
        email: appUser.google_email || userEmail || null,
        phone: phoneNumber,
        avatar_url: null,
        is_active: true,
        phone_verified: true,
        onboarding_complete: true,
      }, { onConflict: "user_id" });
      if (profileErr) {
        console.error("Failed to upsert app_users-derived profile:", profileErr);
        throw new Error(`Failed to create profile from app_users: ${profileErr.message}`);
      }

      return { type: "staff", role: appUser.role };
    }
  }

  // STEP 3: Check customers (by phone + by auth user_id link)
  const { data: matchingCustomers, error: custErr } = await adminClient
    .rpc("find_customer_by_phone", { p_phone_digits: phoneNumber });

  if (custErr) {
    console.error("find_customer_by_phone error:", custErr);
  }

  // FALLBACK: direct phone lookup in customers table (handles cases where RPC missed due to phone format)
  if (!matchingCustomers || matchingCustomers.length < 1) {
    const phoneDigits = phoneNumber.replace(/\D/g, '').slice(-10);
    const { data: directCustomers } = await adminClient
      .from("customers")
      .select("id, name, phone, user_id")
      .like("phone", `%${phoneDigits}%`)
      .is("deleted_at", null)
      .limit(1);
    if (directCustomers && directCustomers.length >= 1) {
      matchingCustomers = directCustomers;
      console.log("Customer found via direct phone lookup for digits:", phoneDigits);
    }
  }

  if (matchingCustomers && matchingCustomers.length >= 1) {
    const customer = matchingCustomers[0];

    // Safety: if customer has no user_id yet, link it
    if (!customer.user_id || customer.user_id !== userId) {
      const { error: linkErr } = await adminClient.from("customers")
        .update({ user_id: userId }).eq("id", customer.id);
      if (linkErr) {
        console.error("Failed to link customer user_id:", linkErr);
        throw new Error(`Failed to link customer account: ${linkErr.message}`);
      }
    }

    const { error: roleErr } = await adminClient.from("user_roles").upsert(
      { user_id: userId, role: "customer" }, { onConflict: "user_id" }
    );
    if (roleErr) {
      console.error("Failed to upsert user_roles:", roleErr);
      throw new Error(`Failed to assign customer role: ${roleErr.message}`);
    }

    const { error: profileErr } = await adminClient.from("profiles").upsert({
      user_id: userId, full_name: "Customer",
      email: userEmail || null, phone: phoneNumber,
      is_active: true, phone_verified: true, onboarding_complete: true,
    }, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to upsert profile:", profileErr);
      throw new Error(`Failed to create profile: ${profileErr.message}`);
    }

    return { type: "existing_customer", customerId: customer.id };
  }

  // STEP 4: Safety fallback — check if user already has a customer linked via user_id
  // (Edge case: customer exists but find_customer_by_phone didn't match due to phone format)
  const { data: existingCustomerByUid } = await adminClient
    .from("customers")
    .select("id, name, phone, user_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(1);

  if (existingCustomerByUid && existingCustomerByUid.length >= 1) {
    // User already has a customer record linked — treat as existing customer
    console.log("Safety fallback: customer found via user_id link for user", userId);

    const { error: roleErr } = await adminClient.from("user_roles").upsert(
      { user_id: userId, role: "customer" }, { onConflict: "user_id" }
    );
    if (roleErr) {
      console.error("Failed to upsert user_roles:", roleErr);
      throw new Error(`Failed to assign customer role: ${roleErr.message}`);
    }

    const { error: profileErr } = await adminClient.from("profiles").upsert({
      user_id: userId, full_name: "Customer",
      email: userEmail || null, phone: phoneNumber,
      is_active: true, phone_verified: true, onboarding_complete: true,
    }, { onConflict: "user_id" });
    if (profileErr) {
      console.error("Failed to upsert profile:", profileErr);
      throw new Error(`Failed to create profile: ${profileErr.message}`);
    }

    return { type: "existing_customer", customerId: existingCustomerByUid[0].id };
  }

  // STEP 5: No match - onboarding required
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