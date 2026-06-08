import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Phone, Navigation2, TrendingUp,
  Store, ShoppingCart, Loader2, Banknote, Wallet, ArrowRight, CheckCircle2, Eye, Package,
  ArrowRightLeft, Boxes, RefreshCw, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { addToQueue, generateBusinessKey } from "@/lib/offlineQueue";
import { VisitReasonDialog } from "@/components/routes/VisitReasonDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MiniStat } from "@/mobile/pages/agent/MiniStat";

interface Props {
  onOpenStore: (store: StoreOption) => void;
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
  onGoProducts?: () => void;
  onOpenAddEntity?: () => void;
  onOpenStockTransfer?: () => void;
  onGoMap?: () => void;
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
  requirement_note: string | null;
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

export function AgentHome({ onOpenStore, onGoRecord, onGoProducts, onOpenAddEntity, onOpenStockTransfer, onGoMap }: Props) {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitReasonDialog, setVisitReasonDialog] = useState<boolean>(false);
  const [showEndRouteConfirm, setShowEndRouteConfirm] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (!activeSession?.started_at) return;
    const update = () => {
      const start = new Date(activeSession.started_at).getTime();
      const diff = Date.now() - start;
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${hrs}h ${mins}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [activeSession?.started_at]);

  const [queueStatus, setQueueStatus] = useState({
    total: 0,
    pending: 0,
    failed: 0,
    conflicts: 0,
    readyToSync: 0,
  });

  const updateQueueStatus = async () => {
    try {
      const { getQueueStatus } = await import("@/lib/offlineQueue");
      const status = await getQueueStatus();
      setQueueStatus(status);
    } catch (e) {
      console.error("Failed to get queue status", e);
    }
  };

