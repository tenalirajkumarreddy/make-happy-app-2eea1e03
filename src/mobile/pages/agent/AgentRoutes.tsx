import { useQuery } from "@tanstack/react-query";
import { MapPin, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-4 pb-4">
      {/* Route Session Panel (manages start/stop/mark visited) */}
      <div className="px-4">
        <RouteSessionPanel />
      </div>

      {/* Routes list */}
      <div className="px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Available Routes
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (routes?.length ?? 0) === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No routes available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {routes!.map((route: any) => {
              const storeCount = Array.isArray(route.stores) ? route.stores.length : 0;
              const pendingOrders = Array.isArray(route.orders) ? route.orders.length : 0;
              return (
                <Card key={route.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-base truncate">{route.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {storeCount} {storeCount === 1 ? "store" : "stores"}
                          {pendingOrders > 0 && ` · ${pendingOrders} pending order${pendingOrders > 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pendingOrders > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {pendingOrders}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 inline-block" />
                          Active
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
