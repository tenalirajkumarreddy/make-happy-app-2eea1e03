import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";
import { requireCronOrSuperAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authError = await requireCronOrSuperAdmin(req, supabase);
    if (authError) return authError;

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

    // Step 2: Trigger daily reset for all finalizers
    const { data: finalizers } = await supabase
      .from("user_permissions")
      .select("user_id")
      .eq("permission", "finalizer")
      .eq("enabled", true);

    const resetResults: { user_id: string; success: boolean; error?: string }[] = [];
    for (const f of finalizers ?? []) {
      try {
        const { error: resetError } = await supabase.rpc("finalizer_daily_reset", {
          p_finalizer_id: f.user_id,
        });
        resetResults.push({ user_id: f.user_id, success: !resetError, error: resetError?.message });
      } catch (e: any) {
        resetResults.push({ user_id: f.user_id, success: false, error: e.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      users: salesAggregates.length,
      finalizersReset: resetResults.length,
      resetResults,
    }), {
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
