import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type AccessLevel = "all" | "assigned" | "none";

const ACCESS_OPTIONS: { value: AccessLevel; label: string; className: string }[] = [
  { value: "all", label: "All", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25" },
  { value: "assigned", label: "Assigned", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25" },
  { value: "none", label: "None", className: "bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25" },
];

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-red-500/15 text-red-600",
  manager: "bg-purple-500/15 text-purple-600",
  agent: "bg-blue-500/15 text-blue-600",
  marketer: "bg-emerald-500/15 text-emerald-600",
  operator: "bg-orange-500/15 text-orange-600",
};

export function OrderAccessMatrix() {
  const qc = useQueryClient();
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-for-order-access"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"]);
      const userIds = roles?.map((r) => r.user_id) || [];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
      return (roles || []).map((r) => ({
        user_id: r.user_id,
        full_name: profileMap.get(r.user_id) || "Unknown",
        role: r.role,
      })).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-order-access"],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, store_type_id, store_types(name)")
        .eq("is_active", true)
        .order("store_types(name)")
        .order("name");
      return data || [];
    },
  });

  const groupedRoutes = useMemo(() => {
    const groups: { id: string; name: string; routes: any[] }[] = [];
    const indexes = new Map<string, number>();
    (routes as any[]).forEach((route: any) => {
      const typeId = route.store_type_id || "unknown";
      const typeName = route.store_types?.name || "Other";
      if (!indexes.has(typeId)) {
        indexes.set(typeId, groups.length);
        groups.push({ id: typeId, name: typeName, routes: [] });
      }
      groups[indexes.get(typeId)!].routes.push(route);
    });
    return groups;
  }, [routes]);

  const { data: accessRows = [] } = useQuery({
    queryKey: ["order-access-rows"],
    queryFn: async () => {
      const { data } = await supabase.from("user_order_access").select("*");
      return (data || []) as Array<{ user_id: string; access_level: AccessLevel; route_ids?: string[] }>;
    },
  });
  const accessMap = new Map(accessRows.map((r: any) => [r.user_id, r.access_level]));
  const getAccessLevel = (uid: string): AccessLevel => accessMap.get(uid) || "all";

  const routeAccessMap = new Map<string, Set<string>>();
  (accessRows as any[]).forEach((r: any) => {
    if (r.route_ids && Array.isArray(r.route_ids)) {
      routeAccessMap.set(r.user_id, new Set(r.route_ids));
    }
  });
  const getRouteAccess = (uid: string, routeId: string): boolean => {
    const level = getAccessLevel(uid);
    if (level === "all") return true;
    return routeAccessMap.get(uid)?.has(routeId) || false;
  };

  const handleToggleLevel = useCallback(async (userId: string, current: AccessLevel) => {
    const nextIndex = (ACCESS_OPTIONS.findIndex((o) => o.value === current) + 1) % ACCESS_OPTIONS.length;
    const nextLevel = ACCESS_OPTIONS[nextIndex].value;
    const key = `level-${userId}`;
    setToggling((prev) => new Set(prev).add(key));
    try {
      const { error } = await supabase
        .from("user_order_access")
        .upsert({ user_id: userId, access_level: nextLevel }, { onConflict: "user_id" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["order-access-rows"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update access");
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [qc]);

  const handleToggleRoute = useCallback(async (userId: string, routeId: string, currentLevel: AccessLevel) => {
    if (currentLevel === "all") return;
    const key = `route-${userId}-${routeId}`;
    setToggling((prev) => new Set(prev).add(key));
    try {
      const current = routeAccessMap.get(userId) || new Set<string>();
      const updated = new Set(current);
      if (updated.has(routeId)) { updated.delete(routeId); } else { updated.add(routeId); }
      const { error } = await supabase
        .from("user_order_access")
        .upsert({ user_id: userId, access_level: currentLevel, route_ids: Array.from(updated) }, { onConflict: "user_id" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["order-access-rows"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update route access");
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [qc, routeAccessMap]);

  if (loadingStaff) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong>Default:</strong> All users see every order. Click <strong>Access Level</strong> to restrict (All → Assigned → None).
        Route checkboxes grant access to specific routes. Assigned orders are always visible.
      </p>

      <ScrollArea className="rounded-xl border max-h-[60vh]">
        <div className="min-w-[700px]">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 sticky top-0">
                <th rowSpan={2} className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-48 border-r">Staff Member</th>
                <th rowSpan={2} className="text-center px-2 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-28 border-r">Access Level</th>
                {groupedRoutes.map((group, gi) => (
                  <th key={group.id} colSpan={group.routes.length} className={`px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider ${gi < groupedRoutes.length - 1 ? "border-r" : ""}`}>
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5">{group.name}</span>
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/30">
                {groupedRoutes.map((group, gi) =>
                  group.routes.map((route: any, ri: number) => (
                    <th key={route.id} className={`px-2 py-2 text-[10px] font-medium text-muted-foreground ${ri === group.routes.length - 1 && gi < groupedRoutes.length - 1 ? "border-r" : ""}`}>
                      {route.name}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const level = getAccessLevel(member.user_id);
                return (
                  <tr key={member.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 border-r">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{member.full_name}</span>
                        <Badge variant="outline" className={cn("text-[9px] font-semibold px-1.5 py-0", ROLE_BADGE[member.role] || "")}>
                          {member.role === "super_admin" ? "Admin" : member.role}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center border-r">
                      <button
                        onClick={() => handleToggleLevel(member.user_id, level)}
                        disabled={toggling.has(`level-${member.user_id}`)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:scale-105 active:scale-95",
                          ACCESS_OPTIONS.find((o) => o.value === level)?.className,
                          toggling.has(`level-${member.user_id}`) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {toggling.has(`level-${member.user_id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {ACCESS_OPTIONS.find((o) => o.value === level)?.label}
                      </button>
                    </td>
                    {groupedRoutes.map((group, gi) =>
                      group.routes.map((route: any, ri: number) => (
                        <td key={route.id} className={`px-2 py-2.5 text-center ${ri === group.routes.length - 1 && gi < groupedRoutes.length - 1 ? "border-r" : ""}`}>
                          <Checkbox
                            checked={getRouteAccess(member.user_id, route.id)}
                            disabled={level === "all" || toggling.has(`route-${member.user_id}-${route.id}`)}
                            onCheckedChange={() => handleToggleRoute(member.user_id, route.id, level)}
                          />
                        </td>
                      ))
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
