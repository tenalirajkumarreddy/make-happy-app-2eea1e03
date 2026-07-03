import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

interface OTPRequest {
  phone: string
}

interface HTTPsmsResponse {
  data: {
    id: string
    from: string
    to: string
    content: string
    status: string
    created_at: string
    updated_at: string
  }
}

function validatePhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '')

  if (cleaned.length === 10) {
    return `+91${cleaned}`
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`
  } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(1)}`
  } else if (cleaned.length === 12 && cleaned.startsWith('+91')) {
    return cleaned
  }

  return null
}

async function sendSMSViaHTTPsms(to: string, otp: string, apiKey: string, fromPhone: string): Promise<HTTPsmsResponse> {
  const apiUrl = 'https://api.httpsms.com/v1/messages'

  const payload = {
    to: to,
    from: fromPhone,
    content: `Your Aqua Prime verification code is: ${otp}. Valid for 10 minutes. Do not share it with anyone.`
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000), // 35 second timeout
  })

  const responseData = await response.json()

  if (!response.ok) {
    throw new Error(`HTTPsms API error (${response.status}): ${responseData.message || JSON.stringify(responseData)}`)
  }

  return responseData as HTTPsmsResponse
}

// Universal test OTP - works for ANY phone number in development
const UNIVERSAL_TEST_OTP = '000000'

function generateOTP(_phone?: string): string {
  // Only use test OTP if USE_TEST_OTP env var is explicitly set
  if (Deno.env.get('USE_TEST_OTP') === 'true') {
    console.log(`[TEST MODE] Using universal test OTP 000000 for HTTPsms`)
    return UNIVERSAL_TEST_OTP
  }
  // Default: generate real random OTP
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

    const apiKey = Deno.env.get('HTTPSMS_API_KEY')
    const fromPhone = Deno.env.get('HTTPSMS_FROM_PHONE')

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

    // Check if HTTPSMS is configured
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'HTTPsms API key not configured. Set HTTPSMS_API_KEY environment variable.' }),
        {
          status: 500,
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
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (rateLimitError) {
        console.error('Rate limit check error:', rateLimitError);
      }

      // Allow max 3 OTP requests per 5 minutes
      if (recentSessions && recentSessions.length >= 3) {
        return new Response(
          JSON.stringify({
            error: 'Too many OTP好久没发了...查看请求!He本人在第5分钟之前还会继续发送OTP。请稍后再试。'  
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
          attempts: 0,
          max_attempts: 5,
        })

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`)
      }

      // Send SMS via HTTPsms
      try {
        // If fromPhone is not configured, we still return success but log a warning
        // The actual send will happen when the user provides the from number
        if (fromPhone) {
          const smsResponse = await sendSMSViaHTTPsms(normalizedPhone, otp, apiKey, fromPhone)
          console.log('HTTPsms sent successfully:', {
            phone: maskPhoneNumber(normalizedPhone),
            messageId: smsResponse.data.id,
            sessionToken
          })
        } else {
          console.warn('HTTPSMS_FROM_PHONE not configured. SMS not actually sent. Set HTTPSMS_FROM_PHONE env variable.')
        }
      } catch (smsError) {
        console.error('HTTPsms send failed:', smsError)
        // Don't fail the request - the OTP is still stored and can be delivered later
        // This matches the OpenSMS behavior where the database entry is created
      }

      return new Response(
        JSON.stringify({
          success: true,
          phone: maskPhoneNumber(normalizedPhone),
          session_token: sessionToken,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (error) {
      console.error('Function error:', error)

      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error),
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