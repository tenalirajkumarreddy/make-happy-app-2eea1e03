import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8100",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (origin === "null") return true;
  if (origin === "capacitor://localhost" || origin === "ionic://localhost") return true;

  try {
    const url = new URL(origin);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return true;
    }
    if (url.protocol === "https:") return true;
  } catch {
    // ignore malformed Origin
  }

  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    } else {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (error) throw error;
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
