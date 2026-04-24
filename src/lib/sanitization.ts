import DOMPurify from "dompurify";

/**
 * Sanitize a string to prevent XSS attacks
 * Removes HTML tags and dangerous content
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input) return "";
  // First sanitize HTML
  let clean = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  // Remove any remaining script tags and event handlers
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  clean = clean.replace(/on\w+\s*=/gi, "");
  return clean.trim();
}

/**
 * Sanitize an object recursively
 * Useful for sanitizing entire CSV rows or form data
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

/**
 * Validate and sanitize phone number
 * Returns sanitized phone or null if invalid
 */
export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const sanitized = phone.replace(/[^\d+\-\s()]/g, "").trim();
  return sanitized.length >= 6 ? sanitized : null;
}

/**
 * Validate and sanitize email
 * Returns sanitized email or null if invalid
 */
export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized) ? sanitized : null;
}
