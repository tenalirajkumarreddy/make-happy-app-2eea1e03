import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Navigation2, Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface StoreOption {
  id: string;
  name: string;
  display_id: string;
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
  /** If provided, only show stores on this route */
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
        .select(
          "id, name, display_id, outstanding, store_type_id, customer_id, lat, lng, address, phone, route_id, is_active, customers(name), store_types(name), routes(name)"
        )
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

  const handleFindNearby = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const filtered = stores
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
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col px-0 pt-0">
        <div className="px-4 pt-4 pb-2 border-b sticky top-0 bg-background z-10">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-base">Select Store</SheetTitle>
          </SheetHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search store name, ID, customer..."
              className="pl-9 pr-9 h-10 rounded-xl"
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full h-9 text-xs rounded-xl gap-1.5"
            onClick={handleFindNearby}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation2 className="h-3.5 w-3.5 text-blue-500" />
            )}
            {myPos ? "Sorted by distance" : "Find Nearest Stores (GPS)"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No stores found</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors flex items-start gap-3"
                  onClick={() => {
                    onSelect(s);
                    onOpenChange(false);
                    setQuery("");
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {s.display_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {s.customers?.name && (
                        <span className="text-xs text-muted-foreground">{s.customers.name}</span>
                      )}
                      {s.store_types?.name && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {s.store_types.name}
                        </Badge>
                      )}
                      {s.routes?.name && (
                        <span className="text-[10px] text-muted-foreground/70">{s.routes.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {s._dist !== null && (
                      <span className="text-xs text-blue-500 flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {s._dist < 1
                          ? `${(s._dist * 1000).toFixed(0)}m`
                          : `${s._dist.toFixed(1)}km`}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs font-medium",
                        s.outstanding > 0 ? "text-destructive" : "text-green-600"
                      )}
                    >
                      ₹{s.outstanding.toLocaleString()}
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
