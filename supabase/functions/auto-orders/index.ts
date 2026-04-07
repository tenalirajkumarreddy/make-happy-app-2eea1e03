import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    const ordersToInsert = [];

    for (const store of stores || []) {
      const uniqueSuffix = String(Math.floor(10000000 + Math.random() * 90000000));
      ordersToInsert.push({
        display_id: `ORD-${uniqueSuffix}`,
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
