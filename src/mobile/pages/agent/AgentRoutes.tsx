import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Navigation2,
  Phone,
  ShoppingBag,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRouteAccess } from "@/hooks/useRouteAccess";

interface RouteStore {
  id: string;
  name: string;
  display_id: string;
  route_id: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  outstanding: number;
  store_order: number | null;
  customers: { name: string } | null;
  store_types: { name: string } | null;
}

interface RouteRow {
  id: string;
  name: string;
  store_types: { name: string } | null;
  stores: RouteStore[];
}

interface VisitRow {
  store_id: string;
  route_sessions: { route_id: string } | { route_id: string }[] | null;
}

export function AgentRoutes() {
  const { user, role } = useAuth();
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const todayStart = startOfDay(new Date()).toISOString();
  const { canAccessRoute, loading: loadingRouteAccess } = useRouteAccess(user?.id, role);

  const { data: routes, isLoading } = useQuery({
    queryKey: ["mobile-agent-routes", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, name, store_types(name), stores(id, name, display_id, route_id, address, phone, lat, lng, outstanding, store_order, customers(name), store_types(name))"
        )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as unknown as RouteRow[]) || [];
    },
    enabled: !!user,
  });

  const routeList = (((routes as RouteRow[] | undefined) || [])
    .filter((route) => canAccessRoute(route.id))
    .map((route) => ({
      ...route,
      stores: Array.isArray(route.stores)
        ? route.stores.filter((store) => canAccessRoute(store.route_id ?? route.id))
        : [],
    })));

  const allStoreIds = useMemo(
    () => routeList.flatMap((route) => route.stores.map((store) => store.id)),
    [routeList]
  );

  const { data: activeSession } = useQuery({
    queryKey: ["active-route-session", user?.id, "mobile-routes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_sessions")
        .select("id, route_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: pendingOrderStoreIds } = useQuery({
    queryKey: ["mobile-route-pending-orders", allStoreIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("store_id")
        .in("store_id", allStoreIds)
        .in("status", ["pending", "active"]);
      if (error) throw error;
      return new Set((data || []).map((row) => row.store_id));
    },
    enabled: allStoreIds.length > 0,
  });

  const { data: visitedStoresByRoute } = useQuery({
    queryKey: ["store-visits", user?.id, "mobile-routes", todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_visits")
        .select("store_id, route_sessions!inner(route_id, user_id)")
        .eq("route_sessions.user_id", user!.id)
        .gte("visited_at", todayStart);
      if (error) throw error;

      const visitMap = new Map<string, Set<string>>();
      const visits = (data || []) as unknown as VisitRow[];
      visits.forEach((visit) => {
        const routeSession = Array.isArray(visit.route_sessions) ? visit.route_sessions[0] : visit.route_sessions;
        const routeId = routeSession?.route_id;
        if (!routeId) return;

        const routeVisits = visitMap.get(routeId) || new Set<string>();
        routeVisits.add(visit.store_id);
        visitMap.set(routeId, routeVisits);
      });

      return visitMap;
    },
    enabled: !!user,
  });

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const openDirections = (store: RouteStore) => {
    if (store.lat != null && store.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
      return;
    }

    if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Today</p>
        <h2 className="text-white text-xl font-bold mt-0.5">My Routes</h2>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <RouteSessionPanel />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
            Available Routes
          </p>

          {isLoading || loadingRouteAccess ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-slate-400">Loading routes...</p>
              </div>
            </div>
          ) : routeList.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <MapPin className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No Routes Available</p>
              <p className="text-xs text-slate-400 mt-1">Contact your manager to assign routes</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {routeList.map((route, idx) => {
                const storeCount = route.stores.length;
                const routeVisitSet = visitedStoresByRoute?.get(route.id) || new Set<string>();
                const visitedCount = routeVisitSet.size;
                const pendingOrders = route.stores.filter((store) => pendingOrderStoreIds?.has(store.id)).length;
                const totalOutstanding = route.stores.reduce((sum, store) => sum + Number(store.outstanding || 0), 0);
                const sortedStores = [...route.stores].sort((left, right) => {
                  if (left.store_order != null && right.store_order != null) return left.store_order - right.store_order;
                  if (left.store_order != null) return -1;
                  if (right.store_order != null) return 1;
                  return left.name.localeCompare(right.name);
                });
                const isExpanded = expandedRouteId === route.id;

                const gradients = [
                  "from-blue-500 to-indigo-600",
                  "from-emerald-500 to-teal-600",
                  "from-violet-500 to-purple-600",
                  "from-amber-500 to-orange-600",
                ];
                const gradient = gradients[idx % gradients.length];

                return (
                  <div
                    key={route.id}
                    className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedRouteId(isExpanded ? null : route.id)}
                    >
                      <div className="flex items-center gap-0">
                        <div className={`w-1.5 self-stretch bg-gradient-to-b ${gradient} rounded-l-none`} />
                        <div className="flex-1 flex items-center gap-3 p-4">
                          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                            <MapPin className="h-5 w-5 text-white" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-white text-base leading-tight truncate">
                              {route.name}
                            </p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <Store className="h-3 w-3" />
                                {storeCount} {storeCount === 1 ? "store" : "stores"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Outstanding: <span className="font-semibold text-slate-700 dark:text-slate-200">₹{totalOutstanding.toLocaleString("en-IN")}</span>
                              </span>
                              {pendingOrders > 0 && (
                                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <ShoppingBag className="h-3 w-3" />
                                  {pendingOrders} active orders
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2 mt-3 flex-wrap">
                              {route.store_types?.name && (
                                <Badge variant="outline" className="text-[10px] font-semibold">
                                  {route.store_types.name}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] font-semibold border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
                                {visitedCount}/{storeCount} visited today
                              </Badge>
                              {activeSession?.route_id === route.id && (
                                <Badge className="text-[10px] font-semibold bg-emerald-500 text-white">
                                  Active session
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {pendingOrders > 0 && (
                              <Badge className="bg-amber-500 text-white text-[10px] font-bold h-5 px-1.5">
                                {pendingOrders}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] font-semibold border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 inline-block animate-pulse" />
                              Active
                            </Badge>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 bg-slate-50/60 dark:bg-slate-900/30">
                        {sortedStores.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-5 text-center">
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No stores assigned</p>
                            <p className="text-xs text-slate-400 mt-1">This route has no stores yet.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {sortedStores.map((store) => {
                              const visited = routeVisitSet.has(store.id);
                              const canNavigate = (store.lat != null && store.lng != null) || !!store.address;

                              return (
                                <div
                                  key={store.id}
                                  className={cn(
                                    "rounded-2xl border p-3 bg-white dark:bg-slate-800 shadow-sm",
                                    visited
                                      ? "border-emerald-100 dark:border-emerald-800/40"
                                      : "border-slate-100 dark:border-slate-700"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{store.name}</p>
                                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md font-mono">
                                          {store.display_id}
                                        </span>
                                      </div>

                                      {store.customers?.name && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{store.customers.name}</p>
                                      )}

                                      {store.address && (
                                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{store.address}</p>
                                      )}

                                      <div className="flex items-center gap-2 flex-wrap mt-2">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[10px] font-semibold",
                                            visited
                                              ? "border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                                              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                                          )}
                                        >
                                          {visited ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 mr-1 inline-block" />}
                                          {visited ? "Visited today" : "Pending visit"}
                                        </Badge>
                                        {pendingOrderStoreIds?.has(store.id) && (
                                          <Badge className="text-[10px] font-semibold bg-amber-500 text-white">
                                            Pending order
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 dark:border-slate-700">
                                          Outstanding ₹{Number(store.outstanding || 0).toLocaleString("en-IN")}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 mt-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 rounded-xl text-xs"
                                      onClick={() => handleCall(store.phone || "")}
                                      disabled={!store.phone}
                                    >
                                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                                      Call
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 rounded-xl text-xs"
                                      onClick={() => openDirections(store)}
                                      disabled={!canNavigate}
                                    >
                                      <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
                                      Navigate
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
