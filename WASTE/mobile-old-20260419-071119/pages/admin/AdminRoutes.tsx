import { useQuery } from "@tanstack/react-query";
import { Loader2, Map, Store, Route as RouteIcon, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function AdminRoutes() {
  const { data: routes, isLoading } = useQuery({
    queryKey: ["admin-mobile-routes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, name, is_active, stores(id)")
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 120_000,
  });

  const activeCount = (routes || []).filter((r: any) => r.is_active).length;

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Service Routes</p>
          <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
            {routes?.length ?? 0}
          </h2>
          <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-500/10 px-3 py-1.5 rounded-full mt-1 border border-sky-100 dark:border-sky-500/20">
            <RouteIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
              {activeCount} Active Routes
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <div className="flex items-center justify-between px-1 mt-4 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">All Routes</h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
          </div>
        ) : (routes?.length ?? 0) === 0 ? (
           <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Map className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No routes found</p>
            <p className="text-xs text-slate-500 mt-1">Add routes via the web dashboard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(routes || []).map((r: any) => (
              <div 
                key={r.id} 
                className={cn(
                  "rounded-2xl shadow-sm p-4 transition-all relative overflow-hidden active:scale-[0.98]",
                  r.is_active 
                    ? "bg-white dark:bg-[#1a1d24] border border-transparent hover:border-slate-200 dark:hover:border-slate-800" 
                    : "bg-slate-50 dark:bg-[#1a1d24]/50 border border-slate-100 dark:border-slate-800 opacity-80"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    r.is_active 
                      ? "bg-sky-500 text-white shadow-sky-500/20" 
                      : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                  )}>
                    <Navigation className="h-6 w-6" />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className={cn("text-base font-bold truncate pr-3", 
                        r.is_active ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"
                      )}>
                        {r.name}
                      </p>
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 border",
                        r.is_active 
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" 
                          : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                      )}>
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    
                    <div className={cn("flex items-center gap-1.5 mt-2", 
                      r.is_active ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"
                    )}>
                      <Store className="h-3.5 w-3.5" /> 
                      <span className="text-sm font-medium">{r.stores?.length ?? 0} connected stores</span>
                    </div>
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
