/**
 * Server-side permission validation utilities
 * These functions check permissions against the database directly,
 * suitable for use in offline queue sync and other non-React contexts.
 */

import { supabase } from "@/integrations/supabase/client";
import { PermissionKey } from "@/components/access/UserPermissionsPanel";

export type UserRole = "super_admin" | "manager" | "agent" | "marketer" | "pos" | "customer";

/**
 * Check if a user has a specific permission
 * This queries the database directly and can be used outside React hooks
 */
export async function checkUserPermission(
  userId: string,
  permission: PermissionKey
): Promise<boolean> {
  try {
    // First get user's role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) {
      console.error("Error fetching user role:", roleError);
      return false;
    }

    const role = roleData?.role as UserRole | undefined;

    // Super admin always has all permissions
    if (role === "super_admin") {
      return true;
    }

    // Check for DB override in user_permissions
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

    // If there's a DB override, use it
    if (permData) {
      return permData.enabled;
    }

    // Fall back to role defaults
    return hasRoleDefaultPermission(role, permission);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if a user has permission to record sales
 */
export async function canRecordSale(userId: string): Promise<boolean> {
  const salePermissions: PermissionKey[] = [
    "record_sale",
    "view_sales",
    "view_stores",
  ];

  // Check any of the sale-related permissions
  for (const perm of salePermissions) {
    if (await checkUserPermission(userId, perm)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a user has permission to record transactions (payments)
 */
export async function canRecordTransaction(userId: string): Promise<boolean> {
  return checkUserPermission(userId, "record_transaction");
}

/**
 * Check if a user has permission to record store visits
 */
export async function canRecordVisit(userId: string): Promise<boolean> {
  return checkUserPermission(userId, "record_visit");
}

/**
 * Check if a user has permission to create customers
 */
export async function canCreateCustomer(userId: string): Promise<boolean> {
  return checkUserPermission(userId, "create_customer");
}

/**
 * Check if a user has permission to create stores
 */
export async function canCreateStore(userId: string): Promise<boolean> {
  return checkUserPermission(userId, "create_store");
}

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
    // Check user_roles table - if no record exists, user may be banned
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
 * Combines permission check with user status check
 */
export async function validateActionPermission(
  userId: string,
  actionType: "sale" | "transaction" | "visit" | "customer" | "store" | "file_upload"
): Promise<{ allowed: boolean; reason?: string }> {
  // First check if user is active
  const active = await isUserActive(userId);
  if (!active) {
    return { allowed: false, reason: "User account is inactive or banned" };
  }

  // Check specific permission based on action type
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
    case "store":
      hasPermission = await canCreateStore(userId);
      break;
    case "file_upload":
      // File uploads are generally allowed if user can perform other actions
      hasPermission = true;
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

// Role default permissions (mirrors ROLE_DEFAULTS from UserPermissionsPanel)
const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: [
    "view_dashboard",
    "view_sales",
    "view_stores",
    "view_inventory",
    "view_collections",
    "view_reports",
    "manage_users",
    "manage_roles",
    "record_sale",
    "record_transaction",
    "record_visit",
    "create_customer",
    "create_store",
    "edit_store",
    "delete_store",
    "view_all_warehouses",
    "switch_warehouse",
    "view_routes",
    "assign_routes",
    "manage_inventory",
    "approve_expenses",
    "view_expenses",
    "export_data",
    "import_data",
    "view_settings",
    "manage_settings",
  ],
  manager: [
    "view_dashboard",
    "view_sales",
    "view_stores",
    "view_inventory",
    "view_collections",
    "view_reports",
    "record_sale",
    "record_transaction",
    "record_visit",
    "create_customer",
    "create_store",
    "edit_store",
    "view_routes",
    "assign_routes",
    "view_expenses",
    "approve_expenses",
    "export_data",
  ],
  agent: [
    "view_dashboard",
    "view_sales",
    "view_stores",
    "record_sale",
    "record_transaction",
    "record_visit",
    "create_customer",
    "view_routes",
    "view_collections",
  ],
  marketer: [
    "view_dashboard",
    "view_stores",
    "create_customer",
    "record_visit",
    "view_routes",
  ],
  pos: [
    "view_dashboard",
    "view_sales",
    "record_sale",
    "record_transaction",
    "view_stores",
  ],
  customer: [
    "view_dashboard",
    "view_orders",
    "place_order",
    "view_store",
  ],
};

function hasRoleDefaultPermission(
  role: UserRole | undefined,
  permission: PermissionKey
): boolean {
  if (!role) return false;
  return ROLE_DEFAULT_PERMISSIONS[role]?.includes(permission) ?? false;
}
