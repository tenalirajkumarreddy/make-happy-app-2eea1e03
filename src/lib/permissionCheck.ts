/**
 * Server-side permission validation utilities
 * These functions check permissions against the database directly,
 * suitable for use in offline queue sync and other non-React contexts.
 */

import { type AppRole } from "@/types/roles";
import { supabase } from "@/integrations/supabase/client";
import {
  PermissionKey,
  hasRoleDefaultPermission as hasCanonicalDefault,
} from "@/lib/permissions";

/**
 * Check if a user has a specific permission
 * This queries the database directly and can be used outside React hooks
 */
export async function checkUserPermission(
  userId: string,
  permission: PermissionKey
): Promise<boolean> {
  try {
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) {
      console.error("Error fetching user role:", roleError);
      return false;
    }

    const role = roleData?.role as AppRole | undefined;

    if (role === "super_admin") {
      return true;
    }

    const { data: permData, error: permError } = await supabase
      .from("user_permissions")
      .select("enabled")
      .eq("user_id", userId)
      .eq("permission", permission)
      .maybeSingle();

    if (permError) {
      console.error("Error fetching user permission:", permError);
      return false;
    }

    if (permData) {
      return permData.enabled;
    }

    return hasCanonicalDefault(role ?? "customer", permission);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Get user's current role from database
 */
export async function getUserRole(userId: string): Promise<AppRole | null> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.role as AppRole;
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
 * Validate if an action can be performed by the user
 * Uses canonical PermissionKey values from ROLE_DEFAULTS
 */
export async function validateActionPermission(
  userId: string,
  actionType: "sale" | "transaction" | "visit" | "customer" | "store" | "file_upload" | "transaction_edit" | "payment_return"
): Promise<{ allowed: boolean; reason?: string }> {
  const active = await isUserActive(userId);
  if (!active) {
    return { allowed: false, reason: "User account is inactive or banned" };
  }

  const permissionMap: Record<string, PermissionKey> = {
    sale: "record_sale",
    transaction: "record_sale",
    visit: "record_sale",
    customer: "create_customers",
    store: "create_stores",
    transaction_edit: "modify_transactions",
    payment_return: "modify_transactions",
  };

  const perm = permissionMap[actionType];
  const hasPermission = perm ? await checkUserPermission(userId, perm) : actionType === "file_upload";

  if (!hasPermission) {
    const role = await getUserRole(userId);
    return {
      allowed: false,
      reason: `User does not have permission to perform ${actionType} action (role: ${role || "unknown"})`,
    };
  }

  return { allowed: true };
}
