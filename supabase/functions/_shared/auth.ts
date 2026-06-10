/**
 * Shared authentication utilities for Edge Functions.
 *
 * SECURITY: Timing-safe comparisons prevent timing attacks on secrets.
 * NEVER use `===` for secret comparison — it leaks via response time.
 */

/**
 * Timing-safe string comparison.
 * Prevents timing attacks where an attacker can determine correct characters
 * by measuring response time differences.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate a cron secret from request headers against the environment variable.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function isValidCronRequest(req: Request): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !expectedCronSecret) return false;
  return timingSafeEquals(cronSecret, expectedCronSecret);
}

/**
 * Validate a request is either a valid cron invocation or an authenticated super_admin.
 * Returns null if valid, or a Response to return immediately.
 */
export async function requireCronOrSuperAdmin(
  req: Request,
  supabase: any
): Promise<Response | null> {
  if (isValidCronRequest(req)) return null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleData?.role !== "super_admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: super_admin required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return null;
}
