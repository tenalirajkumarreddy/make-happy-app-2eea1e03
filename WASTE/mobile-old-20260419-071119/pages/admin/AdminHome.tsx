import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Wallet, ClipboardList, HandCoins,
  ShoppingCart, Users, Store, Map, FileText, Settings,
  ChevronRight, Loader2, BarChart3, Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Props {
  onCloseMenu?: () => void;
}

interface PendingOrderRow {
  id: string;
  display_id: string | null;
  requirement_note: string | null;
  created_at: string;
  stores: { name: string } | null;
  customers: { name: string } | null;
}

interface RecentSaleRow {
  id: string;
  display_id: string;
  total_amount: number;
  created_at: string;
  stores: { name: string } | null;
}

export function AdminHome({ onCloseMenu }: Props) {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  const { data: todaySales } = useQuery({
    queryKey: ["admin-home-sales-today", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount")
        .gte("created_at", today);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: todayTx } = useQuery({
    queryKey: ["admin-home-tx-today", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("total_amount")
        .gte("created_at", today);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: activeOrdersCount } = useQuery({
    queryKey: ["admin-home-active-orders"],
    queryFn: async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed"]);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const { data: pendingHandovers } = useQuery({
    queryKey: ["admin-home-pending-handovers"],
    queryFn: async () => {
      const { count } = await supabase
        .from("handovers")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    refetchInterval: 120_000,
  });

  const { data: pendingOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-home-pending-orders-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, display_id, requirement_note, created_at, stores(name), customers(name)")
        .in("status", ["pending", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(3);
      return (data as unknown as PendingOrderRow[]) || [];
    },
    refetchInterval: 60_000,
  });

  const { data: recentSales } = useQuery({
    queryKey: ["admin-home-recent-sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, created_at, stores(name)")
        .order("created_at", { ascending: false })
        .limit(3);
      return (data as unknown as RecentSaleRow[]) || [];
    },
    refetchInterval: 60_000,
  });

  const totalSales = todaySales?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;
  const totalCollected = todayTx?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = (profile?.full_name ?? "Admin").split(" ")[0];
  const isAdmin = role === "super_admin";

  const goTo = (path: string) => {
    onCloseMenu?.();
    navigate(path);
  };

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        {/* Subtle decorative background blur */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium tracking-wide">{greeting()},</p>
            <h2 className="text-slate-900 dark:text-white text-2xl font-extrabold tracking-tight mt-0.5">{firstName}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                {isAdmin ? "Super Admin" : "Manager"}
              </span>
            </div>
          </div>
        </div>

        {/* High-Impact Main Metric */}
        <div className="mt-8">
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Total Revenue Today</p>
          <div className="flex items-baseline gap-2">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
              ₹{totalSales.toLocaleString("en-IN")}
            </h1>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">
              <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                ₹{totalCollected.toLocaleString("en-IN")} collected
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-6">
        {/* Mini KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            title="Active Orders"
            value={String(activeOrdersCount ?? 0)}
            icon={ClipboardList}
            color="amber"
          />
          <KpiCard
            title="Pending Handovers"
            value={String(pendingHandovers ?? 0)}
            icon={HandCoins}
            color="rose"
          />
        </div>

        {/* Action Shortcuts Horizontal Scroll */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Quick Actions</h3>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5 snap-x">
            <ShortcutBtn label="Sales" icon={ShoppingCart} onClick={() => goTo("/sales")} color="violet" />
            <ShortcutBtn label="Customers" icon={Users} onClick={() => goTo("/customers")} color="blue" />
            <ShortcutBtn label="Orders" icon={ClipboardList} onClick={() => goTo("/orders")} color="orange" />
            <ShortcutBtn label="Stores" icon={Store} onClick={() => goTo("/stores")} color="emerald" />
            <ShortcutBtn label="Map" icon={Map} onClick={() => goTo("/map")} color="teal" />
            <ShortcutBtn label="Reports" icon={FileText} onClick={() => goTo("/reports")} color="rose" />
            <ShortcutBtn label={isAdmin ? "Settings" : "Analytics"} icon={isAdmin ? Settings : BarChart3} onClick={() => goTo(isAdmin ? "/settings" : "/analytics")} color="slate" />
          </div>
        </div>

        {/* Priority Section: Orders */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Action Needed</h3>
            <button onClick={() => goTo("/orders")} className="text-[13px] font-semibold text-violet-600 dark:text-violet-400">See all</button>
          </div>
          
          {ordersLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
          ) : (pendingOrders?.length ?? 0) === 0 ? (
            <div className="py-6 text-center">
              <div className="h-12 w-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-2">
                <ClipboardList className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOrders!.map((order) => (
                <div key={order.id} onClick={() => goTo("/orders")} className="flex items-center gap-3 p-3 rounded-xl bg-orange-50/50 dark:bg-orange-500/5 hover:bg-orange-50 dark:hover:bg-orange-500/10 active:scale-[0.98] transition-all cursor-pointer border border-orange-100 dark:border-orange-500/10">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{order.stores?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{order.customers?.name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-orange-300 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity: Sales */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Recent Sales</h3>
            <button onClick={() => goTo("/sales")} className="text-[13px] font-semibold text-violet-600 dark:text-violet-400">See all</button>
          </div>
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm">
            {(recentSales ?? []).length === 0 ? (
               <div className="py-6 text-center">
                 <p className="text-sm font-medium text-slate-500">No sales yet today</p>
               </div>
            ) : (
              recentSales?.map((sale, i) => (
                <div key={sale.id} className={cn("flex items-center gap-3 p-3 active:bg-slate-50 dark:active:bg-slate-800 transition-colors", i !== recentSales.length - 1 && "border-b border-slate-100 dark:border-slate-800/50")}>
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-slate-900 dark:text-slate-100 truncate">{sale.stores?.name}</p>
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest">{sale.display_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-black text-slate-900 dark:text-white">₹{Number(sale.total_amount).toLocaleString("en-IN")}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ElementType; color: "amber" | "rose" }) {
  const colorMap = {
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
  };

  return (
    <div className="bg-white dark:bg-[#1a1d24] p-3.5 rounded-2xl shadow-sm flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h4 className="text-xl font-black text-slate-900 dark:text-white leading-none">{value}</h4>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{title}</p>
      </div>
    </div>
  );
}

function ShortcutBtn({ label, icon: Icon, onClick, color }: { label: string; icon: React.ElementType; onClick: () => void; color: string }) {
  const colorMap: Record<string, string> = {
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
    teal: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400",
  };

  return (
    <div onClick={onClick} className="snap-start flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform w-[72px] shrink-0">
      <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm", colorMap[color])}>
        <Icon className="h-6 w-6" />
      </div>
      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 tracking-tight">{label}</span>
    </div>
  );
}

