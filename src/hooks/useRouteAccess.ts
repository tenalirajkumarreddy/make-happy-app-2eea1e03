import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SCOPED_ROLES = new Set(["agent", "marketer", "pos", "manager"]);

export function isScopedRole(role?: string | null) {
  return !!role && SCOPED_ROLES.has(role);
}

export function computeRouteAccess(routeRows: Array<{ route_id: string; enabled: boolean }> | undefined, role?: string | null) {
  const scoped = isScopedRole(role);
  const rows = routeRows || [];
  const enabledRouteIds = new Set(rows.filter((row) => row.enabled).map((row) => row.route_id));
  const hasMatrixRestrictions = scoped && rows.length > 0;

  const canAccessRoute = (routeId: string | null | undefined) => {
    if (!hasMatrixRestrictions) return true;
    return !!routeId && enabledRouteIds.has(routeId);
  };

  return {
    scoped,
    hasMatrixRestrictions,
    enabledRouteIds,
    canAccessRoute,
  };
}

export function useRouteAccess(userId?: string | null, role?: string | null) {
  const scoped = isScopedRole(role);

  const { data: routeRows, isLoading } = useQuery({
    queryKey: ["route-access-matrix", userId, role],
    queryFn: async () => {
      if (!userId || !scoped) return [] as Array<{ route_id: string; enabled: boolean }>;
      const { data, error } = await supabase
        .from("agent_routes")
        .select("route_id, enabled")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as Array<{ route_id: string; enabled: boolean }>;
    },
    enabled: !!userId && scoped,
  });

  return useMemo(() => {
    const computed = computeRouteAccess(routeRows, role);
    return {
      ...computed,
      routeRows: routeRows || [],
      loading: !!userId && scoped ? isLoading : false,
    };
  }, [isLoading, role, routeRows, scoped, userId]);
}
