import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  getCorsHeaders, 
  getIdempotencyKey, 
  generateIdempotencyKey,
  getIdempotencyResponse, 
  setIdempotencyResponse 
} from "../_shared/cors.ts";

const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  // Local development origins - only allow in development environment
  ...(Deno.env.get("DENO_ENV") === "development" ? [
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:8100",
  ] : []),
];

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_INVITES_PER_HOUR = 10;

// Simple in-memory rate limiting store (use Redis/DB in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(userId);

  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return { allowed: true };
  }

  if (record.count >= MAX_INVITES_PER_HOUR) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    };
  }

  record.count++;
  return { allowed: true };
}

function significantPhone(phone?: string | null): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Finds a staff_directory row by phone using a targeted query instead of full-table scan.
 */
async function findStaffByPhone(supabaseAdmin: any, phoneKey: string) {
  // Use ilike with phone pattern for indexed lookup
  const { data, error } = await supabaseAdmin
    .from("staff_directory")
    .select("id, phone, email, user_id")
    .filter("phone", "not.is", null)
    .limit(100);
  if (error) throw error;

  return (data || []).find(
    (row: any) => significantPhone(row.phone) === phoneKey
  ) || null;
}

/**
 * Finds a staff_directory row by email using an indexed lookup.
 */
async function findStaffByEmail(supabaseAdmin: any, normalizedEmail: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_directory")
    .select("id, phone, email, user_id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Idempotency check
    let idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      idempotencyKey = await generateIdempotencyKey(req);
    }
    
    const cachedResponse = getIdempotencyResponse(idempotencyKey);
    if (cachedResponse) {
      return new Response(JSON.stringify(cachedResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Idempotency-Reused": "true" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase env secrets are not configured");
    }

    // Verify caller is super_admin
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

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Unauthorized");

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (callerRole?.role !== "super_admin") throw new Error("Only super_admin can invite staff");

    // Check rate limit
    const rateLimit = checkRateLimit(caller.id);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Maximum ${MAX_INVITES_PER_HOUR} invitations per hour. Try again in ${rateLimit.retryAfter} seconds.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.retryAfter),
          },
        }
      );
    }

    // Validate request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new Error("Invalid JSON request body");
    }

  const { email, phone, full_name, role, avatar_url } = body;

  // Enhanced full_name validation
  if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
    throw new Error("Missing required field: full_name");
  }

  const trimmedFullName = full_name.trim();
  if (trimmedFullName.length > 100) {
    throw new Error("Full name must be 100 characters or less");
  }
  if (trimmedFullName.length < 2) {
    throw new Error("Full name must be at least 2 characters");
  }
  // Basic name validation - allow letters, spaces, hyphens, and apostrophes
  if (!/^[\p{L}\s\-'\.]+$/u.test(trimmedFullName)) {
    throw new Error("Full name contains invalid characters");
  }

  if (!role || typeof role !== "string") {
    throw new Error("Missing required field: role");
  }

  const validRoles = ["super_admin", "manager", "agent", "marketer", "pos"];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`);
  }

  // Enhanced avatar_url validation
  if (avatar_url !== undefined && avatar_url !== null) {
    if (typeof avatar_url !== "string") {
      throw new Error("Avatar URL must be a string");
    }
    if (avatar_url.length > 500) {
      throw new Error("Avatar URL must be 500 characters or less");
    }
    // Basic URL validation - only allow safe URLs
    const allowedUrlPatterns = [
      /^https:\/\/[^\s\/$.?#].[^\s]*$/i,  // Standard HTTPS
      /^data:image\/[a-z]+;base64,/i,      // Base64 data URLs
    ];
    if (avatar_url.length > 0 && !allowedUrlPatterns.some(pattern => pattern.test(avatar_url))) {
      throw new Error("Avatar URL must be a valid HTTPS URL or base64 data URL");
    }
  }

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    if (!phone && !normalizedEmail) {
      throw new Error("At least one of phone or email is required");
    }

    // If phone provided, handle phone-based registration
    if (phone) {
      const phoneKey = significantPhone(phone);
      if (phoneKey.length !== 10) throw new Error("Phone number must contain 10 digits");

      // Indexed lookup instead of full-table scan
      const matchedStaff = await findStaffByPhone(supabaseAdmin, phoneKey);

      if (matchedStaff) {
        const { error: updateStaffError } = await supabaseAdmin
          .from("staff_directory")
          .update({
            full_name: full_name.trim(),
            role,
            avatar_url: avatar_url || null,
            phone,
            is_active: true,
            email: normalizedEmail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchedStaff.id);
        if (updateStaffError) throw updateStaffError;
      } else {
        const { error: insertStaffError } = await supabaseAdmin
          .from("staff_directory")
          .insert({
            phone,
            full_name: full_name.trim(),
            role,
            avatar_url: avatar_url || null,
            is_active: true,
            email: normalizedEmail,
          });
        if (insertStaffError) throw insertStaffError;
      }
    }

    // If no email, return early (phone-only registration)
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ success: true, mode: "phone_registered", phone }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already invited and pending (indexed query)
    const { data: existing } = await supabaseAdmin
      .from("staff_invitations")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("An invitation is already pending for this email");

    // Create user with admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });
    if (createError) throw createError;

    // Assign role
    await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUser.user.id);

    // Link staff directory (indexed lookups instead of full-table scan)
    if (phone) {
      const phoneKey = significantPhone(phone);
      const staffToLink = await findStaffByPhone(supabaseAdmin, phoneKey);
      if (staffToLink) {
        await supabaseAdmin
          .from("staff_directory")
          .update({ user_id: newUser.user.id, email: normalizedEmail })
          .eq("id", staffToLink.id);
      }
    } else {
      const staffByEmail = await findStaffByEmail(supabaseAdmin, normalizedEmail);

      if (staffByEmail) {
        await supabaseAdmin
          .from("staff_directory")
          .update({
            user_id: newUser.user.id,
            full_name: full_name.trim(),
            role,
            avatar_url: avatar_url || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", staffByEmail.id);
      } else {
        const { error: insertEmailStaffError } = await supabaseAdmin
          .from("staff_directory")
          .insert({
            user_id: newUser.user.id,
            email: normalizedEmail,
            phone: null,
            full_name: full_name.trim(),
            role,
            avatar_url: avatar_url || null,
            is_active: true,
          });
        if (insertEmailStaffError) throw insertEmailStaffError;
      }
    }

    // Record the invitation
    await supabaseAdmin.from("staff_invitations").insert({
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      full_name: full_name.trim(),
      role,
      invited_by: caller.id,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });

    // Send password reset
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
    });

    const responseData = { success: true, user_id: newUser.user.id, mode: "staff_email_provisioned" };
    
    // Cache response for idempotency
    setIdempotencyResponse(idempotencyKey!, responseData);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("invite-staff error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
