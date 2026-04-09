import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Receipt, Calendar, IndianRupee, Store, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function AdminTransactions() {
  const [search, setSearch] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["admin-mobile-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, stores(name), customers(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 60_000,
  });

  const { data: todayStats } = useQuery({
    queryKey: ["admin-mobile-tx-today-stats", today],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("total_amount").gte("created_at", today);
      const total = (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      return { count: data?.length ?? 0, total };
    },
    refetchInterval: 60_000,
  });

  const filtered = (transactions || []).filter((t: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.display_id?.toLowerCase().includes(q) ||
      t.stores?.name?.toLowerCase().includes(q) ||
      t.customers?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-teal-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Today's Collections</p>
          <div className="flex items-center justify-center">
            <h2 className="text-emerald-600 dark:text-emerald-400 text-5xl font-black tracking-tighter mt-1 mb-2 flex items-center">
              <IndianRupee className="h-9 w-9 -mr-1 text-emerald-600/50 dark:text-emerald-400/50" />
              {(todayStats?.total ?? 0).toLocaleString("en-IN")}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full mt-1">
            <Receipt className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {todayStats?.count ?? 0} payments today
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex items-center pr-3 border-transparent focus-within:border-emerald-500 dark:focus-within:border-emerald-500 transition-colors border">
          <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores, customers, ID..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform shrink-0">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-1 mt-6 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Recent Transactions</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Receipt className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No transactions found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((tx: any) => {
              const cashAmt = Number(tx.cash_amount || 0);
              const upiAmt = Number(tx.upi_amount || 0);
              const hasSplitPayment = cashAmt > 0 && upiAmt > 0;
              
              return (
                <div 
                  key={tx.id} 
                  className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4 active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {tx.display_id}
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(tx.created_at), "dd MMM, hh:mm a")}
                        </span>
                      </div>
                      
                      <h4 className="text-[15px] font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5 mt-2">
                        <Store className="h-4 w-4 text-slate-400 shrink-0" />
                        {tx.stores?.name ?? "Store"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate pl-5.5 mt-0.5">
                        {tx.customers?.name ?? "Customer"}
                      </p>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center justify-end tracking-tight">
                        <IndianRupee className="h-4 w-4 -mr-0.5" />
                        {Number(tx.total_amount).toLocaleString("en-IN")}
                      </p>
                      <div className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase mt-0.5",
                         hasSplitPayment ? "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      )}>
                        <Wallet className="h-2.5 w-2.5" />
                        {hasSplitPayment ? "Split" : (cashAmt > 0 ? "Cash" : "UPI")}
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800/50 flex items-center gap-4">
                    {cashAmt > 0 && (
                      <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 flex justify-between items-center border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-semibold text-slate-500">Cash</span>
                        <span className="font-bold text-slate-900 dark:text-white text-[13px]">₹{cashAmt.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {upiAmt > 0 && (
                      <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 flex justify-between items-center border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-semibold text-slate-500">UPI</span>
                        <span className="font-bold text-slate-900 dark:text-white text-[13px]">₹{upiAmt.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
