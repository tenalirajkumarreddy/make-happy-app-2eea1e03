import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Smartphone, Users, Wallet, MapPin, Store, Navigation2, ShoppingCart, CheckCircle2, ArrowRightLeft, Contact } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

interface Props {
  onOpenOrders: () => void;
  onOpenRecord: () => void;
  onOpenStores: () => void;
  onOpenAddEntity?: () => void;
  onOpenStore?: (store: StoreOption) => void;
  onGoRecord?: (store: StoreOption, action: "sale" | "payment") => void;
  onGoSale?: (store: StoreOption) => void;
  onGoCustomers?: () => void;
  onGoStockTransfers?: () => void;
  onGoMap?: () => void;
}

interface PendingOrderRow {
  id: string;
  display_id: string | null;
  stores: { id: string; name: string; phone: string | null; lat: number | null; lng: number | null; address: string | null } | null;
  customers: { name: string } | null;
}

interface RouteStore {
  id: string;
  name: string;
  display_id: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  outstanding: number;
  store_order: number | null;
  route_id: string | null;
  customers: { name: string } | null;
  routes: { name: string } | null;
}

export function MarketerHome({ onOpenOrders, onOpenRecord, onOpenStores, onOpenAddEntity, onOpenStore, onGoRecord, onGoSale, onGoCustomers, onGoStockTransfers, onGoMap }: Props) {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["mobile-marketer-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const [ordersRes, txnRes, customersRes] = await Promise.all([
        supabase.from("orders").select("id, status").eq("created_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount")
          .eq("recorded_by", user!.id).gte("created_at", `${today}T00:00:00`),
        supabase.from("customers").select("id").eq("is_active", true),
      ]);
      const orders: any[] = ordersRes.data || [];
      const todayTxns: any[] = txnRes.data || [];
      return {
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === "pending").length,
        todayCash: todayTxns.reduce((s, r) => s + Number(r.cash_amount || 0), 0),
        todayUpi: todayTxns.reduce((s, r) => s + Number(r.upi_amount || 0), 0),
        customerCount: customersRes.data?.length || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Pending orders for home display
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["mobile-marketer-pending-orders", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, display_id, stores(id, name, phone, lat, lng, address), customers(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as unknown as PendingOrderRow[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Active route session
  const { data: activeSession } = useQuery({
    queryKey: ["mobile-marketer-session", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, display_id, phone, lat, lng, address, outstanding, store_order, route_id, customers(name), routes(name)))")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Visits for route progress
  const { data: visits } = useQuery({
    queryKey: ["mobile-session-visits-marketer", activeSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .eq("session_id", activeSession!.id);
      return new Set((data || []).map((v) => v.store_id));
    },
    enabled: !!activeSession?.id,
  });

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  const firstName = (profile?.full_name ?? "Marketer").split(" ")[0];

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
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Today Snapshot</p>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={Users} label="Active Customers" value={String(stats?.customerCount ?? 0)} color="from-blue-500 to-blue-600" />
              <MiniStat icon={ClipboardList} label="My Orders" value={String(stats?.totalOrders ?? 0)} subValue={`${stats?.pendingOrders ?? 0} pending`} color="from-amber-500 to-orange-600" />
              <MiniStat icon={Wallet} label="Cash Collected" value={`₹${Number(stats?.todayCash ?? 0).toLocaleString("en-IN")}`} color="from-emerald-500 to-green-600" />
              <MiniStat icon={Smartphone} label="UPI Collected" value={`₹${Number(stats?.todayUpi ?? 0).toLocaleString("en-IN")}`} color="from-violet-500 to-purple-600" />
            </div>
          )}
        </div>

        {/*
        // Holding balance moved to History page
        */}

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Quick Actions</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onOpenOrders}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Orders</span>
            </button>
            <button
              onClick={onOpenRecord}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Record Payment</span>
            </button>
            <button
              onClick={onOpenStores}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                <Users className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Stores</span>
            </button>
            <button
              onClick={onGoCustomers}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Contact className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Customers</span>
            </button>
            <button
              onClick={onGoStockTransfers}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <ArrowRightLeft className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Stock Transfers</span>
            </button>
            <button
              onClick={() => onGoMap?.()}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Map View</span>
            </button>
            <button
              onClick={onOpenAddEntity}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                <Store className="h-4 w-4 text-white" />
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Add Store</span>
            </button>
          </div>
        </div>

        {/* Active Route Card */}
        {activeSession && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-sm">{activeSession?.routes?.name ?? "Route"}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {visits?.size ?? 0} of {activeSession?.routes?.stores?.length ?? 0} stores visited
                </p>
              </div>
              <Badge className="bg-emerald-500 text-white text-[10px] font-semibold">🟢 Active</Badge>
            </div>
            {activeSession?.routes?.stores?.length > 0 && (
              <div className="px-4 py-3">
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, ((visits?.size ?? 0) / activeSession.routes.stores.length) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Pending Orders</p>
            <div className="space-y-2">
              {pendingOrders.map((order) => (
                <div key={order.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {order.stores?.name ?? "Unknown Store"}
                      </p>
                      {order.customers?.name && (
                        <p className="text-xs text-slate-400 truncate">{order.customers.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {order.display_id && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700">
                          {order.display_id}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => {
                        if (onOpenStore && order.stores) {
                          onOpenStore({
                            id: order.stores.id,
                            name: order.stores.name,
                            display_id: "",
                            store_type_id: null,
                            customer_id: null,
                            outstanding: 0,
                            customers: order.customers ? { name: order.customers.name } : null,
                          } as StoreOption);
                        }
                      }}
                      className="flex-1 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center"
                    >
                      <Store className="h-3 w-3 mr-1" />
                      Open
                    </button>
                    {onGoRecord && order.stores && (
                      <button
                        onClick={() => {
                          onGoRecord({
                            id: order.stores!.id,
                            name: order.stores!.name,
                            display_id: "",
                            store_type_id: null,
                            customer_id: null,
                            outstanding: 0,
                            customers: order.customers ? { name: order.customers.name } : null,
                          } as StoreOption, "payment");
                        }}
                        className="flex-1 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center"
                      >
                        <Wallet className="h-3 w-3 mr-1" />
                        Pay
                      </button>
                    )}
                    {onGoSale && order.stores && (
                      <button
                        onClick={() => {
                          onGoSale({
                            id: order.stores!.id,
                            name: order.stores!.name,
                            display_id: "",
                            store_type_id: null,
                            customer_id: null,
                            outstanding: 0,
                            customers: order.customers ? { name: order.customers.name } : null,
                          } as StoreOption);
                        }}
                        className="flex-1 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-xs font-semibold flex items-center justify-center"
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Sale
                      </button>
                    )}
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
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">{label}</p>
        <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3 w-3 text-white" />
        </div>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {subValue && <p className="text-[11px] text-amber-500 mt-0.5">{subValue}</p>}
    </div>
  );
}