  useEffect(() => {
    getCurrentPosition().then(pos => {
      if (pos) setCurrentPosition({ lat: pos.lat, lng: pos.lng });
      else setCurrentPosition(null);
    });
    
    updateQueueStatus();

    const handleQueueChanged = () => {
      updateQueueStatus();
    };

    window.addEventListener("offline-queue-changed", handleQueueChanged);
    window.addEventListener("online", handleQueueChanged);
    window.addEventListener("offline", handleQueueChanged);

    return () => {
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
      window.removeEventListener("online", handleQueueChanged);
      window.removeEventListener("offline", handleQueueChanged);
    };
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
        .select("id, display_id, requirement_note, stores(name), customers(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as unknown as PendingOrderRow[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: routePendingOrders } = useQuery({
    queryKey: ["mobile-route-pending-orders", activeSession?.id],
    queryFn: async () => {
      if (!activeSession) return 0;
      const storeIds = routeStores.map(s => s.id);
      if (storeIds.length === 0) return 0;
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("store_id", storeIds)
        .in("status", ["pending", "confirmed"]);
      return count ?? 0;
    },
    enabled: !!activeSession && routeStores.length > 0,
  });

  // Stock holdings
  const { data: stockItems = [] } = useQuery({
    queryKey: ["mobile-agent-stock-holdings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_stock")
        .select(`id, product_id, quantity, amount_value, product:products(name, sku, unit, base_price)`)
        .eq("user_id", user!.id)
        .gt("quantity", 0);
      return (data || []).map((item: any) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
      }));
    },
    enabled: !!user,
  });

  const totalSales = salesData?.reduce((sum, row) => sum + (row.total_amount ?? 0), 0) ?? 0;
  const cashSales = salesData?.reduce((sum, row) => sum + (row.cash_amount ?? 0), 0) ?? 0;
  const upiSales = salesData?.reduce((sum, row) => sum + (row.upi_amount ?? 0), 0) ?? 0;
  const cashCollected = txData?.reduce((sum, row) => sum + (row.cash_amount ?? 0), 0) ?? 0;
  const upiCollected = txData?.reduce((sum, row) => sum + (row.upi_amount ?? 0), 0) ?? 0;

  const stockValue = stockItems.reduce((sum, item) => sum + (item.amount_value || 0), 0);
  const stockUnits = stockItems.reduce((sum, item) => sum + item.quantity, 0);

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

  const handleMarkVisited = async (reason?: string) => {
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
        const bizKey = generateBusinessKey('visit', {
          userId: user.id,
          storeId: nextStore.id,
          timestamp: new Date().toISOString(),
        });
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
          businessKey: bizKey,
        });
        toast.warning(`Offline — visit queued for ${nextStore.name}`);
        return;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: activeSession.id,
        store_id: nextStore.id,
        lat,
        lng,
        visit_reason: reason || null,
      });

      if (error) throw error;
      toast.success(`Visit recorded for ${nextStore.name}`);
    } catch {
      toast.error("Failed to record visit");
    } finally {
      setVisitLoading(false);
    }
  };

  const handleEndRoute = async () => {
    if (!activeSession) return;
    try {
      const { error } = await supabase
        .from("route_sessions")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activeSession.id);
      if (error) throw error;
      toast.success("Route session ended");
      qc.invalidateQueries({ queryKey: ["mobile-active-session"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to end session");
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
        {/* Offline Queue Sync Indicator */}
        {queueStatus.total > 0 && (
          <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <RefreshCw className="h-4 w-4 text-white animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Syncing Collected Data Offline</p>
                <p className="text-[11px] text-white/80">
                  {queueStatus.pending} pending sync
                  {queueStatus.failed > 0 && ` · ${queueStatus.failed} failures`}
                  {queueStatus.conflicts > 0 && ` · ${queueStatus.conflicts} conflicts`}
                </p>
              </div>
            </div>
            {navigator.onLine ? (
              <Badge className="bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 shrink-0 border-0">Online</Badge>
            ) : (
              <Badge className="bg-slate-600/50 text-slate-200 text-[10px] font-semibold px-2 py-0.5 shrink-0 border-0">Offline</Badge>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Today's Revenue</p>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-full">
              <Store className="h-3 w-3 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{visitCount ?? 0} stores</span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">₹{totalSales.toLocaleString("en-IN")}</p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-800 dark:text-white">₹{(cashSales + cashCollected).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-800 dark:text-white">₹{(upiSales + upiCollected).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>

        {/* Stock Holdings Card */}
        {stockItems.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <Boxes className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">My Stock</p>
              </div>
              <button
                onClick={onOpenStockTransfer}
                className="h-8 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-100"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Transfer
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Products</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">{stockItems.length}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Units</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">{stockUnits}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Value</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">₹{stockValue >= 1000 ? `${(stockValue/1000).toFixed(1)}k` : stockValue.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t space-y-1.5 max-h-48 overflow-y-auto">
              {stockItems.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 dark:text-white truncate">{item.product?.name || "Unknown"}</p>
                    <p className="text-[11px] text-slate-500/70 dark:text-slate-400/70 font-mono">{item.product?.sku || ""}{item.product?.unit ? ` · ${item.product.unit}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{item.quantity}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">₹{Number(item.amount_value || 0).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/*
        // Holding balance moved to History page
        */}

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Sales" value={`₹${totalSales >= 1000 ? `${(totalSales / 1000).toFixed(1)}k` : totalSales.toLocaleString()}`} color="from-blue-500 to-blue-600" icon={TrendingUp} />
          <MiniStat label="Cash" value={`₹${(cashSales + cashCollected) >= 1000 ? `${((cashSales + cashCollected) / 1000).toFixed(1)}k` : (cashSales + cashCollected).toLocaleString()}`} color="from-emerald-500 to-green-600" icon={Banknote} />
          <MiniStat label="UPI" value={`₹${(upiSales + upiCollected) >= 1000 ? `${((upiSales + upiCollected) / 1000).toFixed(1)}k` : (upiSales + upiCollected).toLocaleString()}`} color="from-violet-500 to-purple-600" icon={Wallet} />
        </div>
      </div>

      {activeSession ? (
        <div className="px-4 mt-5">
          <SectionLabel>Active Route</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="bg-blue-50/50 dark:bg-blue-900/20 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 dark:text-white">{activeSession?.routes?.name ?? "Route"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {visitedCount} of {routeStores.length} stores · {elapsed}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {routePendingOrders && routePendingOrders > 0 && (
                    <span className="h-6 min-w-[24px] px-1.5 rounded-md bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {routePendingOrders}
                    </span>
                  )}
                  <Badge className="bg-blue-600 text-white text-[10px] font-semibold px-2.5 border-0">Active</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-semibold text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-2"
                    onClick={() => setShowEndRouteConfirm(true)}
                  >
                    <Square className="h-3 w-3 mr-1" />
                    End
                  </Button>
                </div>
              </div>
            </div>
            <div className="px-4 py-3.5">
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{Math.round(progressPct)}% complete</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{routeStores.length - visitedCount} remaining</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 mt-5">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-6 w-6 text-slate-500/60 dark:text-slate-400/60" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">No Active Route</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Go to Routes tab to start your day</p>
          </div>
        </div>
      )}

      {nextStore && (
        <div className="px-4 mt-5">
          <SectionLabel>Next Stop</SectionLabel>
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-4">
            <div className="flex items-start gap-3">
              <button className="h-14 w-14 rounded-xl bg-muted overflow-hidden shrink-0" onClick={() => onOpenStore(nextStore)}>
                {nextStore.photo_url ? (
                  <img src={nextStore.photo_url} alt={nextStore.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Store className="h-5 w-5 text-slate-500/60 dark:text-slate-400/60" />
                  </div>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left" onClick={() => onOpenStore(nextStore)}>
                    <p className="font-semibold text-slate-800 dark:text-white leading-tight truncate">{nextStore.name}</p>
                  </button>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-orange-200 text-orange-600 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20">Up Next</Badge>
                </div>
                {nextStore.address && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{nextStore.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button size="sm" className="h-10 rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold" onClick={() => openDirections(nextStore)}>
                <Navigation2 className="h-4 w-4" />
                Navigate
              </Button>
              <Button size="sm" variant="outline" className="h-10 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => window.open(`tel:${nextStore.phone}`, "_self")} disabled={!nextStore.phone}>
                <Phone className="h-4 w-4" />
                Call
              </Button>
              <Button size="sm" variant="outline" className="h-10 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => setVisitReasonDialog(true)} disabled={visitLoading}>
                {visitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Visit
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <Button size="sm" variant="outline" className="h-10 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onGoRecord(nextStore, "sale")}>
                <ShoppingCart className="h-4 w-4" />
                Sale
              </Button>
              <Button size="sm" variant="outline" className="h-10 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onGoRecord(nextStore, "payment")}>
                <Wallet className="h-4 w-4" />
                Txn
              </Button>
              <Button size="sm" variant="outline" className="h-10 rounded-xl gap-1.5 text-xs font-semibold" onClick={() => onOpenStore(nextStore)}>
                <Eye className="h-4 w-4" />
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
          className="h-20 flex flex-col items-center justify-center gap-2 shadow-sm"
          onClick={() => onGoProducts?.()}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-medium">Product Catalog</span>
        </Button>
        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-2 shadow-sm"
          onClick={() => onOpenAddEntity?.()}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <Store className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-medium">Add Customer/Store</span>
        </Button>
        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-2 shadow-sm"
          onClick={() => onGoMap?.()}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <MapPin className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-medium">Map View</span>
        </Button>
      </div>

      {(pendingOrders?.length ?? 0) > 0 && (
        <div className="px-4 mt-5">
          <SectionLabel>{pendingOrders!.length} Pending Orders</SectionLabel>
          <div className="space-y-2">
            {pendingOrders!.map((order) => (
              <div key={order.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{order.stores?.name ?? "Unknown Store"}</p>
                  {order.requirement_note && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{order.requirement_note}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 border-amber-200">{order.display_id}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500/30 dark:text-slate-400/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <VisitReasonDialog
        open={visitReasonDialog}
        onOpenChange={setVisitReasonDialog}
        storeName={nextStore?.name || ""}
        onConfirm={async (reason) => {
          setVisitReasonDialog(false);
          await handleMarkVisited(reason);
        }}
        loading={visitLoading}
      />

      <AlertDialog open={showEndRouteConfirm} onOpenChange={setShowEndRouteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Route Session?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            You visited {visitedCount} of {routeStores.length} stores. This will mark the session as complete.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndRoute} className="bg-red-500 hover:bg-red-600">
              End Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">{children}</p>;
}


