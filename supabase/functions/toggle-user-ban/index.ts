import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service_role client for all admin operations (including role validation)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller identity from JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use service_role to check role (bypasses RLS for reliable role check)
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).single();
    if (roleData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Only super admins can ban/unban users" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { user_id, ban } = await req.json();
    if (!user_id || typeof ban !== "boolean") {
      return new Response(JSON.stringify({ error: "user_id and ban (boolean) required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (ban) {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
      if (error) throw error;
      await adminClient.from("profiles").update({ is_active: false }).eq("user_id", user_id);
    } else {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (error) throw error;
      await adminClient.from("profiles").update({ is_active: true }).eq("user_id", user_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("toggle-user-ban error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
