// Firebase phone OTP authentication exchange
// 
// PERFORMANCE OPTIMIZATIONS (Applied 2026-04-07):
// - Replaced full table scans (limit 5000) with indexed RPC function calls
// - Uses find_staff_by_phone(), find_staff_invitation_by_phone(), find_customer_by_phone()
// - Reduces data transfer from ~15,000 rows to ~2 rows per auth request (99.9% reduction)
// - Server-side phone number matching using expression indexes on last-10-digits
// 
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

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
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

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
      // OPTIMIZATION: Use indexed RPC function instead of full table scan + client-side filtering
      const { data: matchingStaff, error: staffReadError } = await supabaseAdmin
        .rpc("find_staff_by_phone", { phone_input: phoneNumber });

      if (staffReadError) {
        throw staffReadError;
      }

      if (matchingStaff && matchingStaff.length > 1) {
        throw new Error("Multiple active staff profiles found for this phone number. Please contact admin.");
      }

      if (matchingStaff && matchingStaff.length === 1) {
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

      // OPTIMIZATION: Use indexed RPC function instead of full table scan + client-side filtering
      const { data: matchingInvitations, error: invitationReadError } = await supabaseAdmin
        .rpc("find_staff_invitation_by_phone", { phone_input: phoneNumber });

      if (invitationReadError) {
        throw invitationReadError;
      }

      if (matchingInvitations && matchingInvitations.length > 1) {
        throw new Error("Multiple staff invitations found for this phone number. Please contact admin.");
      }

      if (matchingInvitations && matchingInvitations.length === 1) {
        const invitation = matchingInvitations[0];

        // OPTIMIZATION: Use indexed RPC function instead of full table scan + client-side filtering
        const { data: existingDirRows, error: existingDirReadError } = await supabaseAdmin
          .rpc("find_staff_by_phone", { phone_input: phoneNumber });

        if (existingDirReadError) {
          throw existingDirReadError;
        }

        const existingDir = existingDirRows && existingDirRows.length > 0 ? existingDirRows[0] : null;

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

      // OPTIMIZATION: Use indexed RPC function instead of full table scan + client-side filtering
      const { data: matchingCustomers, error: customerReadError } = await supabaseAdmin
        .rpc("find_customer_by_phone", { phone_input: phoneNumber });

      if (customerReadError) {
        throw customerReadError;
      }

      if (matchingCustomers && matchingCustomers.length > 1) {
        throw new Error("Multiple customer profiles found for this phone number. Please contact admin.");
      }

      if (matchingCustomers && matchingCustomers.length === 1) {
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
