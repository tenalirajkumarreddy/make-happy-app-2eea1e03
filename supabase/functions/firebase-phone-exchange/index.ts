// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FirebasePayload = {
  sub: string;
  phone_number?: string;
  email?: string;
  name?: string;
};

function toBase64Url(bytes: Uint8Array) {
  const raw = btoa(String.fromCharCode(...bytes));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function derivePassword(uid: string, pepper: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${uid}:${pepper}`));
  return toBase64Url(new Uint8Array(digest));
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function significantPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

const VALID_STAFF_ROLES = ['super_admin', 'manager', 'agent', 'marketer', 'pos'] as const;
type ValidStaffRole = typeof VALID_STAFF_ROLES[number];

function isValidStaffRole(role: string): role is ValidStaffRole {
  return VALID_STAFF_ROLES.includes(role as ValidStaffRole);
}

function syntheticEmailFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `phone_${digits}@phone.aquaprime.app`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { idToken } = await req.json();
    if (!idToken || typeof idToken !== "string") {
      throw new Error("Missing firebase idToken");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "aqua-prime-auth";
    const phonePepper = Deno.env.get("PHONE_AUTH_PASSWORD_PEPPER") || "aquaprime_phone_pepper_v1";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase env secrets are not configured");
    }
    const JWKS = createRemoteJWKSet(
      new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
    );

    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });

    const fbPayload = payload as unknown as FirebasePayload;
    const firebaseUid = fbPayload.sub;
    const phoneNumber = fbPayload.phone_number ? normalizePhone(fbPayload.phone_number) : null;

    if (!firebaseUid || !phoneNumber) {
      throw new Error("Firebase token is missing phone identity");
    }

    const email = syntheticEmailFromPhone(phoneNumber);
    const password = await derivePassword(firebaseUid, phonePepper);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        auth_provider: "firebase_phone",
        firebase_uid: firebaseUid,
        phone: phoneNumber,
        full_name: fbPayload.name || phoneNumber,
      },
    });

    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError;
    }

    const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      const errorMessage = tokenData?.error_description || tokenData?.msg || "Failed to create Supabase session";
      throw new Error(errorMessage);
    }

    const appUserId = tokenData?.user?.id as string | undefined;
    if (appUserId) {
      const customerPhoneKey = significantPhone(phoneNumber);

      const { data: staffRows, error: staffReadError } = await supabaseAdmin
        .from("staff_directory")
        .select("id, phone, user_id, role, full_name, avatar_url, is_active")
        .eq("is_active", true)
        .limit(5000);

      if (staffReadError) {
        throw staffReadError;
      }

      const matchingStaff = (staffRows || []).filter(
        (row) => row.phone && significantPhone(row.phone) === customerPhoneKey
      );

      if (matchingStaff.length > 1) {
        throw new Error("Multiple active staff profiles found for this phone number. Please contact admin.");
      }

      if (matchingStaff.length === 1) {
        const staff = matchingStaff[0];

        // Validate staff role before assignment
        if (!isValidStaffRole(staff.role)) {
          throw new Error(`Invalid staff role: ${staff.role}. Contact admin to correct staff directory.`);
        }

        if (staff.user_id !== appUserId) {
          const { error: linkStaffError } = await supabaseAdmin
            .from("staff_directory")
            .update({ user_id: appUserId })
            .eq("id", staff.id)
            .eq("user_id", staff.user_id); // Optimistic lock - only update if user_id unchanged
          if (linkStaffError) throw linkStaffError;
        }

        const { error: roleDeleteError } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", appUserId);
        if (roleDeleteError) throw roleDeleteError;

        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: appUserId, role: staff.role });
        if (roleInsertError) throw roleInsertError;

        const { error: profileUpsertError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            user_id: appUserId,
            full_name: staff.full_name || fbPayload.name || "Staff",
            email: tokenData?.user?.email || null,
            phone: phoneNumber,
            avatar_url: staff.avatar_url || null,
            is_active: true,
          }, { onConflict: "user_id" });
        if (profileUpsertError) throw profileUpsertError;

        return new Response(
          JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            token_type: tokenData.token_type,
            user: tokenData.user,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const { data: invitationRows, error: invitationReadError } = await supabaseAdmin
        .from("staff_invitations")
        .select("id, phone, full_name, role, status, accepted_at")
        .not("phone", "is", null)
        .limit(5000);

      if (invitationReadError) {
        throw invitationReadError;
      }

      const matchingInvitations = (invitationRows || []).filter(
        (row) =>
          row.phone &&
          significantPhone(row.phone) === customerPhoneKey &&
          (row.status === "accepted" || row.status === "pending")
      );

      if (matchingInvitations.length > 1) {
        throw new Error("Multiple staff invitations found for this phone number. Please contact admin.");
      }

      if (matchingInvitations.length === 1) {
        const invitation = matchingInvitations[0];

        const { data: existingDirRows, error: existingDirReadError } = await supabaseAdmin
          .from("staff_directory")
          .select("id, phone")
          .not("phone", "is", null)
          .limit(5000);

        if (existingDirReadError) {
          throw existingDirReadError;
        }

        const existingDir = (existingDirRows || []).find(
          (row) => row.phone && significantPhone(row.phone) === customerPhoneKey
        );

        if (existingDir) {
          const { error: linkDirError } = await supabaseAdmin
            .from("staff_directory")
            .update({
              user_id: appUserId,
              phone: phoneNumber,
              full_name: invitation.full_name || fbPayload.name || "Staff",
              role: invitation.role,
              is_active: true,
            })
            .eq("id", existingDir.id);
          if (linkDirError) throw linkDirError;
        } else {
          const { error: createDirError } = await supabaseAdmin
            .from("staff_directory")
            .insert({
              user_id: appUserId,
              phone: phoneNumber,
              email: tokenData?.user?.email || null,
              full_name: invitation.full_name || fbPayload.name || "Staff",
              role: invitation.role,
              avatar_url: null,
              is_active: true,
            });
          if (createDirError) throw createDirError;
        }

        const { error: invitationUpdateError } = await supabaseAdmin
          .from("staff_invitations")
          .update({
            status: "accepted",
            accepted_at: invitation.accepted_at || new Date().toISOString(),
          })
          .eq("id", invitation.id);
        if (invitationUpdateError) throw invitationUpdateError;

        const { error: roleDeleteError } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", appUserId);
        if (roleDeleteError) throw roleDeleteError;

        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: appUserId, role: invitation.role });
        if (roleInsertError) throw roleInsertError;

        const { error: profileUpsertError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            user_id: appUserId,
            full_name: invitation.full_name || fbPayload.name || "Staff",
            email: tokenData?.user?.email || null,
            phone: phoneNumber,
            avatar_url: null,
            is_active: true,
          }, { onConflict: "user_id" });
        if (profileUpsertError) throw profileUpsertError;

        return new Response(
          JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            token_type: tokenData.token_type,
            user: tokenData.user,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const { data: customerRows, error: customerReadError } = await supabaseAdmin
        .from("customers")
        .select("id, phone, user_id")
        .not("phone", "is", null)
        .limit(5000);

      if (customerReadError) {
        throw customerReadError;
      }

      const matchingCustomers = (customerRows || []).filter(
        (row) => row.phone && significantPhone(row.phone) === customerPhoneKey
      );

      if (matchingCustomers.length > 1) {
        throw new Error("Multiple customer profiles found for this phone number. Please contact admin.");
      }

      if (matchingCustomers.length === 1) {
        const matched = matchingCustomers[0];
        if (matched.user_id !== appUserId) {
          const { error: linkError } = await supabaseAdmin
            .from("customers")
            .update({ user_id: appUserId })
            .eq("id", matched.id);

          if (linkError) {
            throw linkError;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        user: tokenData.user,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
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
