import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const PERMISSION_DEFS = [
  { key: "sales_behalf", label: "Record Sales on Behalf", description: "Record sales on behalf of other users", roles: ["manager"] },
  { key: "payments_behalf", label: "Record Payments on Behalf", description: "Record payments on behalf of other users", roles: ["manager"] },
  { key: "orders_behalf", label: "Create Orders on Behalf", description: "Create orders on behalf of other users", roles: ["manager"] },
  { key: "opening_balance", label: "Set Opening Balance", description: "Set opening balance on new stores", roles: ["manager", "agent"] },
  { key: "edit_balance", label: "Edit Store Balance", description: "Manually adjust store balances (logged as correction)", roles: ["manager"] },
  { key: "price_override", label: "Override Store Pricing", description: "Override default store type pricing for individual stores", roles: ["manager", "agent"] },
] as const;

interface UserPermissionsPanelProps {
  userId: string;
  userName: string;
  userRole: string;
}

export function UserPermissionsPanel({ userId, userName, userRole }: UserPermissionsPanelProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return data || [];
    },
  });

  const applicablePerms = PERMISSION_DEFS.filter((p) => p.roles.includes(userRole as any));

  const isEnabled = (key: string) => {
    return permissions?.find((p) => p.permission === key)?.enabled ?? false;
  };

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setSaving(key);
    const newVal = !currentEnabled;

    // Upsert the permission
    const { error } = await supabase.from("user_permissions").upsert(
      { user_id: userId, permission: key, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: "user_id,permission" }
    );

    setSaving(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Permission ${newVal ? "granted" : "revoked"}`);
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
    }
  };

  if (applicablePerms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No configurable permissions for this role.</p>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">
        Permissions for <span className="font-medium text-foreground">{userName}</span>
        <Badge variant="secondary" className="ml-2 text-[10px]">{userRole}</Badge>
      </p>
      {applicablePerms.map((perm) => {
        const enabled = isEnabled(perm.key);
        const isSaving = saving === perm.key;
        return (
          <div key={perm.key} className="flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/20">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{perm.label}</p>
              <p className="text-[11px] text-muted-foreground">{perm.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              <Switch checked={enabled} onCheckedChange={() => handleToggle(perm.key, enabled)} disabled={isSaving} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
