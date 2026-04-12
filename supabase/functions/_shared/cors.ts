/**
 * Shared CORS headers for all Edge Functions.
 *
 * NOTE: CORS is a browser safety mechanism, not an auth layer.
 * We keep it permissive enough to support:
 * - Vercel preview + production deployments
 * - Capacitor/Ionic WebViews
 * - Local development on any port
 */
const DEFAULT_ALLOWED_ORIGIN = "https://aquaprimesales.vercel.app";

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  // Some WebViews / file:// contexts send `Origin: null`
  if (origin === "null") return true;

  // Explicitly allow Capacitor / Ionic schemes
  if (origin === "capacitor://localhost" || origin === "ionic://localhost") return true;

  try {
    const url = new URL(origin);

    // Allow any localhost/127.0.0.1 port for dev + WebView
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return true;
    }

    // Allow any HTTPS origin (supports custom domains + Vercel previews)
    if (url.protocol === "https:") return true;
  } catch {
    // Ignore malformed Origin values
  }

  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : DEFAULT_ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function handleCorsPreflightOrError(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}
