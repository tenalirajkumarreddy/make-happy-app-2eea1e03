/**
 * Mobile Permission Validation
 * Server-side permission checking for offline operations
 */

import { supabase } from "@/integrations/supabase/client";

export type UserRole = "super_admin" | "manager" | "agent" | "marketer" | "pos" | "customer";

/**
 * Get user's current role from database
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error || !data) {
      return null;
    }
    
    return data.role as UserRole;
  } catch (error) {
    console.error("Error fetching user role:", error);
    return null;
  }
}

/**
 * Check if user is still active (not banned/deleted)
 */
export async function isUserActive(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) {
      console.error("Error checking user status:", error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error("Error checking user status:", error);
    return false;
  }
}

/**
 * Check if user has permission to record sales
 */
export async function canRecordSale(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  
  // Roles that can record sales
  const allowedRoles: UserRole[] = ["super_admin", "manager", "agent", "pos"];
  return allowedRoles.includes(role);
}

/**
 * Check if user has permission to record transactions (payments)
 */
export async function canRecordTransaction(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  
  const allowedRoles: UserRole[] = ["super_admin", "manager", "agent", "pos"];
  return allowedRoles.includes(role);
}

/**
 * Check if user has permission to record store visits
 */
export async function canRecordVisit(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  
  const allowedRoles: UserRole[] = ["super_admin", "manager", "agent", "marketer"];
  return allowedRoles.includes(role);
}

/**
 * Check if user has permission to create customers
 */
export async function canCreateCustomer(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  
  const allowedRoles: UserRole[] = ["super_admin", "manager", "agent", "marketer"];
  return allowedRoles.includes(role);
}

/**
 * Validate if an action can be performed by the user
 */
export async function validateActionPermission(
  userId: string,
  actionType: "sale" | "transaction" | "visit" | "customer"
): Promise<{ allowed: boolean; reason?: string }> {
  // First check if user is active
  const active = await isUserActive(userId);
  if (!active) {
    return { allowed: false, reason: "User account is inactive or banned" };
  }
  
  let hasPermission = false;
  
  switch (actionType) {
    case "sale":
      hasPermission = await canRecordSale(userId);
      break;
    case "transaction":
      hasPermission = await canRecordTransaction(userId);
      break;
    case "visit":
      hasPermission = await canRecordVisit(userId);
      break;
    case "customer":
      hasPermission = await canCreateCustomer(userId);
      break;
    default:
      hasPermission = false;
  }
  
  if (!hasPermission) {
    const role = await getUserRole(userId);
    return {
      allowed: false,
      reason: `User does not have permission to perform ${actionType} action (role: ${role || "unknown"})`,
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user is admin or manager (elevated permissions)
 */
export async function isAdminOrManager(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === "super_admin" || role === "manager";
}

/**
 * Check if user can bypass credit limits
 */
export async function canBypassCreditLimit(userId: string): Promise<boolean> {
  return isAdminOrManager(userId);
}

export default {
  getUserRole,
  isUserActive,
  canRecordSale,
  canRecordTransaction,
  canRecordVisit,
  canCreateCustomer,
  validateActionPermission,
  isAdminOrManager,
  canBypassCreditLimit,
};
