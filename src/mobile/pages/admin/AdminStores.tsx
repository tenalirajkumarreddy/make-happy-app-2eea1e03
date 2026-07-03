import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Store, MapPin, Phone, Navigation2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StoreCard, type StoreCardAction } from "@/mobile/components/StoreCard";

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
                  <MapPin className="h- texts-teal-600 dark:text-teal-400" />
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
              const phone = s.phone || s.customers?.phone;
              const actions: StoreCardAction[] = [
                {
                  id: "navigate",
                  label: "Navigate",
                  icon: Navigation2,
                  onClick: () => {
                    if (s.lat && s.lng) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, "_blank");
                    } else if (s.address) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`, "_blank");
                    }
                  },
                  disabled: !s.lat && !s.lng && !s.address,
                  className: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800",
                },
                {
                  id: "call",
                  label: "Call",
                  icon: Phone,
                  onClick: () => phone && window.open(`tel:${phone}`, "_self"),
                  disabled: !phone,
                  className: "bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800",
                },
              ];
              return (
                <StoreCard
                  key={s.id}
                  store={s}
                  onOpenStore={() => {}}
                  actions={actions}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
