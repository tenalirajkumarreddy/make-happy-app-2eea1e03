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

    const today = new Date().toISOString().split("T")[0];

    // Get all users with roles (staff)
    const { data: roles } = await supabase.from("user_roles").select("user_id");
    const userIds = [...new Set((roles || []).map((r) => r.user_id))];

    for (const userId of userIds) {
      // Sales totals for this user
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

      await supabase.from("handover_snapshots").upsert(
        { user_id: userId, snapshot_date: today, balance_amount: Math.max(0, balance) },
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
