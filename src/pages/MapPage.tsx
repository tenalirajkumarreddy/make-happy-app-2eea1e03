import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";

const MapPage = () => {
  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores-with-location"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, display_id, address, lat, lng, outstanding, is_active, store_types(name), routes(name), customers(name)")
        .order("name");
      return data || [];
    },
  });

  const { data: activeSessions } = useQuery({
    queryKey: ["active-sessions-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name), profiles:user_id(full_name)")
        .eq("status", "active");
      return data || [];
    },
    refetchInterval: 30000, // refresh every 30s
  });

  const storesWithLocation = stores?.filter((s) => s.lat && s.lng) || [];
  const storesWithoutLocation = stores?.filter((s) => !s.lat || !s.lng) || [];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Map" subtitle="Store locations and active agents" />

      {/* Active sessions banner */}
      {activeSessions && activeSessions.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" />
            Active Route Sessions ({activeSessions.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {activeSessions.map((session: any) => (
              <Badge key={session.id} variant="secondary" className="text-xs">
                {(session as any).profiles?.full_name || "Agent"} → {(session as any).routes?.name || "Route"}
                <span className="ml-1 text-muted-foreground">since {new Date(session.started_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{stores?.length || 0}</p>
          <p className="text-xs text-muted-foreground">Total Stores</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-primary">{storesWithLocation.length}</p>
          <p className="text-xs text-muted-foreground">With GPS</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{storesWithoutLocation.length}</p>
          <p className="text-xs text-muted-foreground">Missing GPS</p>
        </div>
      </div>

      {/* Store list with coordinates */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Store Locations</h3>
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {stores?.map((store) => (
            <div key={store.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${store.lat ? "bg-primary/10" : "bg-muted"}`}>
                  <MapPin className={`h-4 w-4 ${store.lat ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">{store.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{(store as any).customers?.name}</span>
                    {(store as any).store_types?.name && <Badge variant="outline" className="text-[10px]">{(store as any).store_types.name}</Badge>}
                    {(store as any).routes?.name && <span>• {(store as any).routes.name}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {store.lat && store.lng ? (
                  <a
                    href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {store.lat.toFixed(4)}, {store.lng.toFixed(4)}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">No coordinates</span>
                )}
                <div className="mt-0.5">
                  <StatusBadge status={store.is_active ? "active" : "inactive"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
