/**
 * Feature Configuration System
 * 
 * Provides fine-grained control over feature availability based on:
 * - User roles
 * - Explicit permissions
 * - Feature flags (for gradual rollouts)
 * - Tenant/organization settings
 */

import { PermissionKey } from "@/components/access/UserPermissionsPanel";
import type { AppRole } from "@/types/roles";

// ============================================================================
// Feature Definitions
// ============================================================================

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  // Who can access this feature by default
  defaultRoles: AppRole[];
  // Required permissions (any of these)
  requiredPermissions?: PermissionKey[];
  // Is this feature enabled globally?
  enabled: boolean;
  // Can be disabled per-tenant?
  tenantConfigurable: boolean;
  // UI category for organization
  category: "inventory" | "sales" | "reporting" | "admin" | "customer";
  // Dependencies on other features
  dependsOn?: string[];
}

// ============================================================================
// Inventory Feature Definitions
// ============================================================================

export const INVENTORY_FEATURES: Record<string, FeatureConfig> = {
  // Core features
  "inventory.view": {
    id: "inventory.view",
    name: "View Inventory",
    description: "Basic inventory viewing access",
    defaultRoles: ["super_admin", "manager", "agent", "marketer", "operator"],
    enabled: true,
    tenantConfigurable: false,
    category: "inventory",
  },
  
  "inventory.warehouse.view": {
    id: "inventory.warehouse.view",
    name: "View Warehouse Stock",
    description: "View stock levels in warehouse",
    defaultRoles: ["super_admin", "manager", "operator"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.staff-holdings.view": {
    id: "inventory.staff-holdings.view",
    name: "View Staff Holdings",
    description: "View stock held by field staff",
    defaultRoles: ["super_admin", "manager"],
    requiredPermissions: ["view_raw_materials"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.raw-materials.view": {
    id: "inventory.raw-materials.view",
    name: "View Raw Materials",
    description: "View raw materials inventory",
    defaultRoles: ["super_admin", "manager"],
    requiredPermissions: ["view_raw_materials"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.history.view": {
    id: "inventory.history.view",
    name: "View Stock History",
    description: "View stock movement history and returns",
    defaultRoles: ["super_admin", "manager", "agent", "marketer", "operator"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  // Action features
  "inventory.transfer": {
    id: "inventory.transfer",
    name: "Transfer Stock",
    description: "Transfer stock between locations/users",
    defaultRoles: ["super_admin", "manager", "agent", "marketer", "operator"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.transfer.warehouse-to-warehouse": {
    id: "inventory.transfer.warehouse-to-warehouse",
    name: "Warehouse-to-Warehouse Transfer",
    description: "Transfer between warehouses",
    defaultRoles: ["super_admin"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.transfer"],
  },
  
  "inventory.transfer.warehouse-to-staff": {
    id: "inventory.transfer.warehouse-to-staff",
    name: "Assign to Staff",
    description: "Transfer stock from warehouse to staff",
    defaultRoles: ["super_admin", "manager", "operator"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.transfer"],
  },
  
  "inventory.transfer.staff-to-warehouse": {
    id: "inventory.transfer.staff-to-warehouse",
    name: "Return to Warehouse",
    description: "Return stock from staff to warehouse",
    defaultRoles: ["super_admin", "manager", "agent", "marketer"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.transfer"],
  },
  
  "inventory.transfer.staff-to-staff": {
    id: "inventory.transfer.staff-to-staff",
    name: "Staff-to-Staff Transfer",
    description: "Transfer between staff members",
    defaultRoles: ["super_admin", "manager", "operator", "agent", "marketer"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.transfer"],
  },
  
  "inventory.adjust": {
    id: "inventory.adjust",
    name: "Adjust Stock",
    description: "Direct stock quantity adjustments",
    defaultRoles: ["super_admin", "manager"],
    requiredPermissions: ["manage_raw_materials"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.adjust.raw-materials": {
    id: "inventory.adjust.raw-materials",
    name: "Adjust Raw Materials",
    description: "Adjust raw material quantities",
    defaultRoles: ["super_admin", "manager"],
    requiredPermissions: ["manage_raw_materials"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.adjust", "inventory.raw-materials.view"],
  },
  
  "inventory.returns.review": {
    id: "inventory.returns.review",
    name: "Review Returns",
    description: "Review and approve staff returns",
    defaultRoles: ["super_admin", "manager"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.history.view"],
  },
  
  "inventory.warehouse.switch": {
    id: "inventory.warehouse.switch",
    name: "Switch Warehouse",
    description: "View inventory across different warehouses",
    defaultRoles: ["super_admin", "manager"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
  
  "inventory.export": {
    id: "inventory.export",
    name: "Export Inventory Data",
    description: "Export inventory reports and data",
    defaultRoles: ["super_admin", "manager"],
    enabled: true,
    tenantConfigurable: true,
    category: "inventory",
    dependsOn: ["inventory.view"],
  },
};

// ============================================================================
// Feature Checking Utilities
// ============================================================================

export interface FeatureCheckOptions {
  role: AppRole;
  permissions?: PermissionKey[];
  tenantFeatures?: Record<string, boolean>;
  checkDependencies?: boolean;
}

/**
 * Check if a feature is enabled for a user
 */
export function isFeatureEnabled(
  featureId: string,
  options: FeatureCheckOptions
): { enabled: boolean; reason?: string } {
  const { role, permissions = [], tenantFeatures = {}, checkDependencies = true } = options;
  
  const feature = INVENTORY_FEATURES[featureId];
  if (!feature) {
    return { enabled: false, reason: "Feature not found" };
  }
  
  // Check if globally disabled
  if (!feature.enabled) {
    return { enabled: false, reason: "Feature disabled globally" };
  }
  
  // Check tenant configuration
  if (feature.tenantConfigurable && tenantFeatures[featureId] === false) {
    return { enabled: false, reason: "Feature disabled for this organization" };
  }
  
  // Check role access
  if (!feature.defaultRoles.includes(role)) {
    return { enabled: false, reason: "Role not authorized" };
  }
  
  // Check required permissions
  if (feature.requiredPermissions) {
    const hasRequiredPermission = feature.requiredPermissions.some(
      p => permissions.includes(p)
    );
    if (!hasRequiredPermission) {
      return { enabled: false, reason: "Missing required permission" };
    }
  }
  
  // Check dependencies
  if (checkDependencies && feature.dependsOn) {
    for (const depId of feature.dependsOn) {
      const depCheck = isFeatureEnabled(depId, { ...options, checkDependencies: false });
      if (!depCheck.enabled) {
        return { enabled: false, reason: `Dependency ${depId} not available` };
      }
    }
  }
  
  return { enabled: true };
}

/**
 * Get all enabled features for a user
 */
export function getEnabledFeatures(options: FeatureCheckOptions): string[] {
  return Object.keys(INVENTORY_FEATURES).filter(id => 
    isFeatureEnabled(id, options).enabled
  );
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(category: FeatureConfig["category"]): FeatureConfig[] {
  return Object.values(INVENTORY_FEATURES).filter(f => f.category === category);
}

/**
 * Get transfer types allowed for a role
 */
export function getAllowedTransferTypes(role: AppRole): string[] {
  const types: string[] = [];
  
  if (isFeatureEnabled("inventory.transfer.warehouse-to-warehouse", { role }).enabled) {
    types.push("warehouse_to_warehouse");
  }
  if (isFeatureEnabled("inventory.transfer.warehouse-to-staff", { role }).enabled) {
    types.push("warehouse_to_staff");
  }
  if (isFeatureEnabled("inventory.transfer.staff-to-warehouse", { role }).enabled) {
    types.push("staff_to_warehouse");
  }
  if (isFeatureEnabled("inventory.transfer.staff-to-staff", { role }).enabled) {
    types.push("staff_to_staff");
  }
  
  return types;
}

/**
 * Get visible inventory tabs for a user
 */
export function getVisibleInventoryTabs(options: FeatureCheckOptions): string[] {
  const tabs: string[] = [];
  
  if (isFeatureEnabled("inventory.warehouse.view", options).enabled) {
    tabs.push("stock");
  }
  if (isFeatureEnabled("inventory.staff-holdings.view", options).enabled) {
    tabs.push("staff-holdings");
  }
  if (isFeatureEnabled("inventory.raw-materials.view", options).enabled) {
    tabs.push("raw-materials");
  }
  if (isFeatureEnabled("inventory.history.view", options).enabled) {
    tabs.push("history");
  }
  
  return tabs;
}

// ============================================================================
// React Hook
// ============================================================================

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { supabase } from "@/integrations/supabase/client";

export function useFeature(featureId: string) {
  const { role, profile } = useAuth();
  
  // Get user's permissions using the usePermission hook
  const userPermissions = useMemo(() => {
    // Collect all permissions that the user has enabled
    const permissions: PermissionKey[] = [];
    // We'll check each permission individually - this is not optimal but works for now
    // In a real implementation, we'd fetch all permissions at once
    return permissions;
  }, [profile]);
  
  const check = useMemo(() => {
    if (!role) return { enabled: false, loading: true };
    
    const result = isFeatureEnabled(featureId, {
      role: role as AppRole,
      permissions: userPermissions,
    });
    
    return { ...result, loading: false };
  }, [featureId, role, userPermissions]);
  
  return check;
}

export function useInventoryFeatures() {
  const { role, profile } = useAuth();
  
  // Get user's permissions using the usePermission hook for each permission
  // This is not optimal but maintains compatibility - in production we'd want to batch these
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!profile) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    
    // Fetch all permissions for the user
    const fetchPermissions = async () => {
      try {
        const { data } = await supabase
          .from("user_permissions")
          .select("permission, enabled")
          .eq("user_id", profile.user_id);
        
        const enabledPermissions = (data || [])
          .filter((p: any) => p.enabled)
          .map((p: any) => p.permission);
          
        setPermissions(enabledPermissions as PermissionKey[]);
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setPermissions([]); // Fallback to empty array on error
      } finally {
        setLoading(false);
      }
    };
    
    fetchPermissions();
  }, [profile]);
  
  if (loading) {
    return { tabs: [], transfers: [], loading: true };
  }
  
  const options = { role: role as AppRole, permissions };
  
  return {
    tabs: getVisibleInventoryTabs(options),
    transfers: getAllowedTransferTypes(role as AppRole),
    enabled: getEnabledFeatures(options),
    loading: false,
  };
}

export default INVENTORY_FEATURES;
