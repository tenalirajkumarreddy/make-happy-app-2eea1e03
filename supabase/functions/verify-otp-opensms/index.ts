import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

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
 * 3. Check customers by phone → link user_id
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
  }

  if (matchingInvitations && matchingInvitations.length >= 1) {
    const invitation = matchingInvitations[0];

    // Check if staff_directory entry already exists for this phone
    const { data: existingStaff } = await adminClient
      .rpc("find_staff_by_phone", { p_phone_digits: phoneNumber });

    const existingDir = existingStaff && existingStaff.length > 0 ? existingStaff[0] : null;

    if (existingDir) {
      // Update existing directory entry
      await adminClient
        .from("staff_directory")
        .update({
          user_id: userId,
          phone: phoneNumber,
          full_name: invitation.full_name || "Staff",
          role: invitation.role,
          is_active: true,
        })
        .eq("id", existingDir.id);
    } else {
      // Create new staff_directory entry
      await adminClient
        .from("staff_directory")
        .insert({
          user_id: userId,
          phone: phoneNumber,
          email: userEmail || null,
          full_name: invitation.full_name || "Staff",
          role: invitation.role,
          avatar_url: null,
          is_active: true,
        });
    }

    // Mark invitation as accepted
    const acceptedAt = invitation.accepted_at || new Date().toISOString();
    const { error: invitationUpdateError } = await adminClient
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_at: acceptedAt,
        user_id: userId,
      })
      .eq("id", invitation.id);

    if (invitationUpdateError) {
      console.error("Failed to mark staff invitation accepted (with user_id):", invitationUpdateError);

      // Backwards compatibility: older schemas may not have user_id
      const { error: retryInvitationUpdateError } = await adminClient
        .from("staff_invitations")
        .update({
          status: "accepted",
          accepted_at: acceptedAt,
        })
        .eq("id", invitation.id);

      if (retryInvitationUpdateError) {
        console.error("Failed to mark staff invitation accepted (retry):", retryInvitationUpdateError);
      }
    }

    // Set user role
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("user_roles").insert({ user_id: userId, role: invitation.role });

    // Upsert profile
    await adminClient.from("profiles").upsert({
      user_id: userId,
      full_name: invitation.full_name || "Staff",
      email: userEmail || null,
      phone: phoneNumber,
      avatar_url: null,
      is_active: true,
      phone_verified: true,
      onboarding_complete: true,
    }, { onConflict: "user_id" });

    return { type: "staff", role: invitation.role };
  }

  // STEP 2: Check staff_directory (staff already created with phone, no user_id yet)
  const { data: matchingStaff, error: staffErr } = await adminClient
    .rpc("find_staff_by_phone", { p_phone_digits: phoneNumber });

  if (staffErr) {
    console.error("find_staff_by_phone error:", staffErr);
  }

  if (matchingStaff && matchingStaff.length >= 1) {
    const staff = matchingStaff[0];

    // Link user_id to staff directory
    await adminClient
      .from("staff_directory")
      .update({ user_id: userId })
      .eq("id", staff.id);

    // Set user role
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("user_roles").insert({ user_id: userId, role: staff.role });

    // Upsert profile
    await adminClient.from("profiles").upsert({
      user_id: userId,
      full_name: staff.full_name || "Staff",
      email: userEmail || null,
      phone: phoneNumber,
      avatar_url: staff.avatar_url || null,
      is_active: true,
      phone_verified: true,
      onboarding_complete: true,
    }, { onConflict: "user_id" });

    return { type: "staff", role: staff.role };
  }

  // STEP 3: Check customers
  const { data: matchingCustomers, error: custErr } = await adminClient
    .rpc("find_customer_by_phone", { p_phone_digits: phoneNumber });

  if (custErr) {
    console.error("find_customer_by_phone error:", custErr);
  }

  if (matchingCustomers && matchingCustomers.length >= 1) {
    const customer = matchingCustomers[0];

    // Link user_id to customer if not already linked
    if (!customer.user_id || customer.user_id !== userId) {
      await adminClient
        .from("customers")
        .update({ user_id: userId })
        .eq("id", customer.id);
    }

    // Set customer role
    await adminClient.from("user_roles").upsert(
      { user_id: userId, role: "customer" },
      { onConflict: "user_id" }
    );

    // Upsert profile
    await adminClient.from("profiles").upsert({
      user_id: userId,
      full_name: "Customer",
      email: userEmail || null,
      phone: phoneNumber,
      is_active: true,
      phone_verified: true,
      onboarding_complete: true,
    }, { onConflict: "user_id" });

    return { type: "existing_customer", customerId: customer.id };
  }

  // STEP 4: No match - onboarding required
  return { type: "onboarding_required" };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightOrError(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

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

    // Reject already-verified sessions
    if (session.verified) {
      return new Response(
        JSON.stringify({ error: 'OTP already used. Please request a new OTP.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Reject expired sessions
    const expiresAtMs = Date.parse(session.expires_at);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
      // Best-effort cleanup
      await adminClient
        .from('otp_sessions')
        .delete()
        .eq('id', session.id)

      return new Response(
        JSON.stringify({ error: 'OTP expired. Please request a new OTP.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Enforce max attempts
    if (session.attempts >= session.max_attempts) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please request a new OTP.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify OTP code
    const trimmedCode = otp_code.trim();
    if (session.otp_code !== trimmedCode) {
      const nextAttempts = (session.attempts || 0) + 1;

      await adminClient
        .from('otp_sessions')
        .update({ attempts: nextAttempts })
        .eq('id', session.id)

      const attemptsRemaining = Math.max(0, (session.max_attempts || 3) - nextAttempts);
      const lockedOut = attemptsRemaining === 0;

      return new Response(
        JSON.stringify({
          error: lockedOut ? 'Too many attempts. Please request a new OTP.' : 'Invalid OTP code',
          attempts_remaining: attemptsRemaining,
        }),
        {
          status: lockedOut ? 429 : 400,
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