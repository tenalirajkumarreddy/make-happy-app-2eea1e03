// Google OAuth staff login handler
// Takes Google auth data and verifies/links staff directory entry by email
// SECURITY: user_id is extracted from validated JWT, not request body

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase env secrets are not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - missing auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user_id = user.id;
    const email = user.email;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "User email not available in token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: staffByEmail, error: staffByEmailError } = await supabaseAdmin
      .from("staff_directory")
      .select("id, phone, email, full_name, avatar_url, role, is_active, user_id")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (staffByEmailError && staffByEmailError.code !== "PGRST116") {
      console.error("Error checking staff_directory by email:", staffByEmailError);
    }

    const { data: invitationRows, error: invitationError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, email, full_name, role, created_at")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1);

    if (invitationError) {
      console.error("Error checking staff_invitations:", invitationError);
    }

    const staffInvitation = invitationRows && invitationRows.length > 0 ? invitationRows[0] : null;

    const { data: staffByUser, error: staffByUserError } = await supabaseAdmin
      .from("staff_directory")
      .select("id, phone, email, full_name, avatar_url, role, is_active, user_id")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .maybeSingle();
    
    if (staffByUserError && staffByUserError.code !== "PGRST116") {
      console.error("Error checking staff_directory by user_id:", staffByUserError);
    }

    let staffRole = null;
    let staffData = null;

    if (staffByEmail) {
      staffData = staffByEmail;
      staffRole = staffData.role;
    } else if (staffInvitation) {
      staffRole = staffInvitation.role;
    } else if (staffByUser) {
      staffData = staffByUser;
      staffRole = staffData.role;
    }

    if (!staffRole) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          is_staff: false,
          message: "User is not registered as staff member" 
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { error: roleDeleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user_id);
    if (roleDeleteError) throw roleDeleteError;

    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id, role: staffRole });
    if (roleInsertError) throw roleInsertError;

    if (staffData) {
      const { error: staffLinkError } = await supabaseAdmin
        .from("staff_directory")
        .update({ user_id, email: normalizedEmail })
        .eq("id", staffData.id);
      if (staffLinkError) throw staffLinkError;
    }

    const fullName = staffData?.full_name || staffInvitation?.full_name || email.split("@")[0];
    const avatarUrl = staffData?.avatar_url || null;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id,
        full_name: fullName,
        email: normalizedEmail,
        avatar_url: avatarUrl,
        is_active: true,
      }, { onConflict: "user_id" });
    if (profileError) throw profileError;

    if (staffInvitation && !staffData) {
      const { data: existingDirByEmail, error: existingDirByEmailError } = await supabaseAdmin
        .from("staff_directory")
        .select("id")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (existingDirByEmailError && existingDirByEmailError.code !== "PGRST116") {
        throw existingDirByEmailError;
      }

      if (existingDirByEmail) {
        const { error: updateDirError } = await supabaseAdmin
          .from("staff_directory")
          .update({
            user_id,
            full_name: staffInvitation.full_name || email.split("@")[0],
            role: staffInvitation.role,
            is_active: true,
          })
          .eq("id", existingDirByEmail.id);
        if (updateDirError) throw updateDirError;
      } else {
        const { error: insertDirError } = await supabaseAdmin
          .from("staff_directory")
          .insert({
            user_id,
            email: normalizedEmail,
            phone: null,
            full_name: staffInvitation.full_name || email.split("@")[0],
            role: staffInvitation.role,
            is_active: true,
          });
        if (insertDirError) throw insertDirError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_staff: true,
        role: staffRole,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("google-staff-exchange error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
