import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const PERMISSION_KEYS = [
  // General permissions
  "price_override",
  "record_behalf",
  "create_customers",
  "create_stores",
  "edit_balance",
  "opening_balance",
  "finalizer",
  "see_handover_balance",
  "submit_expenses",
  // Vendor & Purchase permissions
  "view_vendors",
  "manage_vendors",
  "view_purchases",
  "manage_purchases",
  "view_vendor_payments",
  "manage_vendor_payments",
  "view_raw_materials",
  "manage_raw_materials",
  // Attendance permissions
  "view_attendance",
  "manage_attendance",
  // Order permissions
  "view_orders",
  "create_orders",
  "modify_orders",
  "modify_order_item_prices",
  "transfer_orders",
  "delete_orders",
  "fulfill_orders",
  "cancel_orders",
  // Sale Return permissions
  "create_sale_returns",
  // Invoice permissions
  "view_invoices",
  "create_invoices",
  "edit_invoices",
  "delete_invoices",
  "download_invoices",
  // Agent-specific order permissions
  "view_assigned_orders",
  "accept_order_transfers",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Default permissions per role — these are the "inherent" ones that can't be toggled off */
const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  super_admin: [
    "price_override", "record_behalf", "create_customers", "create_stores",
    "edit_balance", "opening_balance", "view_vendors", "manage_vendors",
    "view_purchases", "manage_purchases", "view_vendor_payments", "manage_vendor_payments",
    "view_raw_materials", "manage_raw_materials", "view_attendance", "manage_attendance",
    // Orders - full access
    "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
    "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
    // Sale Returns - full access
    "create_sale_returns",
    // Invoices - full access
    "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
    // Agent
    "view_assigned_orders", "accept_order_transfers",
  ],
  manager: [
    "price_override", "record_behalf", "create_customers", "create_stores",
    "edit_balance", "opening_balance", "view_vendors", "manage_vendors",
    "view_purchases", "manage_purchases", "view_vendor_payments", "manage_vendor_payments",
    "view_raw_materials", "manage_raw_materials", "view_attendance", "manage_attendance",
    // Orders - full access
    "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
    "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
    // Sale Returns - full access
    "create_sale_returns",
    // Invoices - full access
    "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
    // Agent
    "view_assigned_orders", "accept_order_transfers",
  ],
  marketer: [
    "create_customers", "create_stores",
    // Orders - can view all, create for assigned stores, but limited modify
    "view_orders", "create_orders", "modify_orders", "transfer_orders",
    // Invoices - view only (can't create/edit)
    "view_invoices", "download_invoices",
  ],
  agent: [
    "create_customers", "create_stores",
    // Orders - view assigned only, can fulfill/cancel assigned orders
    "view_assigned_orders", "accept_order_transfers",
    "fulfill_orders", "cancel_orders",  // ← Added: agents can fulfill/cancel their assigned orders
    // Invoices - view only
    "view_invoices", "download_invoices",
  ],
  operator: [
    // Operator defaults: POS sales, inventory, attendance
    // NO orders by default (can be granted via permissions)
    // NO transactions for stores
    "view_invoices", "download_invoices",
    "view_attendance", "manage_attendance",
  ],
  customer: [
    // Customers can only view their own
    "view_orders", "view_invoices", "download_invoices",
  ],
};

// Permission groupings for display
export const PERMISSION_GROUPS = {
  "Orders": [
    "view_orders",
    "create_orders",
    "modify_orders",
    "modify_order_item_prices",
    "transfer_orders",
    "delete_orders",
    "fulfill_orders",
    "cancel_orders",
    "create_sale_returns",
    "view_assigned_orders",
    "accept_order_transfers",
  ],
  "Invoices": [
    "view_invoices",
    "create_invoices",
    "edit_invoices",
    "delete_invoices",
    "download_invoices",
  ],
  "Sales & Pricing": [
    "price_override",
    "record_behalf",
    "edit_balance",
    "opening_balance",
    "finalizer",
    "see_handover_balance",
  ],
  "Customers & Stores": [
    "create_customers",
    "create_stores",
  ],
  "Vendors & Purchases": [
    "view_vendors",
    "manage_vendors",
    "view_purchases",
    "manage_purchases",
    "view_vendor_payments",
    "manage_vendor_payments",
    "view_raw_materials",
    "manage_raw_materials",
  ],
  "Attendance": [
    "view_attendance",
    "manage_attendance",
  ],
  "Other": [
    "submit_expenses",
  ],
};

