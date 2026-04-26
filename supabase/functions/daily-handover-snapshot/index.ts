import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8100",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate the request - require super_admin or system cron
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    // Allow if valid cron secret provided (for scheduled invocations)
    const isValidCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;

    if (!isValidCron) {
      // Otherwise require authenticated super_admin
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is super_admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "super_admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: super_admin required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // OPTIMIZATION: Use SQL aggregation instead of N+1 queries
    // Single query to get all sales totals grouped by user
    const { data: salesAggregates } = await supabase.rpc("get_daily_handover_aggregates", {
      p_snapshot_date: today
    });

    if (!salesAggregates || salesAggregates.length === 0) {
      return new Response(JSON.stringify({ success: true, users: 0, message: "No staff users found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk upsert all snapshots in a single operation
    const snapshots = salesAggregates.map((agg: any) => ({
      user_id: agg.user_id,
      snapshot_date: today,
      balance_amount: agg.balance, // ISSUE-12 FIX: Preserve negative balances for audit accuracy
    }));

    const { error: upsertError } = await supabase
      .from("handover_snapshots")
      .upsert(snapshots, { onConflict: "user_id,snapshot_date" });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ success: true, users: salesAggregates.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("daily-handover-snapshot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
