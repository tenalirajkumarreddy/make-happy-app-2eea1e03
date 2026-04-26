import { useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins, History, Loader2, ShoppingCart, Smartphone, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  onOpenRecord: () => void;
  onOpenHistory: () => void;
};

export function PosHome({ onOpenRecord, onOpenHistory }: Props) {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["mobile-pos-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const [salesRes, handoversRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount")
          .eq("recorded_by", user!.id).gte("created_at", `${today}T00:00:00`),
        supabase.from("handovers").select("cash_amount, upi_amount, status")
          .eq("user_id", user!.id),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (handoversRes.error) throw handoversRes.error;
      const todaySales = salesRes.data || [];
      const pendingHandover = (handoversRes.data || [])
        .filter(h => h.status === "pending" || h.status === "awaiting_confirmation")
        .reduce((s, h) => s + Number(h.cash_amount || 0) + Number(h.upi_amount || 0), 0);
      return {
        totalSales: todaySales.reduce((s, r) => s + Number(r.total_amount || 0), 0),
        totalCash: todaySales.reduce((s, r) => s + Number(r.cash_amount || 0), 0),
        totalUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount || 0), 0),
        salesCount: todaySales.length,
        pendingHandover,
      };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  const firstName = (profile?.full_name ?? "POS").split(" ")[0];
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-IN");

  return (
    <div className="pb-6">
      {/* Gradient Hero Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}<span>Point of Sale</span>
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        {/* Floating Revenue Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Sales</p>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
              <ShoppingCart className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                {isLoading ? "…" : `${stats?.salesCount ?? 0} sales`}
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-blue-500" /> : `₹${(stats?.totalSales ?? 0).toLocaleString("en-IN")}`}
          </p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-700 dark:text-slate-200">₹{(stats?.totalCash ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-700 dark:text-slate-200">₹{(stats?.totalUpi ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>

        {/* Mini Stats */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Cash" value={`₹${fmtK(stats?.totalCash ?? 0)}`} color="from-emerald-500 to-green-600" icon={Banknote} />
          <MiniStat label="UPI" value={`₹${fmtK(stats?.totalUpi ?? 0)}`} color="from-violet-500 to-purple-600" icon={Smartphone} />
          <MiniStat label="Handover" value={`₹${fmtK(stats?.pendingHandover ?? 0)}`} color="from-amber-500 to-orange-600" icon={HandCoins} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-5">
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onOpenRecord}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg active:scale-95 transition-all"
          >
            <ShoppingCart className="h-6 w-6 text-white" />
            <span className="text-[11px] font-bold text-white">Record Sale</span>
          </button>
          <button
            onClick={onOpenHistory}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">History</span>
          </button>
          <button
            onClick={onOpenRecord}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all"
          >
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <HandCoins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Handover</span>
          </button>
        </div>
      </div>

      {/* Today's Summary Card */}
      <div className="px-4 mt-5">
        <SectionLabel>Today's Summary</SectionLabel>
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4">
          <div className="space-y-3">
            <SummaryRow label="Total Sales" value={`₹${(stats?.totalSales ?? 0).toLocaleString("en-IN")}`} icon={TrendingUp} iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor="text-blue-500" />
            <SummaryRow label="Cash Collected" value={`₹${(stats?.totalCash ?? 0).toLocaleString("en-IN")}`} icon={Banknote} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-500" />
            <SummaryRow label="UPI Collected" value={`₹${(stats?.totalUpi ?? 0).toLocaleString("en-IN")}`} icon={Smartphone} iconBg="bg-violet-50 dark:bg-violet-900/30" iconColor="text-violet-500" />
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <SummaryRow label="Pending Handover" value={`₹${(stats?.pendingHandover ?? 0).toLocaleString("en-IN")}`} icon={HandCoins} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-500" highlight />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">{children}</p>;
}

function MiniStat({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon: React.ElementType }) {
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

function SummaryRow({ label, value, icon: Icon, iconBg, iconColor, highlight }: { label: string; value: string; icon: React.ElementType; iconBg: string; iconColor: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className={cn("text-sm font-bold tabular-nums", highlight ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-white")}>{value}</p>
    </div>
  );
}
