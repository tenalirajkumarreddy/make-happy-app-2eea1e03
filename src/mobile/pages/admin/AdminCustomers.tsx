import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Users, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function AdminCustomers() {
  const [search, setSearch] = useState("");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin-mobile-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, display_id, phone, email, is_active, stores(id)")
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 120_000,
  });

  const filtered = (customers || []).filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.display_id?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const activeCount = (customers || []).filter((c: any) => c.is_active !== false).length;

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Customers Database</p>
          <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
            {customers?.length ?? 0}
          </h2>
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-full mt-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {activeCount} active
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex items-center pr-3 border-transparent focus-within:border-blue-500 dark:focus-within:border-blue-500 transition-colors border">
          <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, or ID..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform shrink-0">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-1 mt-6 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Directory</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No customers found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c: any) => (
              <div 
                key={c.id} 
                className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4 active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-500/20 dark:to-indigo-500/20 flex items-center justify-center shrink-0 border border-white dark:border-slate-800 shadow-sm">
                    <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                      {(c.name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="text-[16px] font-bold text-slate-900 dark:text-white truncate pr-2">
                        {c.name}
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                        {c.display_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {c.phone ? (
                        <span className="flex items-center gap-1 font-medium">
                          <Phone className="h-3 w-3 text-blue-500" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="italic opacity-50">No phone</span>
                      )}
                      <span className="flex items-center gap-1 font-medium">
                         <MapPin className="h-3 w-3 text-emerald-500" />
                        {c.stores?.length ?? 0} {c.stores?.length === 1 ? 'store' : 'stores'}
                      </span>
                    </div>
                  </div>

                  {c.phone && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`tel:${c.phone}`, "_self");
                      }}
                      className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                    >
                      <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
