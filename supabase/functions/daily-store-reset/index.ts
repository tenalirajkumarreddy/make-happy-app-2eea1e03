import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Delete all store visits from today (resetting daily visited status)
    // This effectively resets the "visited" markers on the map and route sessions
    const today = new Date().toISOString().split("T")[0];
    
    // End any active route sessions from yesterday
    const { data: staleSessions } = await supabase
      .from("route_sessions")
      .select("id")
      .eq("status", "active")
      .lt("started_at", today);

    if (staleSessions && staleSessions.length > 0) {
      await supabase
        .from("route_sessions")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .in("id", staleSessions.map((s: any) => s.id));
    }

    return new Response(
      JSON.stringify({
        success: true,
        staleSessionsClosed: staleSessions?.length || 0,
        resetDate: today,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
