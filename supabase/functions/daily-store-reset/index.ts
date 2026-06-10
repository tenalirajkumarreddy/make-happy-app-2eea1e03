import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";
import { requireCronOrSuperAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const authError = await requireCronOrSuperAdmin(req, supabase);
    if (authError) return authError;

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN LOGIC
    // ─────────────────────────────────────────────────────────────────────────
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
