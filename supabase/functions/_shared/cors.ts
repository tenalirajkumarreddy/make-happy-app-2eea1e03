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

// ============================================================================
// IDEMPOTENCY KEY UTILITIES
// For preventing duplicate operations on retries
// ============================================================================

/**
 * In-memory idempotency key store
 * In production, use Redis or database-backed storage
 */
const idempotencyStore = new Map<string, { response: any; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a request has been processed before
 */
export function getIdempotencyResponse(key: string): any | null {
  const entry = idempotencyStore.get(key);
  if (!entry) return null;
  
  // Check if entry is expired
  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyStore.delete(key);
    return null;
  }
  
  return entry.response;
}

/**
 * Store response for idempotency key
 */
export function setIdempotencyResponse(key: string, response: any): void {
  idempotencyStore.set(key, { response, timestamp: Date.now() });
  
  // Cleanup old entries periodically
  if (idempotencyStore.size > 1000) {
    cleanupIdempotencyStore();
  }
}

/**
 * Extract idempotency key from request headers
 */
export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get("Idempotency-Key") || req.headers.get("X-Idempotency-Key");
}

/**
 * Generate idempotency key from request body
 */
export async function generateIdempotencyKey(req: Request): Promise<string> {
  const body = await req.clone().text();
  const timestamp = Math.floor(Date.now() / 60000); // Round to nearest minute
  const data = `${req.method}:${req.url}:${body}:${timestamp}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `req_${Math.abs(hash).toString(16)}`;
}

/**
 * Cleanup expired idempotency entries
 */
function cleanupIdempotencyStore(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}
