import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const STAFF_ROLES = ["manager", "agent", "marketer", "pos"] as const;

const ROLE_BADGE: Record<string, string> = {
  manager: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  agent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  marketer: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pos: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

export function RouteAccessMatrix() {
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const { data: routes, isLoading: loadingRoutes } = useQuery({
    queryKey: ["route-access-routes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, name, store_type_id, store_types(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staffUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ["route-access-staff-users"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", [...STAFF_ROLES]);
      if (rolesError) throw rolesError;

      const userIds = rolesData?.map((row) => row.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, is_active")
        .in("user_id", userIds)
        .eq("is_active", true)
        .order("full_name");
      if (profilesError) throw profilesError;

      const roleMap = new Map((rolesData || []).map((row) => [row.user_id, row.role]));
      return (profiles || []).map((profile) => ({
        ...profile,
        role: roleMap.get(profile.user_id) || "agent",
      }));
    },
  });

  const { data: accessRows, isLoading: loadingAccess, refetch: refetchAccess } = useQuery({
    queryKey: ["route-access-rows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_routes")
        .select("user_id, route_id, enabled");
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = loadingRoutes || loadingUsers || loadingAccess;

  const groupedRoutes = (() => {
    const groups: { id: string; name: string; routes: any[] }[] = [];
    const indexes = new Map<string, number>();
    (routes || []).forEach((route: any) => {
      const typeId = route.store_type_id || "unknown";
      const typeName = route.store_types?.name || "Other";
      if (!indexes.has(typeId)) {
        indexes.set(typeId, groups.length);
        groups.push({ id: typeId, name: typeName, routes: [] });
      }
      groups[indexes.get(typeId)!].routes.push(route);
    });
    return groups;
  })();

  const isEnabled = useCallback((userId: string, routeId: string) => {
    return (accessRows || []).some((row) => row.user_id === userId && row.route_id === routeId && row.enabled);
  }, [accessRows]);

  const handleToggle = async (userId: string, routeId: string) => {
    const key = `${userId}:${routeId}`;
    if (toggling.has(key)) return;

    setToggling((prev) => new Set(prev).add(key));
    const currentlyEnabled = isEnabled(userId, routeId);
    const { error } = await supabase
      .from("agent_routes")
      .upsert({ user_id: userId, route_id: routeId, enabled: !currentlyEnabled }, { onConflict: "user_id,route_id" });

    if (error) {
      toast.error(error.message);
    } else {
      await refetchAccess();
    }

    setToggling((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!groupedRoutes.length) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-center text-muted-foreground">No active routes found.</div>;
  }

  if (!staffUsers?.length) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-center text-muted-foreground">No active staff users found.</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Grant or revoke route visibility per staff member. Changes apply immediately.</p>

      <ScrollArea className="rounded-xl border bg-card w-full">
        <div className="min-w-max">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <th rowSpan={2} className="sticky left-0 z-20 bg-muted/40 px-5 py-3 text-left text-xs font-semibold text-muted-foreground min-w-[200px] border-r">
                  Staff Member
                </th>
                {groupedRoutes.map((group, groupIndex) => (
                  <th key={group.id} colSpan={group.routes.length} className={`px-3 py-2.5 text-center text-xs font-semibold ${groupIndex < groupedRoutes.length - 1 ? "border-r" : ""}`}>
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 font-semibold">{group.name}</span>
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/20">
                {groupedRoutes.map((group, groupIndex) =>
                  group.routes.map((route: any, routeIndex: number) => (
                    <th
                      key={route.id}
                      className={`px-3 py-2 text-center text-[11px] font-medium text-muted-foreground min-w-[120px] whitespace-nowrap ${
                        routeIndex === group.routes.length - 1 && groupIndex < groupedRoutes.length - 1
                          ? "border-r"
                          : routeIndex < group.routes.length - 1
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
              {staffUsers.map((staff: any, userIndex: number) => (
                <tr
                  key={staff.user_id}
                  className={`border-b last:border-0 hover:bg-accent/30 transition-colors ${userIndex % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td
                    className="sticky left-0 z-10 border-r px-5 py-3 min-w-[200px]"
                    style={{ background: userIndex % 2 === 1 ? "hsl(var(--muted) / 0.1)" : "hsl(var(--background))" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate max-w-[140px]">{staff.full_name || "—"}</p>
                      <span className={`mt-0.5 inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded leading-none ${ROLE_BADGE[staff.role] || ""}`}>
                        {staff.role}
                      </span>
                    </div>
                  </td>

                  {groupedRoutes.map((group, groupIndex) =>
                    group.routes.map((route: any, routeIndex: number) => {
                      const key = `${staff.user_id}:${route.id}`;
                      const busy = toggling.has(key);
                      return (
                        <td
                          key={route.id}
                          className={`px-3 py-3 text-center ${
                            routeIndex === group.routes.length - 1 && groupIndex < groupedRoutes.length - 1
                              ? "border-r"
                              : routeIndex < group.routes.length - 1
                              ? "border-r border-border/30"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            ) : (
                              <Checkbox
                                checked={isEnabled(staff.user_id, route.id)}
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
