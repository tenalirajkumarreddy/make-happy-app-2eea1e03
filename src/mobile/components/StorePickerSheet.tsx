import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Navigation2, Loader2, X, Store, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { useRouteAccess } from "@/hooks/useRouteAccess";

export interface StoreOption {
  id: string;
  name: string;
  display_id: string;
  photo_url?: string | null;
  outstanding: number;
  store_type_id: string | null;
  customer_id: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  route_id: string | null;
  is_active: boolean;
  customers: { name: string } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (store: StoreOption) => void;
  filterRouteId?: string | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function StorePickerSheet({ open, onOpenChange, onSelect, filterRouteId }: Props) {
  const { user, role } = useAuth();
  const { canAccessRoute, loading: loadingRouteAccess } = useRouteAccess(user?.id, role);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const fetchStores = async () => {
      setLoading(true);
      let q = supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, store_type_id, customer_id, lat, lng, address, phone, route_id, is_active, customers(name), store_types(name), routes(name)")
        .eq("is_active", true)
        .order("name");
      if (filterRouteId) q = q.eq("route_id", filterRouteId);
      const { data } = await q;
      setStores((data as unknown as StoreOption[]) || []);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    fetchStores();
  }, [open, filterRouteId]);

  const handleFindNearby = async () => {
    setLocating(true);
    const pos = await getCurrentPosition();
    if (pos) {
      setMyPos({ lat: pos.lat, lng: pos.lng });
    }
    setLocating(false);
  };

  const filtered = stores
    .filter((s) => canAccessRoute(s.route_id))
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.display_id?.toLowerCase().includes(q) ?? false) ||
        (s.customers?.name?.toLowerCase().includes(q) ?? false) ||
        (s.address?.toLowerCase().includes(q) ?? false)
      );
    })
    .map((s) => ({
      ...s,
      _dist:
        myPos && s.lat && s.lng
          ? haversineKm(myPos.lat, myPos.lng, s.lat, s.lng)
          : null,
    }))
    .sort((a, b) => {
      if (a._dist !== null && b._dist !== null) return a._dist - b._dist;
      if (a._dist !== null) return -1;
      if (b._dist !== null) return 1;
      return 0;
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl flex flex-col p-0">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Header with search */}
        <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="text-base font-bold">Select Store</SheetTitle>
          </SheetHeader>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID, customer..."
              className="pl-10 pr-10 h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            )}
          </div>

          {/* GPS button */}
          <button
            className={cn(
              "mt-2 w-full h-9 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all",
              myPos
                ? "border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-200 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400"
            )}
            onClick={handleFindNearby}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation2 className={cn("h-3.5 w-3.5", myPos ? "text-blue-500" : "")} />
            )}
            {myPos ? "✓ Sorted by distance" : "Find Nearest Stores"}
          </button>
        </div>

        {/* Store list */}
        <div className="flex-1 overflow-y-auto">
          {loading || loadingRouteAccess ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              <p className="text-sm text-slate-400">Loading stores...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No stores found</p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left px-3.5 py-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-750 transition-colors flex items-center gap-3 border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                  onClick={() => {
                    onSelect(s);
                    onOpenChange(false);
                    setQuery("");
                  }}
                >
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Store className="h-4.5 w-4.5 text-blue-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{s.name}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md font-mono">
                        {s.display_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {s.customers?.name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{s.customers.name}</span>
                      )}
                      {s.store_types?.name && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-slate-200 dark:border-slate-700 font-semibold">
                          {s.store_types.name}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Right: dist + balance */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    {s._dist !== null && (
                      <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-semibold">
                        <MapPin className="h-2.5 w-2.5" />
                        {s._dist < 1
                          ? `${(s._dist * 1000).toFixed(0)}m`
                          : `${s._dist.toFixed(1)}km`}
                      </span>
                    )}
                    <span className={cn(
                      "text-sm font-bold",
                      s.outstanding > 0 ? "text-red-500" : "text-emerald-500"
                    )}>
                      ₹{s.outstanding.toLocaleString("en-IN")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
