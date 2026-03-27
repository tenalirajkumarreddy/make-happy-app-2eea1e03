// @ts-nocheck
// Google OAuth staff login handler
// Takes Google auth data and verifies/links staff directory entry by email

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase env secrets are not configured");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // The request should contain the user_id of the logged-in user (after Google OAuth redirect)
    const { user_id, email } = await req.json();
    
    if (!user_id || !email) {
      throw new Error("Missing user_id or email");
    }

    const normalizedEmail = email.toLowerCase().trim();

    // PRIMARY lookup: Check staff_directory by email (direct Google validation)
    const { data: staffByEmail, error: staffByEmailError } = await supabaseAdmin
      .from("staff_directory")
      .select("id, phone, email, full_name, avatar_url, role, is_active, user_id")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (staffByEmailError && staffByEmailError.code !== "PGRST116") {
      console.error("Error checking staff_directory by email:", staffByEmailError);
    }

    // SECONDARY lookup: Check staff_invitations (email-based staff records)
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

    // TERTIARY lookup: Check staff_directory by linked user_id
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

    // If found in invitations (email-based), use that role
    if (staffByEmail) {
      staffData = staffByEmail;
      staffRole = staffData.role;
    } else if (staffInvitation) {
      staffRole = staffInvitation.role;
    } else if (staffByUser) {
      // Otherwise if already linked in staff_directory, use that
      staffData = staffByUser;
      staffRole = staffData.role;
    }

    if (!staffRole) {
      // Not a staff member, return empty response (customer flow will handle)
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

    // User is a staff member, assign role and create profile
    
    // Delete any existing roles and add staff role
    const { error: roleDeleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user_id);
    if (roleDeleteError) throw roleDeleteError;

    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id, role: staffRole });
    if (roleInsertError) throw roleInsertError;

    // Link staff_directory if we found a direct match
    if (staffData) {
      const { error: staffLinkError } = await supabaseAdmin
        .from("staff_directory")
        .update({ user_id, email: normalizedEmail })
        .eq("id", staffData.id);
      if (staffLinkError) throw staffLinkError;
    }

    // Create or update profile with best-available data
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

    // For invitation-only staff, ensure staff_directory has an email row for future direct validation.
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
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
