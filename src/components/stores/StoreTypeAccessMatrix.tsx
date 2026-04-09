import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useCallback } from "react";

import type { Database } from "@/integrations/supabase/types";
type AppRole = Database["public"]["Enums"]["app_role"];
const STAFF_ROLES: AppRole[] = ["manager", "agent", "marketer", "pos"];

const ROLE_BADGE: Record<string, string> = {
  manager: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  agent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  marketer: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pos: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function useStoreTypeAccessMatrix() {
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const { data: storeTypes, isLoading: typesLoading } = useQuery({
    queryKey: ["store-types-for-access"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_types")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: staffUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["staff-for-store-type-matrix"],
    queryFn: async () => {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", STAFF_ROLES);
      const userIds = rolesData?.map((r) => r.user_id) || [];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, is_active")
        .in("user_id", userIds)
        .eq("is_active", true)
        .order("full_name");
      const roleMap = new Map(rolesData?.map((r) => [r.user_id, r.role]));
      return (profiles || []).map((p) => ({ ...p, role: roleMap.get(p.user_id) || "agent" }));
    },
  });

  const { data: accessRecords, refetch: refetchAccess } = useQuery({
    queryKey: ["agent-store-types-matrix"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("agent_store_types")
        .select("user_id, store_type_id, enabled");
      return (data || []) as Array<{ user_id: string; store_type_id: string; enabled: boolean }>;
    },
  });

  const isEnabled = useCallback(
    (userId: string, storeTypeId: string) =>
      (accessRecords || []).some(
        (r) => r.user_id === userId && r.store_type_id === storeTypeId && r.enabled
      ),
    [accessRecords]
  );

  // If a user has NO rows in agent_store_types → they're unrestricted (all types enabled)
  const hasAnyRows = useCallback(
    (userId: string) => (accessRecords || []).some((r) => r.user_id === userId),
    [accessRecords]
  );

  const isEffectivelyEnabled = useCallback(
    (userId: string, storeTypeId: string) => {
      if (!hasAnyRows(userId)) return true; // permissive default
      return isEnabled(userId, storeTypeId);
    },
    [hasAnyRows, isEnabled]
  );

  const handleToggle = async (userId: string, storeTypeId: string) => {
    const key = `${userId}:${storeTypeId}`;
    if (toggling.has(key)) return;
    setToggling((prev) => new Set(prev).add(key));

    const userHasRows = hasAnyRows(userId);
    const currentlyEnabled = isEffectivelyEnabled(userId, storeTypeId);

    if (!userHasRows) {
      // First toggle for this user: seed ALL store types as enabled, then disable the toggled one
      const allTypes = storeTypes || [];
      const rows = allTypes.map((st) => ({
        user_id: userId,
        store_type_id: st.id,
        enabled: st.id !== storeTypeId, // disable the one being toggled off
      }));
      const { error } = await (supabase as any)
        .from("agent_store_types")
        .upsert(rows, { onConflict: "user_id,store_type_id" });
      if (error) toast.error(error.message);
      else await refetchAccess();
    } else {
      // Normal toggle
      const { error } = await (supabase as any)
        .from("agent_store_types")
        .upsert(
          { user_id: userId, store_type_id: storeTypeId, enabled: !currentlyEnabled },
          { onConflict: "user_id,store_type_id" }
        );
      if (error) toast.error(error.message);
      else await refetchAccess();
    }

    setToggling((prev) => {
      const s = new Set(prev);
      s.delete(key);
      return s;
    });
  };

  return {
    storeTypes,
    staffUsers,
    isEffectivelyEnabled,
    handleToggle,
    toggling,
    isLoading: typesLoading || usersLoading,
  };
}

export function StoreTypeAccessMatrix() {
  const { storeTypes, staffUsers, isEffectivelyEnabled, handleToggle, toggling, isLoading } =
    useStoreTypeAccessMatrix();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!staffUsers || staffUsers.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
        No active staff users found. Invite staff from Access Control to configure access.
      </div>
    );
  }

  if (!storeTypes || storeTypes.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
        No active store types found. Create store types first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Check a box to grant a staff member access to that store type. Staff with no restrictions
        see all types by default — unchecking a box will create per-user restrictions.
      </p>

      <div className="text-xs text-muted-foreground flex items-center gap-4 pb-1">
        <span>{staffUsers.length} staff members</span>
        <span>·</span>
        <span>{storeTypes.length} store types</span>
      </div>

      <ScrollArea className="rounded-xl border bg-card w-full">
        <div className="min-w-max">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 bg-muted/40 px-5 py-3 text-left text-xs font-semibold text-muted-foreground min-w-[200px] border-r">
                  Staff Member
                </th>
                {storeTypes.map((st) => (
                  <th
                    key={st.id}
                    className="px-4 py-3 text-center text-xs font-semibold min-w-[130px]"
                  >
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 font-semibold">
                      {st.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {staffUsers.map((staff, idx) => (
                <tr
                  key={staff.user_id}
                  className={`border-b last:border-0 hover:bg-accent/30 transition-colors ${
                    idx % 2 === 1 ? "bg-muted/10" : ""
                  }`}
                >
                  <td
                    className="sticky left-0 z-10 border-r px-5 py-3 min-w-[200px]"
                    style={{
                      background:
                        idx % 2 === 1
                          ? "hsl(var(--muted) / 0.1)"
                          : "hsl(var(--background))",
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate max-w-[140px]">
                          {staff.full_name || "—"}
                        </p>
                        <span
                          className={`mt-0.5 inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded leading-none ${
                            ROLE_BADGE[staff.role] || ""
                          }`}
                        >
                          {staff.role}
                        </span>
                      </div>
                    </div>
                  </td>

                  {storeTypes.map((st) => {
                    const key = `${staff.user_id}:${st.id}`;
                    const enabled = isEffectivelyEnabled(staff.user_id, st.id);
                    const busy = toggling.has(key);
                    return (
                      <td key={st.id} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          ) : (
                            <Checkbox
                              checked={enabled}
                              onCheckedChange={() => handleToggle(staff.user_id, st.id)}
                              className="h-4 w-4 cursor-pointer"
                              aria-label={`${staff.full_name} access to ${st.name}`}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
