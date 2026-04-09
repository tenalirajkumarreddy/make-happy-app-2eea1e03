import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Smartphone, Users, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateLong } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  onOpenOrders: () => void;
  onOpenRecord: () => void;
  onOpenStores: () => void;
  onOpenAddEntity?: () => void;
}

export function MarketerHome({ onOpenOrders, onOpenRecord, onOpenStores }: Props) {
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
          {formatDateLong(new Date())}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Today Snapshot</p>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-4" />
                  </div>
                  <Skeleton className="h-6 w-16 mt-2" />
                </div>
              ))}
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
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onOpenOrders}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              <ClipboardList className="h-5 w-5 text-white" />
              <span className="text-[11px] font-bold text-white text-center">Orders</span>
            </button>
            <button
              onClick={onOpenRecord}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <Wallet className="h-5 w-5 text-emerald-500" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Record Payment</span>
            </button>
            <button
              onClick={onOpenStores}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <Users className="h-5 w-5 text-blue-500" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Stores</span>
            </button>
          </div>
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
