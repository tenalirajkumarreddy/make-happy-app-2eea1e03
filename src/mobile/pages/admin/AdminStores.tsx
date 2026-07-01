import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Store, MapPin, Phone, Map } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminStores() {
  const [search, setSearch] = useState("");
  const [filterRoute, setFilterRoute] = useState("all");

  const { data: stores, isLoading } = useQuery({
    queryKey: ["admin-mobile-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, address, phone, is_active, route_id, customers(name), store_types(name), routes(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 120_000,
  });

  const { data: routes } = useQuery({
    queryKey: ["admin-mobile-routes-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true).order("name");
      return (data as any[]) || [];
    },
  });

  const totalOutstanding = (stores || []).reduce((s: number, st: any) => s + Number(st.outstanding || 0), 0);

  const filtered = (stores || []).filter((s: any) => {
    const matchRoute = filterRoute === "all" || s.route_id === filterRoute;
    if (!search) return matchRoute;
    const q = search.toLowerCase();
    return matchRoute && (
      s.name?.toLowerCase().includes(q) ||
      s.display_id?.toLowerCase().includes(q) ||
      s.customers?.name?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-teal-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Active Stores</p>
          <div className="flex items-center gap-3">
            <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
              {stores?.length ?? 0}
            </h2>
          </div>
          
          <div className="mt-3 bg-red-50 dark:bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-100 dark:border-red-500/20">
            <p className="text-xs font-semibold text-red-600/80 dark:text-red-400/80 uppercase tracking-widest mb-0.5">Total Outstanding</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-400">₹{totalOutstanding.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex flex-col gap-2 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center pr-3">
            <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store, customer..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform shrink-0">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            )}
          </div>
          <div className="px-2 pb-2">
            <Select value={filterRoute} onValueChange={setFilterRoute}>
              <SelectTrigger className="h-10 text-[13px] font-medium bg-slate-50 dark:bg-slate-900 border-none rounded-xl">
                <div className="flex items-center gap-2">
                  <Map className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <SelectValue placeholder="All Routes" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl shrink-0">
                <SelectItem value="all">All Routes</SelectItem>
                {(routes || []).map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 mt-6 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Store Directory</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Store className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No stores found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search term or route</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s: any) => {
              const outstandingAmount = Number(s.outstanding);
              const hasOutstanding = outstandingAmount > 0;
              
              return (
                <div 
                  key={s.id} 
                  className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4 active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200/50 dark:border-slate-700/50 shadow-sm relative">
                      {s.photo_url ? (
                        <img src={s.photo_url} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/30 dark:to-cyan-900/30">
                          <Store className="h-6 w-6 text-teal-600/40 dark:text-teal-400/40" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="pr-2">
                          <h4 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
                            {s.name}
                          </h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0 inline-block mt-1">
                            {s.display_id}
                          </span>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <p className={cn(
                            "text-[15px] font-black tracking-tight", 
                            hasOutstanding ? "text-red-500 dark:text-red-400" : "text-emerald-500 dark:text-emerald-400"
                          )}>
                            ₹{outstandingAmount.toLocaleString("en-IN")}
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                            Outstanding
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {s.customers?.name && (
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                              {s.customers.name}
                            </p>
                          )}
                          {s.routes?.name && (
                            <p className="text-[11px] font-medium text-teal-600 dark:text-teal-400 truncate flex items-center gap-1.5 mt-1">
                              <Map className="h-3 w-3 shrink-0" />
                              {s.routes.name}
                            </p>
                          )}
                        </div>

                        {s.phone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`tel:${s.phone}`, "_self");
                            }}
                            className="h-8 w-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0 active:scale-90 transition-transform border border-slate-100 dark:border-slate-700"
                          >
                            <Phone className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                        )}
                      </div>
                    </div>
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
