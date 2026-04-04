import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ShoppingCart, Calendar, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { MobileListSkeleton } from "@/components/shared/MobileListSkeleton";

export function AdminSales() {
  const [search, setSearch] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const { data: sales, isLoading } = useQuery({
    queryKey: ["admin-mobile-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, credit_amount, created_at, stores(name), customers(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 60_000,
  });

  const { data: todayStats } = useQuery({
    queryKey: ["admin-mobile-sales-today-stats", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("created_at", today);
      const total = (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      return { count: data?.length ?? 0, total };
    },
    refetchInterval: 60_000,
  });

  const filtered = (sales || []).filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.display_id?.toLowerCase().includes(q) ||
      s.stores?.name?.toLowerCase().includes(q) ||
      s.customers?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Total Sales Today</p>
          <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
            <span className="text-3xl font-bold text-slate-400 dark:text-slate-500 mr-1">₹</span>
            {(todayStats?.total ?? 0).toLocaleString("en-IN")}
          </h2>
          <div className="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 rounded-full">
            <TrendingUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              {todayStats?.count ?? 0} transactions
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex items-center pr-3 border-transparent focus-within:border-violet-500 dark:focus-within:border-violet-500 transition-colors border">
          <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store, customer, or ID..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform shrink-0">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-1 mt-6 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Records</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
        </div>

        {isLoading ? (
          <MobileListSkeleton items={6} showStats={false} titleWidth="w-36" />
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShoppingCart className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No sales found</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sale: any) => (
              <div 
                key={sale.id} 
                className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4 active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h4 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
                      {sale.stores?.name ?? "Store"}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {sale.customers?.name ?? "Customer"}
                    </p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md shrink-0">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tracking-widest uppercase">
                      {sale.display_id}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/50 flex items-end justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(sale.created_at), "dd MMM, hh:mm a")}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {Number(sale.cash_amount || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          CASH <span className="opacity-70">₹{Number(sale.cash_amount).toLocaleString("en-IN")}</span>
                        </span>
                      )}
                      {Number(sale.upi_amount || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded">
                          UPI <span className="opacity-70">₹{Number(sale.upi_amount).toLocaleString("en-IN")}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-widest">Total</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white leading-none">
                      ₹{Number(sale.total_amount).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