// Human-readable labels for permissions
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_orders: "View All Orders",
  create_orders: "Create Orders",
  modify_orders: "Modify Orders",
  modify_order_item_prices: "Modify Order Item Prices",
  transfer_orders: "Transfer Orders to Other Staff",
  delete_orders: "Delete Orders",
  fulfill_orders: "Fulfill Orders",
  cancel_orders: "Cancel Orders",
  create_sale_returns: "Create Sale Returns",
  view_assigned_orders: "View Assigned Orders Only",
  accept_order_transfers: "Accept Order Transfers",
  view_invoices: "View Invoices",
  create_invoices: "Create Invoices",
  edit_invoices: "Edit Invoices",
  delete_invoices: "Delete Invoices",
  download_invoices: "Download/Print Invoices",
  price_override: "Override Product Prices",
  record_behalf: "Record Sales on Behalf",
  create_customers: "Create Customers",
  create_stores: "Create Stores",
  edit_balance: "Edit Customer Balances",
  opening_balance: "Set Opening Balances",
  finalizer: "Finalize Reports",
  see_handover_balance: "See Handover Balance",
  submit_expenses: "Submit Expenses",
  view_vendors: "View Vendors",
  manage_vendors: "Manage Vendors",
  view_purchases: "View Purchases",
  manage_purchases: "Manage Purchases",
  view_vendor_payments: "View Vendor Payments",
  manage_vendor_payments: "Manage Vendor Payments",
  view_raw_materials: "View Raw Materials",
  manage_raw_materials: "Manage Raw Materials",
  view_attendance: "View Attendance",
  manage_attendance: "Manage Attendance",
};

interface InlinePermissionCheckboxProps {
  userId: string;
  userRole: string;
  permissionKey: PermissionKey;
  permissions: any[];
  onToggle: (userId: string, key: PermissionKey, currentEnabled: boolean) => void;
  saving: string | null;
}

export function InlinePermissionCheckbox({
  userId, userRole, permissionKey, permissions, onToggle, saving,
}: InlinePermissionCheckboxProps) {
  const isDefault = ROLE_DEFAULTS[userRole]?.includes(permissionKey) ?? false;
  const dbPerm = permissions?.find((p: any) => p.permission === permissionKey);
  const isEnabled = dbPerm ? dbPerm.enabled : isDefault;
  const isSaving = saving === `${userId}-${permissionKey}`;
  const isLocked = userRole === "super_admin"; // super admin always has all

  return (
    <div className="flex items-center justify-center">
      {isSaving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Checkbox
          checked={isEnabled}
          onCheckedChange={() => onToggle(userId, permissionKey, isEnabled)}
          disabled={isLocked}
          className={isEnabled ? "border-primary data-[state=checked]:bg-primary" : ""}
        />
      )}
    </div>
  );
}

export function useUserPermissions() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: allPermissions, isLoading } = useQuery({
    queryKey: ["all-user-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_permissions").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const getPermissionsForUser = (userId: string) => {
    return allPermissions?.filter((p) => p.user_id === userId) || [];
  };

  const handleToggle = async (userId: string, key: PermissionKey, currentEnabled: boolean) => {
    const savingKey = `${userId}-${key}`;
    setSaving(savingKey);
    const newVal = !currentEnabled;

    const { error } = await supabase.from("user_permissions").upsert(
      { user_id: userId, permission: key, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: "user_id,permission" }
    );

    setSaving(null);
    if (error) {
      toast.error(error.message);
    } else {
      qc.invalidateQueries({ queryKey: ["all-user-permissions"] });
    }
  };

  return { allPermissions, isLoading, saving, getPermissionsForUser, handleToggle };
}

export { PERMISSION_KEYS, ROLE_DEFAULTS };
