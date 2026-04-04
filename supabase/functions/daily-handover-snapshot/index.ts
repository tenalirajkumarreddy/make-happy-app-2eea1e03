import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    // Get all staff users
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
    const userIds = [...new Set((roles || []).map((r) => r.user_id))];

    // Get finalizer permission holders
    const { data: finalizerPerms } = await supabase
      .from("user_permissions")
      .select("user_id")
      .eq("permission", "finalizer")
      .eq("enabled", true);
    const finalizerIds = new Set((finalizerPerms || []).map((p) => p.user_id));

    for (const userId of userIds) {
      // Sales totals
      const { data: sales } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount")
        .eq("recorded_by", userId);
      const salesTotal = (sales || []).reduce(
        (s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0
      );

      // Handovers sent confirmed
      const { data: sentConf } = await supabase
        .from("handovers")
        .select("cash_amount, upi_amount")
        .eq("user_id", userId)
        .eq("status", "confirmed");
      const sentConfTotal = (sentConf || []).reduce(
        (s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0
      );

      // Handovers sent pending
      const { data: sentPend } = await supabase
        .from("handovers")
        .select("cash_amount, upi_amount")
        .eq("user_id", userId)
        .eq("status", "awaiting_confirmation");
      const sentPendTotal = (sentPend || []).reduce(
        (s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0
      );

      // Handovers received confirmed
      const { data: recvConf } = await supabase
        .from("handovers")
        .select("cash_amount, upi_amount")
        .eq("handed_to", userId)
        .eq("status", "confirmed");
      const recvConfTotal = (recvConf || []).reduce(
        (s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0
      );

      const balance = salesTotal + recvConfTotal - sentConfTotal - sentPendTotal;

      // For finalizers, this balance is the "Total Income" for the day
      await supabase.from("handover_snapshots").upsert(
        {
          user_id: userId,
          snapshot_date: today,
          balance_amount: Math.max(0, balance),
        },
        { onConflict: "user_id,snapshot_date" }
      );
    }

    return new Response(JSON.stringify({ success: true, users: userIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
