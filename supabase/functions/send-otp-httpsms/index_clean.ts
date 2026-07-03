import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Inline CORS handlers
const DEFAULT_ALLOWED_ORIGIN = "https://aquaprimesales.vercel.app";
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1") ? origin : DEFAULT_ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function handleCorsPreflightOrError(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}

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
  const apiUrl = 'https://api.httpsms.com/v1/messages/send'
  const payload = {
    from: fromPhone,
    to: to,
    content: `Your OTP for Aqua Prime is: ${otp}. Valid for 10 minutes. Do not share it with anyone.`
  }
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000),
  })
  const responseData = await response.json()
  if (!response.ok) {
    throw new Error(`HTTPsms API error (${response.status}): ${responseData.message || JSON.stringify(responseData)}`)
  }
  return responseData as HTTPsmsResponse
}

const UNIVERSAL_TEST_OTP = '000000'

function generateOTP(_phone?: string): string {
  if (Deno.env.get('USE_TEST_OTP') === 'true') {
    console.log(`[TEST MODE] Using universal test OTP 000000`)
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

    const apiKey = Deno.env.get('HTTPSMS_API_KEY')
    const fromPhone = Deno.env.get('HTTPSMS_FROM_PHONE')

    const { phone }: OTPRequest = await req.json()

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedPhone = validatePhoneNumber(phone)
    if (!normalizedPhone) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Please provide a valid 10-digit Indian phone number.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'HTTPsms API key not configured. Set HTTPSMS_API_KEY environment variable.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!fromPhone) {
      return new Response(
        JSON.stringify({ error: 'HTTPsms from phone not configured. Set HTTPSMS_FROM_PHONE environment variable.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const otp = generateOTP(normalizedPhone)
    const sessionToken = generateSessionToken()

    const { data: recentSessions, error: rateLimitError } = await supabase
      .from('otp_sessions')
      .select('created_at')
      .eq('phone_number', normalizedPhone)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (recentSessions && recentSessions.length >= 3) {
      return new Response(
        JSON.stringify({ error: 'Too many OTP requests. Please wait 5 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const smsResponse = await sendSMSViaHTTPsms(normalizedPhone, otp, apiKey, fromPhone)
    console.log('HTTPsms sent successfully:', {
      phone: maskPhoneNumber(normalizedPhone),
      messageId: smsResponse.data.id,
      sessionToken
    })

    return new Response(
      JSON.stringify({
        success: true,
        phone: maskPhoneNumber(normalizedPhone),
        session_token: sessionToken,
        message_id: smsResponse.data.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to send OTP',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})