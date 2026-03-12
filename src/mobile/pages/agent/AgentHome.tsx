import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Navigation2, TrendingUp, IndianRupee, Store, ShoppingCart, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function AgentHome() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  // Stats queries — same as AgentDashboard.tsx
  const { data: salesData } = useQuery({
    queryKey: ["mobile-agent-sales-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount")
        .eq("recorded_by", user!.id)
        .gte("created_at", today);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: txData } = useQuery({
    queryKey: ["mobile-agent-tx-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("total_amount, cash_amount, upi_amount")
        .eq("recorded_by", user!.id)
        .gte("created_at", today);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: visitCount } = useQuery({
    queryKey: ["mobile-agent-visits-today", user?.id, today],
    queryFn: async () => {
      const { count } = await supabase
        .from("store_visits")
        .select("id", { count: "exact", head: true })
        .gte("visited_at", today);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: activeSession } = useQuery({
    queryKey: ["mobile-active-session", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, address, lat, lng, store_order, phone))")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: visits } = useQuery({
    queryKey: ["mobile-session-visits", activeSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .eq("session_id", activeSession!.id);
      return new Set((data || []).map((v: any) => v.store_id));
    },
    enabled: !!activeSession,
  });

  const { data: pendingOrders } = useQuery({
    queryKey: ["mobile-agent-pending-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, display_id, notes, stores(name), customers(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Aggregate stats
  const totalSales = salesData?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;
  const cashSales = salesData?.reduce((s, r) => s + (r.cash_amount ?? 0), 0) ?? 0;
  const upiSales = salesData?.reduce((s, r) => s + (r.upi_amount ?? 0), 0) ?? 0;
  const cashCollected = txData?.reduce((s, r) => s + (r.cash_amount ?? 0), 0) ?? 0;
  const upiCollected = txData?.reduce((s, r) => s + (r.upi_amount ?? 0), 0) ?? 0;

  const routeStores: any[] = (activeSession as any)?.routes?.stores ?? [];
  const sortedStores = [...routeStores].sort((a, b) => (a.store_order ?? 0) - (b.store_order ?? 0));
  const nextStore = sortedStores.find((s) => !visits?.has(s.id));
  const visitedCount = sortedStores.filter((s) => visits?.has(s.id)).length;

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleNavigate = (store: any) => {
    if (store.lat && store.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
    } else if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Stats grid */}
      <div className="px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Today's Summary
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={Store}
            label="Stores Covered"
            value={String(visitCount ?? 0)}
            iconColor="text-blue-500"
            bg="bg-blue-500/10"
          />
          <StatCard
            icon={TrendingUp}
            label="Sales Today"
            value={`₹${totalSales.toLocaleString()}`}
            iconColor="text-green-500"
            bg="bg-green-500/10"
          />
          <StatCard
            icon={IndianRupee}
            label="Cash Collected"
            value={`₹${(cashSales + cashCollected).toLocaleString()}`}
            iconColor="text-amber-500"
            bg="bg-amber-500/10"
          />
          <StatCard
            icon={IndianRupee}
            label="UPI Collected"
            value={`₹${(upiSales + upiCollected).toLocaleString()}`}
            iconColor="text-purple-500"
            bg="bg-purple-500/10"
          />
        </div>
      </div>

      {/* Route session progress */}
      {activeSession && (
        <div className="px-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Active Route</p>
                  <p className="font-semibold text-base">{(activeSession as any).routes?.name ?? "Route"}</p>
                </div>
                <Badge variant="default" className="text-xs">Active</Badge>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: routeStores.length
                        ? `${(visitedCount / routeStores.length) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {visitedCount}/{routeStores.length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Next store card */}
      {nextStore && (
        <div className="px-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Next Stop
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-base truncate">{nextStore.name}</p>
                  {nextStore.address && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {nextStore.address}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">Up Next</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 gap-1.5 text-xs"
                  onClick={() => handleNavigate(nextStore)}
                >
                  <Navigation2 className="h-3.5 w-3.5" />
                  Navigate
                </Button>
                {nextStore.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 gap-1.5 text-xs"
                    onClick={() => handleCall(nextStore.phone)}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No active session prompt */}
      {!activeSession && (
        <div className="px-4">
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium">No active route session</p>
              <p className="text-xs text-muted-foreground mt-1">
                Go to Routes tab to start your day
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending orders */}
      {(pendingOrders?.length ?? 0) > 0 && (
        <div className="px-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Pending Orders
          </h2>
          <div className="space-y-2">
            {pendingOrders!.map((order: any) => (
              <Card key={order.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {order.stores?.name ?? "Unknown Store"}
                      </p>
                      {order.notes && (
                        <p className="text-xs text-muted-foreground truncate">{order.notes}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {order.display_id}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor: string;
  bg: string;
}

function StatCard({ icon: Icon, label, value, iconColor, bg }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-3.5 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", bg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground leading-none mb-1">{label}</p>
          <p className="text-base font-bold leading-tight truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
