import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, ShoppingCart, TrendingUp, ArrowRightLeft, ClipboardList, Store, Banknote, Smartphone, ArrowDownToLine, ArrowUpFromLine, Factory, Package, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { useOperatorWarehouse } from "@/mobile/hooks/useOperatorWarehouse";

type Props = {
  onOpenRecord: () => void;
  onOpenHistory: () => void;
  onOpenInventory: () => void;
};

export function PosHome({ onOpenRecord, onOpenHistory, onOpenInventory }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { warehouse, posStore, isLoading: warehouseLoading } = useOperatorWarehouse(user?.id) as any;

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
        .is("deleted_at", null)
        .eq("is_fully_returned", false)
        .gte("created_at", `${today}T00:00:00`);
      const sales: any[] = data || [];
      return {
        total: sales.reduce((s, r) => s + Number(r.total_amount || 0), 0),
        cash: sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0),
        upi: sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0),
        count: sales.length,
      };
    },
    enabled: !!posStore,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  // Orders for the warehouse's stores
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["mobile-pos-orders", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return { pending: [] as any[], recent: [] as any[] };

      // Get all stores linked to this warehouse
      const { data: stores } = await supabase
        .from("stores")
        .select("id, name")
        .eq("warehouse_id", warehouse!.id);

      const storeIds = (stores || []).map(s => s.id);
      if (storeIds.length === 0) return { pending: [] as any[], recent: [] as any[] };

      const today = new Date().toISOString().split("T")[0];

      const [pendingRes, recentRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, display_id, status, total_amount, created_at, stores(id, name)")
          .in("store_id", storeIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("orders")
          .select("id, display_id, status, total_amount, created_at, stores(id, name)")
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
    staleTime: 60_000,
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
    staleTime: 60_000,
  });

  // Production runs today
  const { data: productionRuns = [] } = useQuery({
    queryKey: ["mobile-pos-production", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return [];
      const today = new Date().toISOString().split("T")[0];
      try {
        const { data } = await supabase
          .from("production_runs")
          .select("*, products(name)")
          .eq("warehouse_id", warehouse!.id)
          .gte("created_at", `${today}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(5);
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!warehouse,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  // Worker attendance today
  const { data: attendanceData } = useQuery({
    queryKey: ["mobile-pos-attendance", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return null;
      const today = new Date().toISOString().split("T")[0];
      try {
        const { data } = await supabase
          .from("attendance_entries")
          .select("id, status")
          .eq("warehouse_id", warehouse!.id)
          .eq("date", today);
        const entries = data || [];
        return {
          present: entries.filter((e: any) => e.status === "present").length,
          absent: entries.filter((e: any) => e.status === "absent").length,
          total: entries.length,
        };
      } catch {
        return null;
      }
    },
    enabled: !!warehouse,
    refetchInterval: 120_000,
    staleTime: 120_000,
  });

  // Pending invoices for this warehouse
  const { data: pendingInvoices = [] } = useQuery({
    queryKey: ["mobile-pos-invoices", warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return [];
      try {
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("warehouse_id", warehouse!.id);
        const storeIds = (stores || []).map((s: any) => s.id);
        if (storeIds.length === 0) return [];
        const { data } = await supabase
          .from("invoices")
          .select("id")
          .in("store_id", storeIds)
          .in("status", ["draft", "pending"]);
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!warehouse,
    refetchInterval: 120_000,
    staleTime: 120_000,
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

        {/* Core Ops Stats */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat icon={ShoppingCart} label="Sales" value={salesLoading ? "..." : `₹${(salesStats?.total ?? 0).toLocaleString("en-IN")}`} subValue={`${salesStats?.count ?? 0} txns`} color="from-violet-500 to-purple-600" />
          <MiniStat icon={ArrowRightLeft} label="Movements" value={String(stockMovements?.length ?? 0)} subValue="today" color="from-emerald-500 to-green-600" />
          <MiniStat icon={ClipboardList} label="Pending Orders" value={String(ordersData?.pending.length ?? 0)} color="from-amber-500 to-orange-600" />
          <MiniStat icon={Factory} label="Production" value={String(productionRuns.length)} subValue="runs today" color="from-blue-500 to-sky-600" />
          <MiniStat icon={Banknote} label="Invoices" value={String(pendingInvoices.length)} subValue="pending" color="from-rose-500 to-pink-600" />
          <MiniStat icon={Users} label="Workers" value={attendanceData ? String(attendanceData.present) : "—"} subValue={attendanceData ? `${attendanceData.absent} absent` : undefined} color="from-teal-500 to-cyan-600" />
        </div>

        {salesStats && salesStats.total > 0 && (
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-800 dark:text-white">₹{(salesStats?.cash ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-800 dark:text-white">₹{(salesStats?.upi ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {posStore && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenRecord()}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg active:scale-95 transition-all"
            >
              <ShoppingCart className="h-6 w-6 text-white" />
              <span className="text-xs font-bold text-white">Record Sale</span>
            </button>
            <button
              onClick={() => onOpenHistory()}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm active:scale-95 transition-all"
            >
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white">View History</span>
            </button>
            <button
              onClick={() => navigate("/production")}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm active:scale-95 transition-all"
            >
              <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Factory className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white">Production</span>
            </button>
            <button
              onClick={() => onOpenInventory()}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm active:scale-95 transition-all"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white">Inventory</span>
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
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    {order.created_at && <span className="text-2xs text-amber-500 font-medium">{timeAgo(order.created_at)}</span>}
                    {order.display_id && (
                      <span className="text-xs font-mono text-slate-400">{order.display_id}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Production */}
        {productionRuns.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
              <Factory className="h-3.5 w-3.5" />
              Today's Production
            </p>
            <div className="space-y-1.5">
              {productionRuns.slice(0, 3).map((run: any) => (
                <div key={run.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Factory className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{run.products?.name ?? "Product"}</p>
                    <p className="text-xs text-slate-400">Qty: {run.quantity ?? run.quantity_produced ?? 0}</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {new Date(run.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
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
                      <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">
                        {mov.products?.name ?? "Product"}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{mov.remarks || (isIncoming ? "Stock received" : "Stock dispatched")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-xs font-bold", isIncoming ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                        {isIncoming ? "+" : "-"}{mov.quantity}
                      </p>
                      <p className="text-xs text-slate-400">
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
                    <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{order.stores?.name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-400">₹{Number(order.total_amount || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", order.status === "completed" || order.status === "delivered" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400")}>
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

function MiniStat({ icon: Icon, label, value, subValue, color }: { icon: React.ElementType; label: string; value: string; subValue?: string; color: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide leading-none">{label}</p>
        <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{value}</p>
      {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
    </div>
  );
}