import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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

// Optimistically track toggling to avoid full refetch flicker
function useAccessMatrix() {
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["routes-access-matrix"],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, store_type_id, store_types(id, name)")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: staffUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["staff-for-access-matrix"],
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
    queryKey: ["agent-routes-matrix"],
    queryFn: async () => {
      const { data } = await supabase.from("agent_routes").select("user_id, route_id, enabled");
      return data || [];
    },
  });

  const isEnabled = useCallback(
    (userId: string, routeId: string) =>
      (accessRecords || []).some((r) => r.user_id === userId && r.route_id === routeId && r.enabled),
    [accessRecords]
  );

  const handleToggle = async (userId: string, routeId: string) => {
    const key = `${userId}:${routeId}`;
    if (toggling.has(key)) return;
    setToggling((prev) => new Set(prev).add(key));
    const current = isEnabled(userId, routeId);
    const { error } = await supabase
      .from("agent_routes")
      .upsert(
        { user_id: userId, route_id: routeId, enabled: !current },
        { onConflict: "user_id,route_id" }
      );
    if (error) toast.error(error.message);
    else await refetchAccess();
    setToggling((prev) => { const s = new Set(prev); s.delete(key); return s; });
  };

  // Group routes by store type, preserving insertion order
  const storeTypeGroups: { id: string; name: string; routes: typeof routes }[] = [];
  const seenTypes = new Map<string, number>();
  (routes || []).forEach((route) => {
    const typeId = route.store_type_id;
    const typeName = (route.store_types as any)?.name || "Unknown";
    if (!seenTypes.has(typeId)) {
      seenTypes.set(typeId, storeTypeGroups.length);
      storeTypeGroups.push({ id: typeId, name: typeName, routes: [] });
    }
    storeTypeGroups[seenTypes.get(typeId)!].routes.push(route);
  });

  return { routes, staffUsers, isEnabled, handleToggle, toggling, storeTypeGroups, isLoading: routesLoading || usersLoading };
}

export function StoreTypeAccessMatrix() {
  const { staffUsers, isEnabled, handleToggle, toggling, storeTypeGroups, isLoading } = useAccessMatrix();

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

  if (storeTypeGroups.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
        No active routes found. Create routes first before configuring access.
      </div>
    );
  }

  const totalRouteCount = storeTypeGroups.reduce((s, g) => s + g.routes.length, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Check a box to grant a staff member access to that route. They will only see and record sales/transactions for stores in their enabled routes.
      </p>

      <div className="text-xs text-muted-foreground flex items-center gap-4 pb-1">
        <span>{staffUsers.length} staff members</span>
        <span>·</span>
        <span>{storeTypeGroups.length} store types</span>
        <span>·</span>
        <span>{totalRouteCount} routes</span>
      </div>

      <ScrollArea className="rounded-xl border bg-card w-full">
        <div className="min-w-max">
          <table className="border-collapse text-sm w-full">
            <thead>
              {/* Row 1 — Store type group headers */}
              <tr className="border-b bg-muted/40">
                <th
                  className="sticky left-0 z-20 bg-muted/40 px-5 py-3 text-left text-xs font-semibold text-muted-foreground min-w-[200px] border-r"
                  rowSpan={2}
                >
                  Staff Member
                </th>
                {storeTypeGroups.map((st, gi) => (
                  <th
                    key={st.id}
                    colSpan={st.routes.length}
                    className={`px-3 py-2.5 text-center text-xs font-semibold ${gi < storeTypeGroups.length - 1 ? "border-r" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 font-semibold">
                      {st.name}
                    </span>
                  </th>
                ))}
              </tr>

              {/* Row 2 — Route sub-headers */}
              <tr className="border-b bg-muted/20">
                {storeTypeGroups.map((st, gi) =>
                  st.routes.map((route, ri) => (
                    <th
                      key={route.id}
                      className={`px-3 py-2 text-center text-[11px] font-medium text-muted-foreground min-w-[120px] whitespace-nowrap ${
                        ri === st.routes.length - 1 && gi < storeTypeGroups.length - 1
                          ? "border-r"
                          : ri < st.routes.length - 1
                          ? "border-r border-border/30"
                          : ""
                      }`}
                    >
                      {route.name}
                    </th>
                  ))
                )}
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
                  {/* Sticky name cell */}
                  <td
                    className="sticky left-0 z-10 border-r px-5 py-3 min-w-[200px]"
                    style={{ background: idx % 2 === 1 ? "hsl(var(--muted) / 0.1)" : "hsl(var(--background))" }}
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

                  {/* One checkbox cell per route */}
                  {storeTypeGroups.map((st, gi) =>
                    st.routes.map((route, ri) => {
                      const key = `${staff.user_id}:${route.id}`;
                      const enabled = isEnabled(staff.user_id, route.id);
                      const busy = toggling.has(key);
                      return (
                        <td
                          key={route.id}
                          className={`px-3 py-3 text-center ${
                            ri === st.routes.length - 1 && gi < storeTypeGroups.length - 1
                              ? "border-r"
                              : ri < st.routes.length - 1
                              ? "border-r border-border/30"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            ) : (
                              <Checkbox
                                checked={enabled}
                                onCheckedChange={() => handleToggle(staff.user_id, route.id)}
                                className="h-4 w-4 cursor-pointer"
                                aria-label={`${staff.full_name} access to ${route.name}`}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })
                  )}
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
