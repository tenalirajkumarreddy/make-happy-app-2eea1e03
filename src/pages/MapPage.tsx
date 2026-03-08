import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons for Leaflet + bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STORE_TYPE_COLORS: Record<string, string> = {
  default: "#3b82f6",
  inactive: "#94a3b8",
};

const TYPE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16",
];

const MapPage = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores-with-location"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, display_id, address, lat, lng, outstanding, is_active, phone, store_types(name), routes(name), customers(name)")
        .order("name");
      return data || [];
    },
  });

  const { data: activeSessions } = useQuery({
    queryKey: ["active-sessions-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name)")
        .eq("status", "active");
      return data || [];
    },
    refetchInterval: 30000,
  });

  const storesWithLocation = useMemo(() => stores?.filter((s) => s.lat && s.lng) || [], [stores]);
  const storesWithoutLocation = useMemo(() => stores?.filter((s) => !s.lat || !s.lng) || [], [stores]);

  // Build a color map for store types
  const storeTypeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    stores?.forEach((s: any) => {
      const typeName = s.store_types?.name || "Other";
      if (!map.has(typeName)) {
        map.set(typeName, TYPE_COLORS[map.size % TYPE_COLORS.length]);
      }
    });
    return map;
  }, [stores]);

  // Initialize & update Leaflet map
  useEffect(() => {
    if (!mapRef.current || storesWithLocation.length === 0) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        center: [20.5937, 78.9629], // India center
        zoom: 5,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(leafletMap.current);
    }

    const map = leafletMap.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add store markers
    const bounds: L.LatLngExpression[] = [];
    storesWithLocation.forEach((store: any) => {
      const typeName = store.store_types?.name || "Other";
      const color = !store.is_active
        ? STORE_TYPE_COLORS.inactive
        : (storeTypeColorMap.get(typeName) || STORE_TYPE_COLORS.default);

      const marker = L.circleMarker([store.lat!, store.lng!], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      const outstandingStr = `₹${Number(store.outstanding).toLocaleString()}`;
      marker.bindPopup(`
        <div style="min-width: 180px; font-family: system-ui, sans-serif;">
          <strong style="font-size: 14px;">${store.name}</strong>
          <div style="color: #666; font-size: 11px; margin: 2px 0;">${store.display_id}</div>
          <div style="margin-top: 6px; font-size: 12px;">
            <div><b>Customer:</b> ${store.customers?.name || "—"}</div>
            <div><b>Type:</b> ${typeName}</div>
            <div><b>Route:</b> ${store.routes?.name || "—"}</div>
            <div><b>Outstanding:</b> <span style="color: ${Number(store.outstanding) > 0 ? '#ef4444' : '#10b981'};">${outstandingStr}</span></div>
            ${store.phone ? `<div><b>Phone:</b> ${store.phone}</div>` : ""}
            ${store.address ? `<div style="margin-top:4px; color:#888;">${store.address}</div>` : ""}
          </div>
          <a href="https://www.google.com/maps?q=${store.lat},${store.lng}" target="_blank" rel="noopener" style="display:inline-block; margin-top:6px; font-size:11px; color:#3b82f6;">Open in Google Maps →</a>
        </div>
      `);

      bounds.push([store.lat!, store.lng!]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }

    return () => {};
  }, [storesWithLocation, storeTypeColorMap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return <TableSkeleton columns={3} rows={5} />;
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
                Agent → {session.routes?.name || "Route"}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Array.from(storeTypeColorMap.entries()).map(([name, color]) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: STORE_TYPE_COLORS.inactive }} />
          <span className="text-muted-foreground">Inactive</span>
        </div>
      </div>

      {/* Interactive Map */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {storesWithLocation.length > 0 ? (
          <div ref={mapRef} className="h-[500px] w-full" />
        ) : (
          <div className="flex flex-col items-center justify-center h-[400px] text-center px-6">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No stores with GPS coordinates</p>
            <p className="text-xs text-muted-foreground mt-1">Add GPS location to stores to see them on the map</p>
          </div>
        )}
      </div>

      {/* Stores without location */}
      {storesWithoutLocation.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Stores Missing GPS ({storesWithoutLocation.length})</h3>
          </div>
          <div className="divide-y max-h-[300px] overflow-y-auto">
            {storesWithoutLocation.map((store: any) => (
              <div key={store.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{store.name}</p>
                    <p className="text-xs text-muted-foreground">{store.customers?.name} • {store.display_id}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{store.address || "No address"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPage;