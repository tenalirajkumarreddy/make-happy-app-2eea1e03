import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Navigation2, Plus, Loader2, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CreateStoreWizard } from "@/components/stores/CreateStoreWizard";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  RETAIL: "bg-blue-500",
  RESTAURANT: "bg-orange-500",
  WHOLESALE: "bg-green-500",
  DEFAULT: "bg-muted-foreground",
};

function getTypeColor(typeName: string) {
  const key = typeName?.toUpperCase();
  return TYPE_COLORS[key] ?? TYPE_COLORS.DEFAULT;
}

export function AgentCustomers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showCreateStore, setShowCreateStore] = useState(false);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-customers-stores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select(
          "id, name, display_id, outstanding, address, phone, lat, lng, route_id, is_active, customers(id, name, phone), store_types(id, name), routes(name)"
        )
        .eq("is_active", true)
        .order("name");
      return (data as any[]) || [];
    },
    enabled: !!user,
  });

  const { data: routes } = useQuery({
    queryKey: ["mobile-routes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["mobile-store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return data || [];
    },
  });

  const filtered = (stores || []).filter((s: any) => {
    const q = query.toLowerCase();
    const matchSearch =
      !q ||
      s.name?.toLowerCase().includes(q) ||
      s.customers?.name?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q) ||
      s.display_id?.toLowerCase().includes(q);
    const matchRoute = filterRoute === "all" || s.route_id === filterRoute;
    const matchType = filterType === "all" || s.store_types?.id === filterType;
    return matchSearch && matchRoute && matchType;
  });

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleNavigate = (s: any) => {
    if (s.lat && s.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, "_blank");
    } else if (s.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`, "_blank");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter bar */}
      <div className="px-4 pb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search store, customer, address..."
            className="pl-9 pr-9 h-10 rounded-xl"
          />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={filterRoute} onValueChange={setFilterRoute}>
            <SelectTrigger className="h-8 text-xs rounded-lg flex-1">
              <SelectValue placeholder="All Routes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {(routes as any[])?.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs rounded-lg flex-1">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(storeTypes as any[])?.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stores list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No stores found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s: any) => {
              const typeName = s.store_types?.name ?? "";
              const colorClass = getTypeColor(typeName);
              const phone = s.phone || s.customers?.phone;
              return (
                <Card key={s.id} className="overflow-hidden">
                  <div className="flex">
                    {/* Colored left border */}
                    <div className={cn("w-1 shrink-0 rounded-l-xl", colorClass)} />
                    <CardContent className="p-3 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold truncate">{s.name}</span>
                            <span className="text-[10px] text-muted-foreground">({s.display_id})</span>
                          </div>
                          {s.customers?.name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{s.customers.name}</p>
                          )}
                          {s.address && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.address}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {typeName && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{typeName}</Badge>
                            )}
                            {s.routes?.name && (
                              <span className="text-[10px] text-muted-foreground/70">{s.routes.name}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-sm font-bold", s.outstanding > 0 ? "text-destructive" : "text-green-600")}>
                            ₹{Number(s.outstanding).toLocaleString()}
                          </p>
                          {s.outstanding > 0 && (
                            <p className="text-[10px] text-muted-foreground">Outstanding</p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1 rounded-lg"
                          onClick={() => handleNavigate(s)}
                          disabled={!s.lat && !s.lng && !s.address}
                        >
                          <Navigation2 className="h-3 w-3" />
                          Navigate
                        </Button>
                        {phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1 rounded-lg"
                            onClick={() => handleCall(phone)}
                          >
                            <Phone className="h-3 w-3" />
                            Call
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB — add store */}
      <button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
        onClick={() => setShowCreateStore(true)}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateStoreWizard
        open={showCreateStore}
        onOpenChange={setShowCreateStore}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["mobile-customers-stores"] });
          setShowCreateStore(false);
        }}
      />
    </div>
  );
}
