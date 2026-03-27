// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function significantPhone(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

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

    const { email, phone, full_name, role, avatar_url } = await req.json();
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    
    // At least one identifier required
    if (!full_name || !role || (!phone && !normalizedEmail)) {
      throw new Error("Missing required fields: full_name, role, and at least one of (phone or email)");
    }

    // If phone provided, handle phone-based registration
    if (phone) {
      const phoneKey = significantPhone(phone);
      if (phoneKey.length !== 10) throw new Error("Phone number must contain 10 digits");

      // Upsert into staff directory by normalized phone key
      const { data: existingStaffRows, error: existingStaffError } = await supabaseAdmin
        .from("staff_directory")
        .select("id, phone")
        .limit(5000);
      if (existingStaffError) throw existingStaffError;

      const matchedStaff = (existingStaffRows || []).find((row: any) => significantPhone(row.phone) === phoneKey);

      if (matchedStaff) {
        const { error: updateStaffError } = await supabaseAdmin
          .from("staff_directory")
          .update({
            full_name,
            role,
            avatar_url: avatar_url || null,
            phone,
            is_active: true,
            email: normalizedEmail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchedStaff.id);
        if (updateStaffError) throw updateStaffError;
      } else {
        const { error: insertStaffError } = await supabaseAdmin
          .from("staff_directory")
          .insert({
            phone,
            full_name,
            role,
            avatar_url: avatar_url || null,
            is_active: true,
            email: normalizedEmail,
          });
        if (insertStaffError) throw insertStaffError;
      }
    }

    // If no email, return early (phone-only registration)
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ success: true, mode: "phone_registered", phone }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already invited and pending
    const { data: existing } = await supabaseAdmin
      .from("staff_invitations")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("An invitation is already pending for this email");

    // Create user with admin API (auto-confirms email, sends invite)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError) throw createError;

    // Assign role (replace default 'customer' role set by trigger)
    await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUser.user.id);

    const { data: staffRowsForLink } = await supabaseAdmin
      .from("staff_directory")
      .select("id, phone, email")
      .limit(5000);
    
    // Link by phone when available
    if (phone) {
      const phoneKey = significantPhone(phone);
      const staffToLink = (staffRowsForLink || []).find((row: any) => significantPhone(row.phone) === phoneKey);
      if (staffToLink) {
        await supabaseAdmin
          .from("staff_directory")
          .update({ user_id: newUser.user.id, email: normalizedEmail })
          .eq("id", staffToLink.id);
      }
    } else {
      // Email-only staff record in staff_directory
      const staffByEmail = (staffRowsForLink || []).find(
        (row: any) => row.email && String(row.email).toLowerCase() === normalizedEmail
      );

      if (staffByEmail) {
        await supabaseAdmin
          .from("staff_directory")
          .update({
            user_id: newUser.user.id,
            full_name,
            role,
            avatar_url: avatar_url || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", staffByEmail.id);
      } else {
        const { error: insertEmailStaffError } = await supabaseAdmin
          .from("staff_directory")
          .insert({
            user_id: newUser.user.id,
            email: normalizedEmail,
            phone: null,
            full_name,
            role,
            avatar_url: avatar_url || null,
            is_active: true,
          });
        if (insertEmailStaffError) throw insertEmailStaffError;
      }
    }

    // Record the invitation (this enables Google OAuth login)
    await supabaseAdmin.from("staff_invitations").insert({
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      full_name,
      role,
      invited_by: caller.id,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });

    // Send password reset so user can set their own password (for email-password login if needed)
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
    });

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id, mode: "staff_email_provisioned" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
