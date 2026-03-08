import Deno from "https://deno.land/x/deno@v1.0.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get store types with auto_order_enabled
    const { data: autoTypes, error: typesErr } = await supabase
      .from("store_types")
      .select("id")
      .eq("auto_order_enabled", true)
      .eq("is_active", true);

    if (typesErr) throw typesErr;
    if (!autoTypes || autoTypes.length === 0) {
      return new Response(JSON.stringify({ message: "No auto-order store types" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeIds = autoTypes.map((t) => t.id);

    // Get active stores for these types
    const { data: stores, error: storesErr } = await supabase
      .from("stores")
      .select("id, customer_id, store_type_id, name")
      .eq("is_active", true)
      .in("store_type_id", typeIds);

    if (storesErr) throw storesErr;

    // Get current order count for display_id generation
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true });

    let orderNum = count || 0;
    const ordersToInsert = [];

    for (const store of stores || []) {
      orderNum++;
      ordersToInsert.push({
        display_id: `ORD-${String(orderNum).padStart(6, "0")}`,
        store_id: store.id,
        customer_id: store.customer_id,
        order_type: "simple",
        source: "auto",
        created_by: "00000000-0000-0000-0000-000000000000", // system
        requirement_note: "Auto-generated order",
      });
    }

    if (ordersToInsert.length > 0) {
      const { error: insertErr } = await supabase.from("orders").insert(ordersToInsert);
      if (insertErr) throw insertErr;
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      action: `Auto-generated ${ordersToInsert.length} orders`,
      entity_type: "order",
      entity_name: "Auto-order system",
    });

    return new Response(
      JSON.stringify({ success: true, ordersCreated: ordersToInsert.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
