import { useQuery } from "@tanstack/react-query";
import { MapPin, Loader2, Store, ShoppingBag, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";

export function AgentRoutes() {
  const { user } = useAuth();

  const { data: routes, isLoading } = useQuery({
    queryKey: ["mobile-agent-routes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, is_active, stores(id), orders(id)")
        .eq("is_active", true)
        .order("name");
      return (data as any[]) || [];
    },
    enabled: !!user,
  });

  return (
    <div className="pb-6">
      {/* Section header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Today</p>
        <h2 className="text-white text-xl font-bold mt-0.5">My Routes</h2>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        {/* Route session panel (start/stop/mark visited) */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <RouteSessionPanel />
        </div>

        {/* Available routes list */}
        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
            Available Routes
          </p>

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-slate-400">Loading routes...</p>
              </div>
            </div>
          ) : (routes?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <MapPin className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No Routes Available</p>
              <p className="text-xs text-slate-400 mt-1">Contact your manager to assign routes</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {routes!.map((route: any, idx: number) => {
                const storeCount = Array.isArray(route.stores) ? route.stores.length : 0;
                const pendingOrders = Array.isArray(route.orders) ? route.orders.length : 0;

                // Cycle through gradient colors
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
                    <div className="flex items-center gap-0">
                      {/* Color accent bar */}
                      <div className={`w-1.5 self-stretch bg-gradient-to-b ${gradient} rounded-l-none`} />
                      <div className="flex-1 flex items-center gap-3 p-4">
                        {/* Icon */}
                        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-white text-base leading-tight truncate">
                            {route.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              <Store className="h-3 w-3" />
                              {storeCount} {storeCount === 1 ? "store" : "stores"}
                            </span>
                            {pendingOrders > 0 && (
                              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <ShoppingBag className="h-3 w-3" />
                                {pendingOrders} orders
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Right side */}
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
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        </div>
                      </div>
                    </div>
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
