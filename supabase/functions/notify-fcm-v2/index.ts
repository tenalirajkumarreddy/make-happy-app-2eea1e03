import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5";

const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8100",
  "capacitor://localhost",
  "ionic://localhost",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function handleCorsPreflightOrError(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}

interface FcmServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface NotifPayload {
  user_id: string;
  title: string;
  message: string;
  type?: string;
  entity_type?: string;
  entity_id?: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const bodyJson = await req.json();
    const payload: NotifPayload = bodyJson;
    if (!payload.user_id || !payload.title || !payload.message) {
      throw new Error("Missing required fields: user_id, title, message");
    }

    let saJson = bodyJson.fcm_service_account || Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!saJson) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: configRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "FCM_SERVICE_ACCOUNT")
        .single();
      saJson = configRow?.value ?? null;
    }
    if (!saJson) throw new Error("FCM_SERVICE_ACCOUNT not configured");
    const sa: FcmServiceAccount = typeof saJson === "string" ? JSON.parse(saJson) : saJson;

    let tokens: Array<{ token: string; id: string }> = bodyJson.fcm_tokens;
    if (!tokens) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: dbTokens } = await supabase
        .from("fcm_tokens")
        .select("token, id, updated_at")
        .eq("user_id", payload.user_id)
        .order("updated_at", { ascending: false });
      
      // Select only the single most recently active token to prevent duplicate system tray notifications
      tokens = dbTokens && dbTokens.length > 0 
        ? [{ token: dbTokens[0].token, id: dbTokens[0].id }] 
        : [];
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Double-check de-duplication of tokens by token string to be 100% safe
    const uniqueTokensMap = new Map<string, { token: string; id: string }>();
    for (const t of tokens) {
      uniqueTokensMap.set(t.token, t);
    }
    const uniqueTokens = Array.from(uniqueTokensMap.values());

    const accessToken = await getFcmAccessToken(sa);

    const results = await Promise.all(
      uniqueTokens.map(async (t) => {
        try {
          await sendFcmMessage(sa.project_id, accessToken, t.token, payload);
          return { token_id: t.id, success: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("UNREGISTERED") || msg.includes("NOT_FOUND") || msg.includes("INVALID_ARGUMENT")) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (supabaseUrl && serviceRoleKey) {
              const dbClient = createClient(supabaseUrl, serviceRoleKey);
              dbClient.from("fcm_tokens").delete().eq("id", t.id).then(() => {
                console.log(`Deleted stale token: ${t.id}`);
              });
            }
          }
          return { token_id: t.id, success: false, error: msg };
        }
      })
    );

    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getFcmAccessToken(sa: FcmServiceAccount): Promise<string> {
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth2 error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  notif: NotifPayload,
) {
  const body = {
    message: {
      token: deviceToken,
      notification: {
        title: notif.title,
        body: notif.message,
      },
      data: {
        type: notif.type || "",
        entity_type: notif.entity_type || "",
        entity_id: notif.entity_id || "",
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          priority: "high" as const,
          icon: "ic_launcher",
          color: "#2196F3",
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`FCM error ${res.status}: ${errBody}`);
  }
}
