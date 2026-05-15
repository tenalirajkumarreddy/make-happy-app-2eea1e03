import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Canonical source — import everything from the single source of truth
export {
  type PermissionKey,
  type AppRole,
  ROLE_DEFAULTS,
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  hasRoleDefaultPermission,
} from "@/lib/permissions";

import type { PermissionKey } from "@/lib/permissions";
import { ROLE_DEFAULTS, PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from "@/lib/permissions";

/** @deprecated Use ALL_PERMISSION_KEYS from @/lib/permissions */
export const PERMISSION_KEYS = ALL_PERMISSION_KEYS;

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