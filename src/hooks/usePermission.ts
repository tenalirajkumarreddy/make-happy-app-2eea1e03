import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { type PermissionKey, hasRoleDefaultPermission, ROLE_DEFAULTS } from "@/lib/permissions";

export function usePermission(key: PermissionKey): { allowed: boolean; loading: boolean } {
  const { user, role } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("user_permissions")
        .select("permission, enabled")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user?.id,
});

  if (!user || !role) return { allowed: false, loading: true };
  if (isLoading) return { allowed: false, loading: true };

  // Super admin always has everything
  if (role === "super_admin") return { allowed: true, loading: false };

  // Check DB override first
  const dbPerm = permissions?.find((p) => p.permission === key);
  if (dbPerm) return { allowed: dbPerm.enabled, loading: false };

  // Fall back to role defaults
  const isDefault = hasRoleDefaultPermission(role as any, key);
  return { allowed: isDefault, loading: false };
}
