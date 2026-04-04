import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    // ─────────────────────────────────────────────────────────────────────────
    // AUTHENTICATION: Require either cron secret or super_admin JWT
    // ─────────────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    
    // Check cron secret first (for scheduled jobs)
    const isValidCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;
    
    if (!isValidCron) {
      // Validate JWT for manual invocations
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(supabaseUrl, serviceRoleKey);
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check role
      const { data: roleData } = await supabaseAuth
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (roleData?.role !== "super_admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden - super_admin role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, serviceRoleKey);
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
    console.error("daily-store-reset error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
