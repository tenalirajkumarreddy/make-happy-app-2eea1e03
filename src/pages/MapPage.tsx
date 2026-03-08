import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const TYPE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

const MapPage = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores-with-location"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, display_id, address, lat, lng, outstanding, is_active, phone, store_type_id, route_id, store_types(name), routes(name), customers(name)")
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
    refetchInterval: 15000,
  });

  // Get visited store IDs from active sessions
  const activeSessionIds = activeSessions?.map((s) => s.id) || [];
  const { data: visitedStoreIds } = useQuery({
    queryKey: ["visited-stores-map", activeSessionIds],
    queryFn: async () => {
      if (activeSessionIds.length === 0) return new Set<string>();
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .in("session_id", activeSessionIds);
      return new Set((data || []).map((v) => v.store_id));
    },
    enabled: activeSessionIds.length > 0,
    refetchInterval: 15000,
  });

  // Pending orders
  const { data: pendingOrderStoreIds } = useQuery({
    queryKey: ["pending-orders-map"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("store_id").eq("status", "pending");
      return new Set((data || []).map((o) => o.store_id));
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-for-map"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  // Route stores for route visualization
  const activeRouteStoreIds = useMemo(() => {
    if (!selectedRoute || !stores) return new Set<string>();
    return new Set(stores.filter((s: any) => s.route_id === selectedRoute).map((s: any) => s.id));
  }, [selectedRoute, stores]);

  const storesWithLocation = useMemo(() => stores?.filter((s: any) => s.lat && s.lng) || [], [stores]);
  const storesWithoutLocation = useMemo(() => stores?.filter((s: any) => !s.lat || !s.lng) || [], [stores]);

  const storeTypeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    stores?.forEach((s: any) => {
      const typeName = s.store_types?.name || "Other";
      if (!map.has(typeName)) map.set(typeName, TYPE_COLORS[map.size % TYPE_COLORS.length]);
    });
    return map;
  }, [stores]);

  useEffect(() => {
    if (!mapRef.current || storesWithLocation.length === 0) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        center: [20.5937, 78.9629],
        zoom: 5,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(leafletMap.current);
    }

    const map = leafletMap.current;
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.Polyline) {
        if (!(layer as any)._url) map.removeLayer(layer);
      }
    });

    const bounds: L.LatLngExpression[] = [];
    const routePoints: L.LatLngExpression[] = [];

    storesWithLocation.forEach((store: any) => {
      const typeName = store.store_types?.name || "Other";
      const isVisited = visitedStoreIds?.has(store.id);
      const hasPendingOrder = pendingOrderStoreIds?.has(store.id);
      const isOnRoute = activeRouteStoreIds.has(store.id);

      // Determine color based on visit status
      let color: string;
      if (!store.is_active) {
        color = "#94a3b8"; // inactive gray
      } else if (isVisited) {
        color = "#10b981"; // green - visited
      } else if (hasPendingOrder) {
        color = "#f59e0b"; // amber - has pending order
      } else {
        color = storeTypeColorMap.get(typeName) || "#3b82f6";
      }

      const radius = isOnRoute ? 10 : 8;

      const marker = L.circleMarker([store.lat!, store.lng!], {
        radius,
        fillColor: color,
        color: isOnRoute ? "#1d4ed8" : "#fff",
        weight: isOnRoute ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      const statusTag = isVisited ? '<span style="color:#10b981;font-weight:bold;">✓ Visited</span>' :
        hasPendingOrder ? '<span style="color:#f59e0b;font-weight:bold;">📦 Pending Order</span>' :
        '<span style="color:#94a3b8;">Not visited</span>';

      marker.bindPopup(`
        <div style="min-width: 200px; font-family: system-ui, sans-serif;">
          <strong style="font-size: 14px;">${store.name}</strong>
          <div style="color: #666; font-size: 11px; margin: 2px 0;">${store.display_id}</div>
          <div style="margin-top: 6px; font-size: 12px;">
            <div>${statusTag}</div>
            <div><b>Customer:</b> ${store.customers?.name || "—"}</div>
            <div><b>Type:</b> ${typeName}</div>
            <div><b>Route:</b> ${store.routes?.name || "—"}</div>
            <div><b>Outstanding:</b> <span style="color: ${Number(store.outstanding) > 0 ? '#ef4444' : '#10b981'};">₹${Number(store.outstanding).toLocaleString()}</span></div>
            ${store.phone ? `<div><b>Phone:</b> ${store.phone}</div>` : ""}
            ${store.address ? `<div style="margin-top:4px; color:#888;">${store.address}</div>` : ""}
          </div>
          <a href="https://www.google.com/maps?q=${store.lat},${store.lng}" target="_blank" rel="noopener" style="display:inline-block; margin-top:6px; font-size:11px; color:#3b82f6;">Open in Google Maps →</a>
        </div>
      `);

      bounds.push([store.lat!, store.lng!]);
      if (isOnRoute) routePoints.push([store.lat!, store.lng!]);
    });

    // Draw route line
    if (routePoints.length > 1) {
      L.polyline(routePoints, { color: "#3b82f6", weight: 3, opacity: 0.6, dashArray: "8 4" }).addTo(map);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [storesWithLocation, storeTypeColorMap, visitedStoreIds, pendingOrderStoreIds, activeRouteStoreIds]);

  useEffect(() => {
    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
    };
  }, []);

  if (isLoading) return <TableSkeleton columns={3} rows={5} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Map" subtitle="Store locations, visit status, and active agents" />

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

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
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
        <div className="rounded-xl border bg-card p-4 text-center hidden sm:block">
          <p className="text-2xl font-bold text-green-500">{visitedStoreIds?.size || 0}</p>
          <p className="text-xs text-muted-foreground">Visited Today</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center hidden sm:block">
          <p className="text-2xl font-bold text-amber-500">{pendingOrderStoreIds?.size || 0}</p>
          <p className="text-xs text-muted-foreground">Pending Orders</p>
        </div>
      </div>

      {/* Route filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedRoute}
          onChange={(e) => setSelectedRoute(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
        >
          <option value="">All Routes</option>
          {routes?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Legend */}
        {Array.from(storeTypeColorMap.entries()).map(([name, color]) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-green-500" />
          <span className="text-muted-foreground">Visited</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-amber-500" />
          <span className="text-muted-foreground">Pending Order</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-slate-400" />
          <span className="text-muted-foreground">Inactive</span>
        </div>
      </div>

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
