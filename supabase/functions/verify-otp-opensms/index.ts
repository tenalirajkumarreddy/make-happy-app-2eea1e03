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

function generatePhoneBasedUserId(phoneNumber: string): string {
  // Create a consistent user ID based on phone number for phone auth users
  // This ensures the same phone number gets the same auth user ID
  const encoder = new TextEncoder()
  const data = encoder.encode(`phone:${phoneNumber}`)
  return crypto.randomUUID() // For now, just generate random. In production, you'd want deterministic hashing
}

async function createSupabaseAuthUser(supabase: any, phoneNumber: string): Promise<string> {
  // Create a synthetic email for phone-based users
  const syntheticEmail = `phone_${phoneNumber.replace(/[^0-9]/g, '')}@phone.aquaprime.app`

  // Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
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
    throw new Error(`Failed to create auth user: ${authError.message}`)
  }

  return authUser.user.id
}

async function getOrCreateAuthUser(supabase: any, phoneNumber: string): Promise<string> {
  // First, try to find existing user by phone
  const { data: existingUsers, error: searchError } = await supabase.auth.admin.listUsers({
    filter: `phone.eq.${phoneNumber}`
  })

  if (searchError) {
    console.warn('Error searching for existing users:', searchError.message)
  }

  if (existingUsers?.users && existingUsers.users.length > 0) {
    return existingUsers.users[0].id
  }

  // Also search by synthetic email (in case phone field didn't work)
  const syntheticEmail = `phone_${phoneNumber.replace(/[^0-9]/g, '')}@phone.aquaprime.app`
  const { data: emailUsers, error: emailError } = await supabase.auth.admin.listUsers({
    filter: `email.eq.${syntheticEmail}`
  })

  if (!emailError && emailUsers?.users && emailUsers.users.length > 0) {
    return emailUsers.users[0].id
  }

  // Create new user
  return await createSupabaseAuthUser(supabase, phoneNumber)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

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

    // Get OTP session from database
    const { data: otpSession, error: fetchError } = await supabase
      .from('otp_sessions')
      .select('*')
      .eq('session_token', session_token)
      .eq('verified', false)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle()

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`)
    }

    if (!otpSession) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired OTP session' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const session = otpSession as OTPSession

    // Check if max attempts exceeded
    if (session.attempts >= session.max_attempts) {
      // Delete the session to prevent further attempts
      await supabase
        .from('otp_sessions')
        .delete()
        .eq('id', session.id)

      return new Response(
        JSON.stringify({ error: 'Maximum verification attempts exceeded. Please request a new OTP.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify OTP code
    if (session.otp_code !== otp_code.trim()) {
      // Increment attempt count
      await supabase
        .from('otp_sessions')
        .update({ attempts: session.attempts + 1 })
        .eq('id', session.id)

      const attemptsLeft = session.max_attempts - (session.attempts + 1)

      return new Response(
        JSON.stringify({
          error: 'Invalid OTP code',
          attempts_left: attemptsLeft
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // OTP is correct - mark session as verified
    await supabase
      .from('otp_sessions')
      .update({
        verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('id', session.id)

    try {
      // Get or create auth user
      const userId = await getOrCreateAuthUser(supabase, session.phone_number)

      // Generate access tokens
      const { data: authTokens, error: tokenError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: `phone_${session.phone_number.replace(/[^0-9]/g, '')}@phone.aquaprime.app`
      })

      if (tokenError || !authTokens) {
        throw new Error(`Token generation failed: ${tokenError?.message}`)
      }

      // Alternative: Create session directly
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 3600 * 1000) // 1 hour

      const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession({
        user_id: userId,
        expires_at: Math.floor(expiresAt.getTime() / 1000)
      })

      if (sessionError || !sessionData) {
        throw new Error(`Session creation failed: ${sessionError?.message}`)
      }

      console.log('OTP verified successfully:', {
        phone: session.phone_number.replace(/(\d{2})(\d+)(\d{4})/, '$1***$3'),
        userId: userId,
        sessionToken: session_token
      })

      return new Response(
        JSON.stringify({
          success: true,
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
          expires_at: sessionData.expires_at,
          user: {
            id: userId,
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
          error: 'Failed to create authentication session'
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