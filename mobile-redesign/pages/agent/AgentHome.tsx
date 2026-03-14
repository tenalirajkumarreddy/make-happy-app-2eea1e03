import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Phone, Navigation2, TrendingUp, IndianRupee,
  Store, ShoppingCart, Loader2, Banknote, Wallet, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function AgentHome() {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split("T")[0];

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

  const totalSales = salesData?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;
  const cashSales = salesData?.reduce((s, r) => s + (r.cash_amount ?? 0), 0) ?? 0;
  const upiSales = salesData?.reduce((s, r) => s + (r.upi_amount ?? 0), 0) ?? 0;
  const cashCollected = txData?.reduce((s, r) => s + (r.cash_amount ?? 0), 0) ?? 0;
  const upiCollected = txData?.reduce((s, r) => s + (r.upi_amount ?? 0), 0) ?? 0;

  const routeStores: any[] = (activeSession as any)?.routes?.stores ?? [];
  const sortedStores = [...routeStores].sort((a, b) => (a.store_order ?? 0) - (b.store_order ?? 0));
  const nextStore = sortedStores.find((s) => !visits?.has(s.id));
  const visitedCount = sortedStores.filter((s) => visits?.has(s.id)).length;
  const progressPct = routeStores.length ? (visitedCount / routeStores.length) * 100 : 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = (profile?.full_name ?? "Agent").split(" ")[0];

  return (
    <div className="pb-6">
      {/* Hero greeting banner */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Overlapping stats cards */}
      <div className="px-4 -mt-5 space-y-3">
        {/* Hero total sales card */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Today's Revenue
            </p>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
              <Store className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                {visitCount ?? 0} stores
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            ₹{totalSales.toLocaleString("en-IN")}
          </p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Cash <strong className="text-slate-700 dark:text-slate-200">₹{(cashSales + cashCollected).toLocaleString("en-IN")}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                UPI <strong className="text-slate-700 dark:text-slate-200">₹{(upiSales + upiCollected).toLocaleString("en-IN")}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat
            label="Sales"
            value={`₹${totalSales >= 1000 ? `${(totalSales / 1000).toFixed(1)}k` : totalSales.toLocaleString()}`}
            color="from-blue-500 to-blue-600"
            icon={TrendingUp}
          />
          <MiniStat
            label="Cash"
            value={`₹${(cashSales + cashCollected) >= 1000 ? `${((cashSales + cashCollected) / 1000).toFixed(1)}k` : (cashSales + cashCollected).toLocaleString()}`}
            color="from-emerald-500 to-green-600"
            icon={Banknote}
          />
          <MiniStat
            label="UPI"
            value={`₹${(upiSales + upiCollected) >= 1000 ? `${((upiSales + upiCollected) / 1000).toFixed(1)}k` : (upiSales + upiCollected).toLocaleString()}`}
            color="from-violet-500 to-purple-600"
            icon={Wallet}
          />
        </div>
      </div>

      {/* Active route section */}
      {activeSession ? (
        <div className="px-4 mt-5">
          <SectionLabel>Active Route</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Route header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-base">
                  {(activeSession as any).routes?.name ?? "Route"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {visitedCount} of {routeStores.length} stores done
                </p>
              </div>
              <Badge className="bg-blue-600 text-white text-[10px] font-semibold px-2">
                🟢 Active
              </Badge>
            </div>
            {/* Progress bar */}
            <div className="px-4 py-3">
              <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[11px] text-slate-400">{Math.round(progressPct)}% complete</span>
                <span className="text-[11px] text-slate-400">{routeStores.length - visitedCount} remaining</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 mt-5">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-5 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No Active Route</p>
            <p className="text-xs text-slate-400 mt-1">Go to Routes tab to start your day</p>
          </div>
        </div>
      )}

      {/* Next store */}
      {nextStore && (
        <div className="px-4 mt-5">
          <SectionLabel>Next Stop</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 shadow-sm">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800 dark:text-white text-base leading-tight truncate">
                    {nextStore.name}
                  </p>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-orange-200 text-orange-600 dark:border-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20">
                    Up Next
                  </Badge>
                </div>
                {nextStore.address && (
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{nextStore.address}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 h-10 rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                onClick={() => {
                  if (nextStore.lat && nextStore.lng) {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${nextStore.lat},${nextStore.lng}`, "_blank");
                  } else if (nextStore.address) {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nextStore.address)}`, "_blank");
                  }
                }}
              >
                <Navigation2 className="h-3.5 w-3.5" />
                Navigate
              </Button>
              {nextStore.phone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-10 rounded-xl gap-1.5 text-xs font-semibold border-slate-200 dark:border-slate-600"
                  onClick={() => window.open(`tel:${nextStore.phone}`, "_self")}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending orders */}
      {(pendingOrders?.length ?? 0) > 0 && (
        <div className="px-4 mt-5">
          <SectionLabel>{pendingOrders!.length} Pending Orders</SectionLabel>
          <div className="space-y-2">
            {pendingOrders!.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm"
              >
                <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                    {order.stores?.name ?? "Unknown Store"}
                  </p>
                  {order.notes && (
                    <p className="text-xs text-slate-400 truncate">{order.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700">
                    {order.display_id}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
      {children}
    </p>
  );
}

interface MiniStatProps {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}

function MiniStat({ label, value, color, icon: Icon }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-2">
      <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center", color)}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}
