import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Smartphone, Users, Wallet, Package } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onOpenOrders: () => void;
  onOpenRecord: () => void;
  onOpenStores: () => void;
  onOpenProducts?: () => void;
  onOpenAddEntity?: () => void;
}

export function MarketerHome({ onOpenOrders, onOpenRecord, onOpenStores, onOpenProducts, onOpenAddEntity }: Props) {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["mobile-marketer-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [ordersRes, txnRes, customersRes] = await Promise.all([
        supabase.from("orders").select("id, status").eq("created_by", user!.id),
        supabase
          .from("transactions")
          .select("cash_amount, upi_amount")
          .eq("recorded_by", user!.id)
          .gte("created_at", `${today}T00:00:00`),
        supabase.from("customers").select("id").eq("is_active", true),
      ]);

      const orders = ordersRes.data || [];
      const todayTxns = txnRes.data || [];

      return {
        totalOrders: orders.length,
        pendingOrders: orders.filter((order) => order.status === "pending").length,
        todayCash: todayTxns.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0),
        todayUpi: todayTxns.reduce((sum, row) => sum + Number(row.upi_amount || 0), 0),
        customerCount: customersRes.data?.length || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const firstName = (profile?.full_name ?? "Marketer").split(" ")[0];

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">Welcome,</p>
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
              <MiniStat icon={Users} label="Active Customers" value={String(stats?.customerCount ?? 0)} />
              <MiniStat icon={ClipboardList} label="My Orders" value={String(stats?.totalOrders ?? 0)} subValue={`${stats?.pendingOrders ?? 0} pending`} />
              <MiniStat icon={Wallet} label="Cash Collected" value={`₹${Number(stats?.todayCash ?? 0).toLocaleString("en-IN")}`} />
              <MiniStat icon={Smartphone} label="UPI Collected" value={`₹${Number(stats?.todayUpi ?? 0).toLocaleString("en-IN")}`} />
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Quick Actions</p>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={onOpenOrders}
              className="bg-card rounded-xl border p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <span className="font-medium text-sm">Orders</span>
            </div>

            <div
              onClick={onOpenRecord}
              className="bg-card rounded-xl border p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                <Wallet className="h-5 w-5" />
              </div>
              <span className="font-medium text-sm">Record Sale</span>
            </div>

            <div
              onClick={onOpenStores}
              className="bg-card rounded-xl border p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Users className="h-5 w-5" />
              </div>
              <span className="font-medium text-sm">Stores</span>
            </div>

            <div
              onClick={onOpenProducts}
              className="bg-card rounded-xl border p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Package className="h-5 w-5" />
              </div>
              <span className="font-medium text-sm">Products</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Manage Stores</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform"
              onClick={onOpenRecord}
            >
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-white">Record Visit</p>
            </button>

            <button
              className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform"
              onClick={onOpenStores}
            >
              <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-white">My Stores</p>
            </button>
            
            <button
               className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform"
               onClick={() => onOpenAddEntity?.()}
            >
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                 <Package className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-white">New Store</p>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 mt-8">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Today's Performance</p>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat icon={Users} label="New Customers" value="5" />
          <MiniStat icon={ClipboardList} label="Total Orders" value="32" subValue="12 pending" />
          <MiniStat icon={Wallet} label="Total Sales" value="₹12,340" />
          <MiniStat icon={Smartphone} label="UPI Payments" value="₹4,560" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, subValue }: { icon: React.ElementType; label: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {subValue && <p className="text-[11px] text-amber-500 mt-0.5">{subValue}</p>}
    </div>
  );
}
