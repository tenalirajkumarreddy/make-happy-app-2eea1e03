// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeEmail(email?: string | null) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function significantPhone(phone?: string | null) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

function maskPhoneLast3(phone?: string | null) {
  const digits = significantPhone(phone) || "";
  return digits.length >= 3 ? `***${digits.slice(-3)}` : "***";
}

function isSyntheticPhoneEmail(email?: string | null) {
  if (!email) return false;
  return /^phone_\d+@phone\.aquaprime\.app$/i.test(String(email).trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase env secrets are not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) {
      throw userError || new Error("Unauthorized");
    }

    const userId = user.id;
    const canonicalEmail = normalizeEmail(user.email);
    const canonicalPhone = significantPhone(user.phone);
    const providers = (user.app_metadata?.providers || []) as string[];
    const primaryProvider = user.app_metadata?.provider as string | undefined;
    const identityProviders = (user.identities || []).map((identity: any) => identity?.provider);
    const hasGoogle =
      providers.includes("google") ||
      identityProviders.includes("google") ||
      primaryProvider === "google";
    const loginMethod = hasGoogle ? "google" : "phone";

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const currentRole = roleData?.role || null;

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_directory")
      .select("id, user_id, full_name, avatar_url, role, email, phone, is_active")
      .eq("is_active", true)
      .limit(5000);
    if (staffError) throw staffError;

    const staffMatch = (staffRows || []).find((row) => {
      const rowEmail = normalizeEmail(row.email);
      const rowPhone = significantPhone(row.phone);
      return (
        row.user_id === userId ||
        (canonicalEmail && rowEmail === canonicalEmail) ||
        (canonicalPhone && rowPhone === canonicalPhone)
      );
    });

    const { data: invitationRows, error: invitationError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, email, phone, full_name, role, status, accepted_at, created_at")
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(5000);
    if (invitationError) throw invitationError;

    const invitationMatch = (invitationRows || []).find((row) => {
      const rowEmail = normalizeEmail(row.email);
      const rowPhone = significantPhone(row.phone);
      return (
        (canonicalEmail && rowEmail === canonicalEmail) ||
        (canonicalPhone && rowPhone === canonicalPhone)
      );
    });

    const resolvedStaffRole =
      currentRole && currentRole !== "customer"
        ? currentRole
        : staffMatch?.role || invitationMatch?.role || null;

    if (resolvedStaffRole) {
      const { error: roleDeleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (roleDeleteError) throw roleDeleteError;

      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: resolvedStaffRole });
      if (roleInsertError) throw roleInsertError;

      if (staffMatch) {
        const { error: linkStaffError } = await supabaseAdmin
          .from("staff_directory")
          .update({
            user_id: userId,
            email: canonicalEmail || staffMatch.email || null,
            phone: canonicalPhone || staffMatch.phone || null,
            is_active: true,
          })
          .eq("id", staffMatch.id);
        if (linkStaffError) throw linkStaffError;
      } else if (invitationMatch) {
        const { data: existingDirByUser } = await supabaseAdmin
          .from("staff_directory")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (existingDirByUser) {
          const { error: updateDirError } = await supabaseAdmin
            .from("staff_directory")
            .update({
              email: canonicalEmail || invitationMatch.email || null,
              phone: canonicalPhone || invitationMatch.phone || null,
              full_name: invitationMatch.full_name || null,
              role: invitationMatch.role,
              is_active: true,
            })
            .eq("id", existingDirByUser.id);
          if (updateDirError) throw updateDirError;
        } else {
          const { error: insertDirError } = await supabaseAdmin
            .from("staff_directory")
            .insert({
              user_id: userId,
              email: canonicalEmail || invitationMatch.email || null,
              phone: canonicalPhone || invitationMatch.phone || null,
              full_name: invitationMatch.full_name || "Staff",
              role: invitationMatch.role,
              avatar_url: null,
              is_active: true,
            });
          if (insertDirError) throw insertDirError;
        }

        const { error: invitationUpdateError } = await supabaseAdmin
          .from("staff_invitations")
          .update({
            status: "accepted",
            accepted_at: invitationMatch.accepted_at || new Date().toISOString(),
          })
          .eq("id", invitationMatch.id);
        if (invitationUpdateError) throw invitationUpdateError;
      }

      const fullName = staffMatch?.full_name || invitationMatch?.full_name || user.user_metadata?.full_name || "Staff";
      const profileEmail = !isSyntheticPhoneEmail(canonicalEmail) ? canonicalEmail : null;
      const { error: profileUpsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            user_id: userId,
            full_name: fullName,
            display_name: fullName,
            email: profileEmail,
            phone: canonicalPhone || null,
            avatar_url: staffMatch?.avatar_url || null,
            is_active: true,
            phone_verified: !!canonicalPhone,
            google_linked: hasGoogle,
            onboarding_complete: true,
          },
          { onConflict: "user_id" }
        );
      if (profileUpsertError) throw profileUpsertError;

      return new Response(
        JSON.stringify({
          type: "staff",
          role: resolvedStaffRole,
          staffId: staffMatch?.id || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: customerRows, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, user_id, phone, email")
      .limit(5000);
    if (customerError) throw customerError;

    const customerMatch = (customerRows || []).find((row) => {
      const rowEmail = normalizeEmail(row.email);
      const rowPhone = significantPhone(row.phone);
      return (
        row.user_id === userId ||
        (!!canonicalPhone && !!rowPhone && rowPhone === canonicalPhone) ||
        (!!canonicalEmail && !isSyntheticPhoneEmail(canonicalEmail) && !!rowEmail && rowEmail === canonicalEmail)
      );
    });

    if (customerMatch) {
      if (customerMatch.user_id && customerMatch.user_id !== userId) {
        return new Response(
          JSON.stringify({
            type: "new_customer_known_phone",
            maskedPhone: maskPhoneLast3(customerMatch.phone),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!customerMatch.user_id) {
        const { error: linkError } = await supabaseAdmin
          .from("customers")
          .update({ user_id: userId })
          .eq("id", customerMatch.id);
        if (linkError) throw linkError;
      }

      const { error: roleUpsertError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id" });
      if (roleUpsertError) throw roleUpsertError;

      const profileEmail = !isSyntheticPhoneEmail(canonicalEmail) ? canonicalEmail : null;
      const profileName = user.user_metadata?.full_name || user.user_metadata?.name || "Customer";
      const { error: profileUpsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            user_id: userId,
            full_name: profileName,
            display_name: profileName,
            email: profileEmail,
            phone: canonicalPhone || null,
            is_active: true,
            phone_verified: !!canonicalPhone,
            google_linked: hasGoogle,
            onboarding_complete: true,
          },
          { onConflict: "user_id" }
        );
      if (profileUpsertError) throw profileUpsertError;

      return new Response(
        JSON.stringify({
          type: "existing_customer",
          customerId: customerMatch.id,
          googleLinked: hasGoogle,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profileEmail = !isSyntheticPhoneEmail(canonicalEmail) ? canonicalEmail : null;
    const profileName = user.user_metadata?.full_name || user.user_metadata?.name || null;
    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          full_name: profileName,
          display_name: profileName,
          email: profileEmail,
          phone: canonicalPhone || null,
          is_active: true,
          phone_verified: !!canonicalPhone,
          google_linked: hasGoogle,
          onboarding_complete: false,
        },
        { onConflict: "user_id" }
      );
    if (profileUpsertError) throw profileUpsertError;

    return new Response(
      JSON.stringify({
        type: "onboarding_required",
        authUserId: userId,
        loginMethod,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("resolve-user-identity error:", error);
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
