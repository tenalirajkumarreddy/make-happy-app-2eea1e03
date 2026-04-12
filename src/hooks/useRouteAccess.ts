import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Roles restricted by the agent route/store-type access matrices.
// Managers are intentionally NOT scoped: they should retain broad visibility by default.
const SCOPED_ROLES = new Set(["agent", "marketer", "pos"]);

export function isScopedRole(role?: string | null) {
  return !!role && SCOPED_ROLES.has(role);
}

// ─── Route access (unchanged logic) ───────────────────────────────
export function computeRouteAccess(routeRows: Array<{ route_id: string; enabled: boolean }> | undefined, role?: string | null) {
  const scoped = isScopedRole(role);
  const rows = routeRows || [];
  const enabledRouteIds = new Set(rows.filter((row) => row.enabled).map((row) => row.route_id));
  // Scoped roles are ALWAYS restricted by the matrix (deny-by-default).
  // If they have no rows, it means no routes have been enabled for them.
  const hasMatrixRestrictions = scoped;

  const canAccessRoute = (routeId: string | null | undefined) => {
    // Unrestricted roles (super_admin) → allow all
    if (!hasMatrixRestrictions) return true;
    // No route assigned → deny (they need a route to access stores)
    if (!routeId) return false;
    // Whitelist: only allow routes explicitly enabled
    return enabledRouteIds.has(routeId);
  };

  return {
    scoped,
    hasMatrixRestrictions,
    enabledRouteIds,
    canAccessRoute,
  };
}

// ─── Store-type access ────────────────────────────────────────────
export function computeStoreTypeAccess(storeTypeRows: Array<{ store_type_id: string; enabled: boolean }> | undefined, role?: string | null) {
  const scoped = isScopedRole(role);
  const rows = storeTypeRows || [];
  const enabledStoreTypeIds = new Set(rows.filter((row) => row.enabled).map((row) => row.store_type_id));
  // Same pattern: no rows = unrestricted → allow all store types
  const hasStoreTypeRestrictions = scoped && rows.length > 0;

  const canAccessStoreType = (storeTypeId: string | null | undefined) => {
    if (!hasStoreTypeRestrictions) return true;
    return !!storeTypeId && enabledStoreTypeIds.has(storeTypeId);
  };

  return {
    hasStoreTypeRestrictions,
    enabledStoreTypeIds,
    canAccessStoreType,
  };
}

// ─── Combined hook ────────────────────────────────────────────────
export function useRouteAccess(userId?: string | null, role?: string | null) {
  const scoped = isScopedRole(role);

  const { data: routeRows, isLoading: loadingRoutes } = useQuery({
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

  const { data: storeTypeRows, isLoading: loadingStoreTypes } = useQuery({
    queryKey: ["store-type-access-matrix", userId, role],
    queryFn: async () => {
      if (!userId || !scoped) return [] as Array<{ store_type_id: string; enabled: boolean }>;
      const { data, error } = await (supabase as any)
        .from("agent_store_types")
        .select("store_type_id, enabled")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as Array<{ store_type_id: string; enabled: boolean }>;
    },
    enabled: !!userId && scoped,
  });

  return useMemo(() => {
    const routeAccess = computeRouteAccess(routeRows, role);
    const storeTypeAccess = computeStoreTypeAccess(storeTypeRows, role);

    // Combined check: store must satisfy BOTH route AND store-type access
    const canAccessStore = (routeId: string | null | undefined, storeTypeId: string | null | undefined) => {
      return routeAccess.canAccessRoute(routeId) && storeTypeAccess.canAccessStoreType(storeTypeId);
    };

    return {
      ...routeAccess,
      ...storeTypeAccess,
      canAccessStore,
      routeRows: routeRows || [],
      storeTypeRows: storeTypeRows || [],
      loading: !!userId && scoped ? (loadingRoutes || loadingStoreTypes) : false,
    };
  }, [loadingRoutes, loadingStoreTypes, role, routeRows, storeTypeRows, scoped, userId]);
}
