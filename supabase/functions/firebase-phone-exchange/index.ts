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
