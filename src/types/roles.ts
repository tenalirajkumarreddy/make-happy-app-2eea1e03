// Canonical AppRole type derived from Supabase database enum
// This replaces all duplicate role definitions across the codebase
export type AppRole =
  | 'super_admin'
  | 'manager'
  | 'agent'
  | 'marketer'
  | 'operator'
  | 'customer';

/**
 * Normalizes a raw role string to a valid AppRole
 * Maps legacy roles and provides fallback to 'customer'
 */
export function normalizeRole(rawRole: string | null | undefined): AppRole {
  if (!rawRole) return "customer";
  if (rawRole === "admin") return "super_admin";
  if (
    rawRole === "super_admin" ||
    rawRole === "manager" ||
    rawRole === "agent" ||
    rawRole === "marketer" ||
    rawRole === "operator" ||
    rawRole === "customer"
  ) {
    return rawRole as AppRole;
  }
  return "customer";
}