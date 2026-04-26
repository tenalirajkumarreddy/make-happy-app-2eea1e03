import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

interface OTPRequest {
  phone: string
}

interface OpenSMSResponse {
  message_id: string
  status: string
  queued_at: string
}

interface OpenSMSError {
  error: string
  message: string
}

function validatePhoneNumber(phone: string): string | null {
  // Normalize phone number to E.164 format
  const cleaned = phone.replace(/\D/g, '')

  if (cleaned.length === 10) {
    // Assume Indian number (+91)
    return `+91${cleaned}`
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`
  } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(1)}`
  }

  return null
}

async function sendSMSViaOpenSMS(phone: string, otp: string): Promise<OpenSMSResponse> {
  const gatewayUrl = Deno.env.get('OPENSMS_GATEWAY_URL')
  const apiKey = Deno.env.get('OPENSMS_API_KEY')

  if (!gatewayUrl || !apiKey) {
    throw new Error('OpenSMS configuration missing. Please set OPENSMS_GATEWAY_URL and OPENSMS_API_KEY environment variables.')
  }

  const payload = {
    to: phone,
    template: 'otp',
    vars: {
      otp: otp,
      minutes: '10'
    }
  }

  const response = await fetch(`${gatewayUrl}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000), // 35 second timeout (allows 30s for APK response)
  })

  if (!response.ok) {
    const errorBody = await response.json() as OpenSMSError
    throw new Error(`OpenSMS gateway error (${response.status}): ${errorBody.message || errorBody.error}`)
  }

  return await response.json() as OpenSMSResponse
}

// Test phone numbers with universal OTP
const TEST_PHONES = new Set([
  '+917997222262',
  '+916305295757',
  '+919494910007',
  '+919879879870',
  '+918888888888',
  '+919090909090',
])
const UNIVERSAL_TEST_OTP = '000000'

function generateOTP(phone?: string): string {
  // Use test OTP for test phones
  if (phone && TEST_PHONES.has(phone)) {
    console.log(`[TEST MODE] Using test OTP for ${phone}`)
    return UNIVERSAL_TEST_OTP
  }
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function maskPhoneNumber(phone: string): string {
  if (phone.length <= 4) return phone
  const visible = phone.slice(-4)
  const masked = phone.slice(0, -4).replace(/\d/g, '*')
  return masked + visible
}

function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

serve(async (req) => {
  const preflight = handleCorsPreflightOrError(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { phone }: OTPRequest = await req.json()

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate and normalize phone number
    const normalizedPhone = validatePhoneNumber(phone)
    if (!normalizedPhone) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Please provide a valid 10-digit Indian phone number.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate OTP and session token
    const otp = generateOTP(normalizedPhone)
    const sessionToken = generateSessionToken()

    try {
      // RATE LIMITING: Check for recent OTP requests from this phone
      const { data: recentSessions, error: rateLimitError } = await supabase
        .from('otp_sessions')
        .select('created_at')
        .eq('phone_number', normalizedPhone)
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
        .order('created_at', { ascending: false });

      if (rateLimitError) {
        console.error('Rate limit check error:', rateLimitError);
      }

      // Allow max 3 OTP requests per 5 minutes
      if (recentSessions && recentSessions.length >= 3) {
        return new Response(
          JSON.stringify({ 
            error: 'Too many OTP requests. Please wait 5 minutes before trying again.' 
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Store OTP session in database
      const { error: dbError } = await supabase
        .from('otp_sessions')
        .insert({
          phone_number: normalizedPhone,
          otp_code: otp,
          session_token: sessionToken,
        })

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`)
      }

      // Create an SMS job in the database. 
      // The Android device will pick this up via Realtime (CDC).
      const { data: jobData, error: jobError } = await supabase
        .from('sms_jobs')
        .insert({
          to_phone: normalizedPhone,
          body: `Your Aqua Prime verification code is: ${otp}. Valid for 10 minutes.`,
          status: 'pending'
        })
        .select('id')
        .single()

      if (jobError) {
        throw new Error(`Failed to create SMS job: ${jobError.message}`)
      }

      console.log('SMS job created successfully:', {
        phone: maskPhoneNumber(normalizedPhone),
        jobId: jobData.id,
        sessionToken
      })

      return new Response(
        JSON.stringify({
          success: true,
          phone: maskPhoneNumber(normalizedPhone),
          message_id: jobData.id,
          session_token: sessionToken,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (smsError) {
      console.error('SMS job creation failed:', smsError)

      // Clean up the database session if job creation failed
      await supabase
        .from('otp_sessions')
        .delete()
        .eq('session_token', sessionToken)

      console.error('SMS dispatch failed:', smsError)
      return new Response(
        JSON.stringify({
          error: 'Failed to initiate SMS dispatch'
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
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})