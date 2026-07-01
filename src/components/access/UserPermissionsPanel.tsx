import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ROLE_DEFAULTS, PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from "@/lib/permissions";

export type PermissionKey =
  | "price_override" | "record_behalf" | "create_customers" | "create_stores"
  | "edit_balance" | "opening_balance" | "finalizer" | "see_handover_balance"
  | "submit_expenses" | "manage_expense_access" | "approve_expenses"
  | "modify_handovers" | "cancel_any_handover" | "adjust_holding_balance"
  | "record_sale" | "backdate"
  | "view_vendors" | "manage_vendors" | "view_purchases" | "manage_purchases"
  | "view_vendor_payments" | "manage_vendor_payments"
  | "view_raw_materials" | "manage_raw_materials"
  | "view_attendance" | "manage_attendance"
  | "view_orders" | "create_orders" | "modify_orders" | "modify_order_item_prices"
  | "transfer_orders" | "delete_orders" | "fulfill_orders" | "cancel_orders"
  | "create_sale_returns" | "view_assigned_orders" | "accept_order_transfers"
  | "view_invoices" | "create_invoices" | "edit_invoices" | "delete_invoices" | "download_invoices"
  | "cancel_sales" | "modify_transactions"
  | "set_store_pricing";

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
  const role = userRole as keyof typeof ROLE_DEFAULTS;
  const isDefault = ROLE_DEFAULTS[role]?.includes(permissionKey) ?? false;
  const dbPerm = permissions?.find((p: any) => p.permission === permissionKey);
  const isEnabled = dbPerm ? dbPerm.enabled : isDefault;
  const isSaving = saving === `${userId}-${permissionKey}`;
  const isLocked = userRole === "super_admin";

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