import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, Users, Store, ShoppingCart, Banknote, Smartphone,
  HandCoins, AlertCircle, Package, Warehouse, Loader2,
  Receipt, ClipboardList, Map, BarChart3, FileText, Settings,
  Shield, UserCircle, Route, History as HistoryIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { supabase } from "@/integrations/supabase/client";

type StaffRole = "super_admin" | "manager";

interface Props {
  role: StaffRole;
  onNavigate: (path: string) => void;
}

export function AdminHome({ role, onNavigate }: Props) {
  const { profile } = useAuth();
  const { currentWarehouse } = useWarehouse();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["mobile-admin-dashboard", role, currentWarehouse?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      if (role === "manager" && currentWarehouse?.id) {
        // Manager: scoped to warehouse
        const [todaySalesRes, staffHandoversRes, pendingOrdersRes, lowStockRes, storesRes, customersRes] = await Promise.all([
          supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("warehouse_id", currentWarehouse.id).gte("created_at", today + "T00:00:00"),
          supabase.from("handovers").select("cash_amount, upi_amount, status").in("status", ["pending", "awaiting_confirmation"]).eq("warehouse_id", currentWarehouse.id),
          supabase.from("orders").select("id").eq("warehouse_id", currentWarehouse.id).eq("status", "pending"),
          supabase.from("product_stock").select("id, stock_quantity:quantity, products(name, is_active)").eq("warehouse_id", currentWarehouse.id).limit(100),
          supabase.from("stores").select("id, outstanding").eq("is_active", true).limit(500),
          supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_active", true),
        ]);

        const todaySales = todaySalesRes.data || [];
        const allStores = storesRes.data || [];

        return {
          todayTotal: todaySales.reduce((s, r: any) => s + Number(r.total_amount), 0),
          todayCash: todaySales.reduce((s, r: any) => s + Number(r.cash_amount), 0),
          todayUpi: todaySales.reduce((s, r: any) => s + Number(r.upi_amount), 0),
          pendingHandover: (staffHandoversRes.data || []).reduce((s, h: any) => s + Number(h.cash_amount || 0) + Number(h.upi_amount || 0), 0),
          pendingOrders: (pendingOrdersRes.data || []).length,
          lowStockCount: (lowStockRes.data || []).filter((item: any) => item?.products?.is_active !== false).filter((item: any) => Number(item.stock_quantity || 0) <= 10).length,
          totalOutstanding: allStores.reduce((s, r: any) => s + Number(r.outstanding), 0),
          overdueStores: allStores.filter((s: any) => Number(s.outstanding) > 0).length,
          customerCount: customersRes.count || 0,
          storeCount: allStores.length,
          warehouseName: currentWarehouse.name,
        };
      }

      // Super admin: global view
      const [todaySalesRes, customersRes, storesRes, warehousesRes, staffRes, pendingHandoversRes, lowStockRes, pendingOrdersRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").gte("created_at", today + "T00:00:00").limit(500),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("stores").select("id, outstanding").eq("is_active", true).limit(500),
        supabase.from("warehouses").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("staff_directory").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("handovers").select("cash_amount, upi_amount").in("status", ["pending", "awaiting_confirmation"]),
        supabase.from("product_stock").select("id, stock_quantity:quantity, products(name, is_active)").limit(100),
        supabase.from("orders").select("id").eq("status", "pending"),
      ]);

      const todaySales = todaySalesRes.data || [];
      const allStores = storesRes.data || [];

      return {
        todayTotal: todaySales.reduce((s, r: any) => s + Number(r.total_amount), 0),
        todayCash: todaySales.reduce((s, r: any) => s + Number(r.cash_amount), 0),
        todayUpi: todaySales.reduce((s, r: any) => s + Number(r.upi_amount), 0),
        pendingHandover: (pendingHandoversRes.data || []).reduce((s, h: any) => s + Number(h.cash_amount || 0) + Number(h.upi_amount || 0), 0),
        pendingOrders: (pendingOrdersRes.data || []).length,
        lowStockCount: (lowStockRes.data || []).filter((item: any) => item?.products?.is_active !== false).filter((item: any) => Number(item.stock_quantity || 0) <= 10).length,
        totalOutstanding: allStores.reduce((s, r: any) => s + Number(r.outstanding), 0),
        overdueStores: allStores.filter((s: any) => Number(s.outstanding) > 0).length,
        customerCount: customersRes.count || 0,
        storeCount: allStores.length,
        staffCount: staffRes.count || 0,
        warehouseCount: warehousesRes.count || 0,
        warehouseName: undefined,
      };
    },
    refetchInterval: 60_000,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = (profile?.full_name ?? (role === "super_admin" ? "Admin" : "Manager")).split(" ")[0];

  return (
    <div className="pb-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {role === "manager" && stats?.warehouseName
            ? `${stats.warehouseName} • `
            : role === "super_admin"
            ? "Admin Overview • "
            : ""}
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        {/* Revenue Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Revenue</p>
            {stats?.pendingOrders != null && stats.pendingOrders > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/40 px-2 py-1 rounded-full">
                <ClipboardList className="h-3 w-3 text-amber-500" />
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{stats.pendingOrders} pending</span>
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                ₹{(stats?.todayTotal ?? 0).toLocaleString("en-IN")}
              </p>
              <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Cash <strong className="text-slate-700 dark:text-slate-200">₹{(stats?.todayCash ?? 0).toLocaleString("en-IN")}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-violet-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    UPI <strong className="text-slate-700 dark:text-slate-200">₹{(stats?.todayUpi ?? 0).toLocaleString("en-IN")}</strong>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mini Stats Grid */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Outstanding" value={`₹${((stats?.totalOutstanding ?? 0) >= 1000 ? `${((stats?.totalOutstanding ?? 0) / 1000).toFixed(1)}k` : (stats?.totalOutstanding ?? 0).toLocaleString())}`} color="from-red-500 to-rose-600" icon={AlertCircle} />
            <MiniStat label="Handovers" value={`₹${((stats?.pendingHandover ?? 0) >= 1000 ? `${((stats?.pendingHandover ?? 0) / 1000).toFixed(1)}k` : (stats?.pendingHandover ?? 0).toLocaleString())}`} color="from-amber-500 to-orange-600" icon={HandCoins} />
            <MiniStat label="Low Stock" value={String(stats?.lowStockCount ?? 0)} color="from-violet-500 to-purple-600" icon={Package} />
          </div>
        )}

        {/* Entity Stats */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Customers" value={String(stats?.customerCount ?? 0)} color="from-cyan-500 to-blue-600" icon={Users} />
            <MiniStat label="Stores" value={String(stats?.storeCount ?? 0)} color="from-emerald-500 to-green-600" icon={Store} />
            {role === "super_admin" ? (
              <MiniStat label="Staff" value={String((stats as any)?.staffCount ?? 0)} color="from-blue-500 to-indigo-600" icon={UserCircle} />
            ) : (
              <MiniStat label="Overdue" value={`${stats?.overdueStores ?? 0} stores`} color="from-rose-500 to-red-600" icon={Store} />
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Quick Actions</p>
          <div className="grid grid-cols-4 gap-2">
            <QuickButton label="Sales" icon={ShoppingCart} onClick={() => onNavigate("/sales")} primary />
            <QuickButton label="Orders" icon={ClipboardList} onClick={() => onNavigate("/orders")} />
            <QuickButton label="Handovers" icon={HandCoins} onClick={() => onNavigate("/handovers")} />
            <QuickButton label="Inventory" icon={Warehouse} onClick={() => onNavigate("/inventory")} />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <QuickButton label="Customers" icon={Users} onClick={() => onNavigate("/customers")} />
            <QuickButton label="Stores" icon={Store} onClick={() => onNavigate("/stores")} />
            <QuickButton label="Products" icon={Package} onClick={() => onNavigate("/products")} />
            <QuickButton label="Reports" icon={FileText} onClick={() => onNavigate("/reports")} />
          </div>
        </div>

        {/* More Actions Grid */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">More</p>
          <div className="grid grid-cols-4 gap-2">
            <QuickButton label="Routes" icon={Route} onClick={() => onNavigate("/routes")} />
            <QuickButton label="Transactions" icon={Receipt} onClick={() => onNavigate("/transactions")} />
            <QuickButton label="Analytics" icon={BarChart3} onClick={() => onNavigate("/analytics")} />
            <QuickButton label="Map" icon={Map} onClick={() => onNavigate("/map")} />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <QuickButton label="Activity" icon={HistoryIcon} onClick={() => onNavigate("/activity")} />
            {role === "super_admin" && (
              <QuickButton label="Access" icon={Shield} onClick={() => onNavigate("/access-control")} />
            )}
            <QuickButton label="Settings" icon={Settings} onClick={() => onNavigate("/settings")} />
            <QuickButton label="Profile" icon={UserCircle} onClick={() => onNavigate("/profile")} />
          </div>
        </div>

        {/* Alerts Section */}
        {!isLoading && (stats?.totalOutstanding ?? 0) > 0 && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Outstanding Risk</p>
            </div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">₹{(stats?.totalOutstanding ?? 0).toLocaleString("en-IN")}</p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{stats?.overdueStores ?? 0} stores with balance</p>
          </div>
        )}

        {!isLoading && (stats?.lowStockCount ?? 0) > 0 && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Low Stock Alert</p>
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.lowStockCount ?? 0}</p>
            <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">Products below reorder level</p>
            <button
              className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 underline"
              onClick={() => onNavigate("/inventory")}
            >
              View Inventory →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ——— Shared components ———

interface MiniStatProps {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}

function MiniStat({ label, value, color, icon: Icon }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-2">
      <div className={`h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center ${color}`}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}

function QuickButton({ label, icon: Icon, onClick, primary }: { label: string; icon: React.ElementType; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-16 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all ${
        primary
          ? "bg-blue-600 hover:bg-blue-700 shadow-sm"
          : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750"
      }`}
    >
      <Icon className={`h-4 w-4 ${primary ? "text-white" : "text-blue-500"}`} />
      <span className={`text-[10px] font-semibold ${primary ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
    </button>
  );
}
