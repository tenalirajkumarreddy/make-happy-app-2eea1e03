import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingCart, TrendingUp, ArrowRightLeft, ClipboardList, Store, Banknote, Smartphone, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useOperatorWarehouse } from "@/mobile/hooks/useOperatorWarehouse";

type Props = {
  onOpenRecord: () => void;
  onOpenHistory: () => void;
};

export function PosHome({ onOpenRecord, onOpenHistory }: Props) {
  const { user, profile } = useAuth();
  const { warehouse, posStore, isLoading: warehouseLoading } = useOperatorWarehouse(user?.id);

  // Today's sales stats for the POS store
  const { data: salesStats, isLoading: salesLoading } = useQuery({
    queryKey: ["mobile-pos-sales", posStore?.id, user?.id],
    queryFn: async () => {
      if (!posStore) return null;
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount")
        .eq("store_id", posStore!.id)
        .gte("created_at", `${today}T00:00:00`);
      const sales = data || [];
      return {
        total: sales.reduce((s, r) => s + Number(r.total_amount || 0), 0),
        cash: sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0),
        upi: sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0),
        count: sales.length,
      };
    },
    enabled: !!posStore,
    refetchInterval: 60_000,
  });

  // Orders for the warehouse's stores
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["mobile-pos-orders", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return { pending: [], recent: [] };

      // Get all stores linked to this warehouse
      const { data: stores } = await supabase
        .from("stores")
        .select("id, name")
        .eq("warehouse_id", warehouse!.id);

      const storeIds = (stores || []).map(s => s.id);
      if (storeIds.length === 0) return { pending: [], recent: [] };

      const today = new Date().toISOString().split("T")[0];

      const [pendingRes, recentRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, display_id, status, total_amount, created_at, stores(name)")
          .in("store_id", storeIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("orders")
          .select("id, display_id, status, total_amount, created_at, stores(name)")
          .in("store_id", storeIds)
          .gte("created_at", `${today}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        pending: pendingRes.data || [],
        recent: recentRes.data || [],
      };
    },
    enabled: !!warehouse,
    refetchInterval: 60_000,
  });

  // Stock movements for the warehouse
  const { data: stockMovements, isLoading: movementsLoading } = useQuery({
    queryKey: ["mobile-pos-movements", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return [];
      const { data } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, created_at, from_warehouse_id, to_warehouse_id, remarks, products(name)")
        .or(`from_warehouse_id.eq.${warehouse!.id},to_warehouse_id.eq.${warehouse!.id}`)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!warehouse,
    refetchInterval: 60_000,
  });

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };
  const firstName = (profile?.full_name ?? "Operator").split(" ")[0];

  return (
    <div className="pb-6">
      {/* Gradient Hero Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-700 dark:from-slate-900 dark:via-purple-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-purple-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-purple-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          {warehouse && <span className="ml-2">· {warehouse.name}</span>}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">

        {/* No Warehouse State */}
        {warehouseLoading && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            <p className="text-sm text-slate-400">Loading warehouse...</p>
          </div>
        )}

        {!warehouseLoading && !warehouse && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 p-6 text-center">
            <Store className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">No Warehouse Assigned</p>
            <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">Contact your manager to assign a warehouse to your profile.</p>
          </div>
        )}

        {/* POS Store Info */}
        {posStore && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border-2 border-emerald-200 dark:border-emerald-700 shadow-sm p-3.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Store className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{posStore.name}</p>
              <p className="text-xs text-slate-400">{posStore.display_id || "POS Store"}</p>
            </div>
          </div>
        )}

        {/* Today's Sales */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's POS Sales</p>
            <div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/40 px-2 py-1 rounded-full">
              <ShoppingCart className="h-3 w-3 text-violet-500" />
              <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                {salesLoading ? "…" : `${salesStats?.count ?? 0} sales`}
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {salesLoading ? <Loader2 className="h-6 w-6 animate-spin text-violet-500" /> : `₹${(salesStats?.total ?? 0).toLocaleString("en-IN")}`}
          </p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-700 dark:text-slate-200">₹{(salesStats?.cash ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-700 dark:text-slate-200">₹{(salesStats?.upi ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        {posStore && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenRecord()}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg active:scale-95 transition-all"
            >
              <ShoppingCart className="h-6 w-6 text-white" />
              <span className="text-[11px] font-bold text-white">Record Sale</span>
            </button>
            <button
              onClick={() => onOpenHistory()}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm active:scale-95 transition-all"
            >
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">View History</span>
            </button>
          </div>
        )}

        {/* Pending Orders */}
        {(ordersData?.pending.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Pending Orders</p>
            <div className="space-y-2">
              {ordersData?.pending.map((order: any) => (
                <div key={order.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{order.stores?.name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-400">₹{Number(order.total_amount || 0).toLocaleString("en-IN")}</p>
                  </div>
                  {order.display_id && (
                    <span className="text-[10px] font-mono text-slate-400">{order.display_id}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stock Movements */}
        {(stockMovements?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Stock Movements
            </p>
            <div className="space-y-1.5">
              {stockMovements?.slice(0, 5).map((mov: any) => {
                const isIncoming = mov.to_warehouse_id === warehouse?.id;
                const isOutgoing = mov.from_warehouse_id === warehouse?.id;
                return (
                  <div key={mov.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 flex items-center gap-3">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", isIncoming ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-amber-50 dark:bg-amber-900/30")}>
                      {isIncoming ? (
                        <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {mov.products?.name ?? "Product"}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{mov.remarks || (isIncoming ? "Stock received" : "Stock dispatched")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-xs font-bold", isIncoming ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                        {isIncoming ? "+" : "-"}{mov.quantity}
                      </p>
                      <p className="text-[9px] text-slate-400">
                        {new Date(mov.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Orders Today */}
        {(ordersData?.recent.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Today's Orders
            </p>
            <div className="space-y-1.5">
              {ordersData?.recent.map((order: any) => (
                <div key={order.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 flex items-center gap-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", order.status === "completed" || order.status === "delivered" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-blue-50 dark:bg-blue-900/30")}>
                    <ClipboardList className={cn("h-4 w-4", order.status === "completed" || order.status === "delivered" ? "text-emerald-500" : "text-blue-500")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{order.stores?.name ?? "Unknown"}</p>
                    <p className="text-[10px] text-slate-400">₹{Number(order.total_amount || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", order.status === "completed" || order.status === "delivered" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400")}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}