import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Inline CORS helpers
const DEFAULT_ALLOWED_ORIGIN = "*";
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": DEFAULT_ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  const corsHeaders = getCorsHeaders();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Parse delivered webhook payload
    const payload = await req.json()
    console.log('HTTPsms webhook received:', JSON.stringify(payload, null, 2))

    const eventType = payload?.type || 'unknown'
    const eventData = payload?.data || {}

    // Log event to database for debugging
    await supabase
      .from('httpsms_webhook_logs')
      .insert({
        event_type: eventType,
        payload: payload,
        message_id: eventData.message_id || eventData.id || null,
        phone: eventData.owner || eventData.contact || null,
        status: eventData.status || null,
      })
      .catch(err => {
        // Don't fail if logging fails
        console.error('Failed to log webhook:', err)
      })

    // Handle different event types
    switch (eventType) {
      case 'message.phone.sent':
        console.log(`✅ SMS sent: ${eventData.contact}`)
        break
      case 'message.phone.delivered':
        console.log(`✅ SMS delivered: ${eventData.contact}`)
        break
      case 'message.send.failed':
        console.error(`❌ SMS failed: ${eventData.error_message}`)
        break
      case 'message.send.expired':
        console.error(`⏰ SMS expired: ${eventData.message_id}`)
        break
      case 'phone.heartbeat.offline':
        console.warn(`📱 Phone offline: ${eventData.owner}`)
        break
      case 'phone.heartbeat.online':
        console.log(`📱 Phone online: ${eventData.owner}`)
        break
      default:
        console.log(`Unhandled event type: ${eventType}`)
    }

    return new Response(
      JSON.stringify({ received: true, type: eventType }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})