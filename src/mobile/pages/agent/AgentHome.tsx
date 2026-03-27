import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Phone, Navigation2, TrendingUp,
  Store, ShoppingCart, Loader2, Banknote, Wallet, ArrowRight, CheckCircle2, Eye, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { addToQueue } from "@/lib/offlineQueue";

interface Props {
  onOpenStore: (store: StoreOption) => void;
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
  onGoProducts?: () => void;
  onOpenAddEntity?: () => void;
}

interface RouteStoreLite {
  id: string;
  name: string;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  outstanding: number;
  store_order: number | null;
  route_id: string | null;
  store_type_id: string | null;
  customer_id: string | null;
  display_id: string;
  is_active: boolean;
  customers: { name: string } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

interface ActiveSessionData {
  id: string;
  routes: {
    name: string | null;
    stores: RouteStoreLite[];
  } | null;
}

interface PendingOrderRow {
  id: string;
  display_id: string | null;
  notes: string | null;
  stores: { name: string } | null;
  customers: { name: string } | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AgentHome({ onOpenStore, onGoRecord, onGoProducts, onOpenAddEntity }: Props) {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  useEffect(() => {
    getCurrentPosition().then(pos => {
      if (pos) setCurrentPosition({ lat: pos.lat, lng: pos.lng });
      else setCurrentPosition(null);
    });
  }, []);

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
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, display_id, photo_url, address, lat, lng, store_order, phone, outstanding, route_id, store_type_id, customer_id, customers(name), store_types(name), routes(name)))")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return (data as unknown as ActiveSessionData | null) || null;
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
      return new Set((data || []).map((visit) => visit.store_id));
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
      return (data as unknown as PendingOrderRow[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const totalSales = salesData?.reduce((sum, row) => sum + (row.total_amount ?? 0), 0) ?? 0;
  const cashSales = salesData?.reduce((sum, row) => sum + (row.cash_amount ?? 0), 0) ?? 0;
  const upiSales = salesData?.reduce((sum, row) => sum + (row.upi_amount ?? 0), 0) ?? 0;
  const cashCollected = txData?.reduce((sum, row) => sum + (row.cash_amount ?? 0), 0) ?? 0;
  const upiCollected = txData?.reduce((sum, row) => sum + (row.upi_amount ?? 0), 0) ?? 0;

  const routeStores: RouteStoreLite[] = activeSession?.routes?.stores ?? [];
  const sortedStores = [...routeStores].sort((left, right) => (left.store_order ?? 0) - (right.store_order ?? 0));
  const unvisitedStores = sortedStores.filter((store) => !visits?.has(store.id));

  const nextStore = useMemo(() => {
    if (unvisitedStores.length === 0) return null;

    if (!currentPosition) {
      return unvisitedStores[0];
    }

    const withDistance = unvisitedStores.map((store) => {
      if (store.lat == null || store.lng == null) {
        return { store, dist: Number.POSITIVE_INFINITY };
      }
      return {
        store,
        dist: haversineKm(currentPosition.lat, currentPosition.lng, Number(store.lat), Number(store.lng)),
      };
    });

    withDistance.sort((left, right) => {
      if (left.dist === right.dist) {
        return (left.store.store_order ?? 0) - (right.store.store_order ?? 0);
      }
      return left.dist - right.dist;
    });

    return withDistance[0].store;
  }, [unvisitedStores, currentPosition]);

  const visitedCount = sortedStores.filter((store) => visits?.has(store.id)).length;
  const progressPct = routeStores.length ? (visitedCount / routeStores.length) * 100 : 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = (profile?.full_name ?? "Agent").split(" ")[0];

  const openDirections = (store: RouteStoreLite) => {
    if (store.lat && store.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
      return;
    }
    if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  const handleMarkVisited = async () => {
    if (!user || !nextStore || !activeSession?.id) return;

    setVisitLoading(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      const pos = await getCurrentPosition();
      if (pos) {
        lat = pos.lat;
        lng = pos.lng;
      }

      if (!navigator.onLine) {
        await addToQueue({
          id: crypto.randomUUID(),
          type: "visit",
          payload: {
            userId: user.id,
            storeId: nextStore.id,
            lat,
            lng,
          },
          createdAt: new Date().toISOString(),
        });
        toast.warning(`Offline — visit queued for ${nextStore.name}`);
        return;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: activeSession.id,
        store_id: nextStore.id,
        lat,
        lng,
      });

      if (error) throw error;
      toast.success(`Visit recorded for ${nextStore.name}`);
    } catch {
      toast.error("Failed to record visit");
    } finally {
      setVisitLoading(false);
    }
  };

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Revenue</p>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
              <Store className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">{visitCount ?? 0} stores</span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">₹{totalSales.toLocaleString("en-IN")}</p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-700 dark:text-slate-200">₹{(cashSales + cashCollected).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-700 dark:text-slate-200">₹{(upiSales + upiCollected).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Sales" value={`₹${totalSales >= 1000 ? `${(totalSales / 1000).toFixed(1)}k` : totalSales.toLocaleString()}`} color="from-blue-500 to-blue-600" icon={TrendingUp} />
          <MiniStat label="Cash" value={`₹${(cashSales + cashCollected) >= 1000 ? `${((cashSales + cashCollected) / 1000).toFixed(1)}k` : (cashSales + cashCollected).toLocaleString()}`} color="from-emerald-500 to-green-600" icon={Banknote} />
          <MiniStat label="UPI" value={`₹${(upiSales + upiCollected) >= 1000 ? `${((upiSales + upiCollected) / 1000).toFixed(1)}k` : (upiSales + upiCollected).toLocaleString()}`} color="from-violet-500 to-purple-600" icon={Wallet} />
        </div>
      </div>

      {activeSession ? (
        <div className="px-4 mt-5">
          <SectionLabel>Active Route</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-base">{activeSession?.routes?.name ?? "Route"}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{visitedCount} of {routeStores.length} stores done</p>
              </div>
              <Badge className="bg-blue-600 text-white text-[10px] font-semibold px-2">🟢 Active</Badge>
            </div>
            <div className="px-4 py-3">
              <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
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

      {nextStore && (
        <div className="px-4 mt-5">
          <SectionLabel>Next Stop (Nearest Unvisited)</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <button className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0" onClick={() => onOpenStore(nextStore)}>
                {nextStore.photo_url ? (
                  <img src={nextStore.photo_url} alt={nextStore.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Store className="h-5 w-5 text-slate-400" />
                  </div>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left" onClick={() => onOpenStore(nextStore)}>
                    <p className="font-semibold text-slate-800 dark:text-white text-base leading-tight truncate">{nextStore.name}</p>
                  </button>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-orange-200 text-orange-600 dark:border-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20">Up Next</Badge>
                </div>
                {nextStore.address && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{nextStore.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Button size="sm" className="h-9 rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold" onClick={() => openDirections(nextStore)}>
                <Navigation2 className="h-3.5 w-3.5" />
                Navigate
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs font-semibold border-slate-200 dark:border-slate-600" onClick={() => window.open(`tel:${nextStore.phone}`, "_self")} disabled={!nextStore.phone}>
                <Phone className="h-3.5 w-3.5" />
                Call
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs font-semibold" onClick={handleMarkVisited} disabled={visitLoading}>
                {visitLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Visit
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onGoRecord(nextStore, "sale")}>
                <ShoppingCart className="h-3.5 w-3.5" />
                Sale
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onGoRecord(nextStore, "payment")}>
                <Wallet className="h-3.5 w-3.5" />
                Txn
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onOpenStore(nextStore)}>
                <Eye className="h-3.5 w-3.5" />
                Open
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6 mt-4">
        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-2 border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-900"
          onClick={() => onGoProducts?.()}
        >
          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-xs font-medium">Product Catalog</span>
        </Button>
        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-2 border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-900"
          onClick={() => onOpenAddEntity?.()}
        >
          <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xs font-medium">Add Customer/Store</span>
        </Button>
      </div>

      {(pendingOrders?.length ?? 0) > 0 && (
        <div className="px-4 mt-5">
          <SectionLabel>{pendingOrders!.length} Pending Orders</SectionLabel>
          <div className="space-y-2">
            {pendingOrders!.map((order) => (
              <div key={order.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{order.stores?.name ?? "Unknown Store"}</p>
                  {order.notes && <p className="text-xs text-slate-400 truncate">{order.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700">{order.display_id}</Badge>
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
  return <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">{children}</p>;
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
