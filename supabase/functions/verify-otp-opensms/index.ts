import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

function getSyntheticEmail(phoneNumber: string): string {
  return `phone_${phoneNumber.replace(/[^0-9]/g, '')}@phone.aquaprime.app`
}

async function ensureSupabaseAuthUser(supabase: any, phoneNumber: string): Promise<void> {
  // Create a synthetic email for phone-based users
  const syntheticEmail = getSyntheticEmail(phoneNumber)

  // Create user in Supabase Auth
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

serve(async (req) => {
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

    // Relaxed internal mode: validate against session token only.
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

    // Verify OTP code
    if (session.otp_code !== otp_code.trim()) {
      return new Response(
        JSON.stringify({
          error: 'Invalid OTP code'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    try {
      // Ensure phone-based auth user exists. Existing users are expected.
      await ensureSupabaseAuthUser(adminClient, session.phone_number)
      const syntheticEmail = getSyntheticEmail(session.phone_number)

      // Generate a magic link token hash and exchange it for a session.
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

      // OTP is correct and auth session is ready - now mark session verified.
      await adminClient
        .from('otp_sessions')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      console.log('OTP verified successfully:', {
        phone: session.phone_number.replace(/(\d{2})(\d+)(\d{4})/, '$1***$3'),
        userId: otpVerified.user?.id,
        sessionToken: session_token
      })

      return new Response(
        JSON.stringify({
          success: true,
          access_token: otpVerified.session.access_token,
          refresh_token: otpVerified.session.refresh_token,
          expires_at: otpVerified.session.expires_at,
          user: {
            id: otpVerified.user?.id,
            phone: session.phone_number,
          }
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