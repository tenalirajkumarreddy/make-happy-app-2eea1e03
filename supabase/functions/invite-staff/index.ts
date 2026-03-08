import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Unauthorized");

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (callerRole?.role !== "super_admin") throw new Error("Only super_admin can invite staff");

    const { email, full_name, role } = await req.json();
    if (!email || !full_name || !role) throw new Error("Missing required fields");

    // Check if already invited and pending
    const { data: existing } = await supabaseAdmin
      .from("staff_invitations")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("An invitation is already pending for this email");

    // Create user with admin API (auto-confirms email, sends invite)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError) throw createError;

    // Assign role (replace default 'customer' role set by trigger)
    await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUser.user.id);

    // Record the invitation
    await supabaseAdmin.from("staff_invitations").insert({
      email: email.toLowerCase(),
      full_name,
      role,
      invited_by: caller.id,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });

    // Send password reset so user can set their own password
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
    });

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
