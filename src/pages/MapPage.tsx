import { PageHeader } from "@/components/shared/PageHeader";
import { getCurrentPosition } from "@/lib/proximity";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWarehouse } from "@/contexts/WarehouseContext";
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
  const userMarkerRef = useRef<L.Marker | null>(null);
  const agentMarkersRef = useRef<L.Marker[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const { currentWarehouse } = useWarehouse();

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-for-map"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores-with-location", filterType, currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("stores")
        .select("id, name, display_id, address, lat, lng, outstanding, is_active, phone, store_type_id, route_id, store_types(name), routes(name), customers(name)")
        .order("name")
        .limit(500);
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      if (filterType) query = query.eq("store_type_id", filterType);
      const { data } = await query;
      return data || [];
    },
  });

  const { data: activeSessions } = useQuery({
    queryKey: ["active-sessions-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("id, user_id, started_at, current_lat, current_lng, location_updated_at, routes(name), profiles(full_name)")
        .eq("status", "active") as any;
      return (data || []) as any[];
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
    queryKey: ["pending-orders-map", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any).from("orders").select("store_id").eq("status", "pending");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return new Set((data || []).map((o) => o.store_id));
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-for-map", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any).from("routes").select("id, name").eq("is_active", true);
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-map"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { map[s.key] = s.value || ""; });
      return map;
    },
  });

  const companyCoords = useMemo(() => {
    if (!companySettings) return null;
    const lat = parseFloat(companySettings.company_lat || "");
    const lng = parseFloat(companySettings.company_lng || "");
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
  }, [companySettings]);

  const locateMe = async () => {
    setLocating(true);
    const pos = await getCurrentPosition();
    if (pos) {
      setUserLocation(pos);
      leafletMap.current?.setView([pos.lat, pos.lng], 16);
    }
    setLocating(false);
  };

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
    if (!mapRef.current || (storesWithLocation.length === 0 && !companyCoords)) return;

    if (!leafletMap.current) {
      const initCenter: [number, number] = companyCoords
        ? [companyCoords.lat, companyCoords.lng]
        : storesWithLocation.length > 0
        ? [storesWithLocation[0].lat!, storesWithLocation[0].lng!]
        : [20.5937, 78.9629];
      const initZoom = companyCoords || storesWithLocation.length > 0 ? 13 : 5;
      leafletMap.current = L.map(mapRef.current, {
        center: initCenter,
        zoom: initZoom,
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

    // Company marker
    if (companyCoords) {
      const label = companySettings?.company_marker_label || companySettings?.company_name || "HQ";
      const companyIcon = L.divIcon({
        className: "",
        html: `<div style="background:#7c3aed;color:white;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 10px rgba(124,58,237,0.5);border:2px solid white;">${label}</div>`,
        iconAnchor: [0, 0],
      });
      L.marker([companyCoords.lat, companyCoords.lng], { icon: companyIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;min-width:180px;">
            <strong style="font-size:14px;">${companySettings?.company_name || "Company"}</strong>
            <div style="color:#7c3aed;font-size:12px;font-weight:600;">${label}</div>
            ${companySettings?.address ? `<div style="margin-top:4px;font-size:12px;color:#666;">${companySettings.address}</div>` : ""}
            ${companySettings?.customer_care_number ? `<div style="font-size:11px;color:#888;">${companySettings.customer_care_number}</div>` : ""}
            <a href="https://www.google.com/maps?q=${companyCoords.lat},${companyCoords.lng}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:11px;color:#7c3aed;">Open in Google Maps →</a>
          </div>
        `);
      bounds.push([companyCoords.lat, companyCoords.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [storesWithLocation, storeTypeColorMap, visitedStoreIds, pendingOrderStoreIds, activeRouteStoreIds, companyCoords, companySettings]);

  useEffect(() => {
    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
    };
  }, []);

  // User location marker
  useEffect(() => {
    if (!userLocation || !leafletMap.current) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 5px rgba(59,130,246,0.25);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, zIndexOffset: 2000 })
      .addTo(leafletMap.current)
      .bindPopup("<b>Your Location</b>");
    return () => { userMarkerRef.current?.remove(); userMarkerRef.current = null; };
  }, [userLocation]);

  // Agent location markers (real-time)
  useEffect(() => {
    if (!leafletMap.current) return;
    agentMarkersRef.current.forEach((m) => m.remove());
    agentMarkersRef.current = [];
    (activeSessions || []).forEach((session: any) => {
      if (!session.current_lat || !session.current_lng) return;
      const agentName = session.profiles?.full_name || "Agent";
      const routeName = session.routes?.name || "Route";
      const updatedAt = session.location_updated_at
        ? new Date(session.location_updated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : "";
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#7c3aed;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 8px rgba(124,58,237,0.5);">🚶</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([session.current_lat, session.current_lng], { icon, zIndexOffset: 3000 })
        .addTo(leafletMap.current!)
        .bindPopup(`<div style="font-family:system-ui;min-width:150px;"><strong>${agentName}</strong><div style="color:#7c3aed;font-size:12px;">${routeName}</div>${updatedAt ? `<div style="color:#888;font-size:11px;">Updated: ${updatedAt}</div>` : ""}</div>`);
      agentMarkersRef.current.push(marker);
    });
  }, [activeSessions]);

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
          <p className="text-2xl font-bold">{stores?.length || 0}{(stores?.length || 0) >= 500 ? "+" : ""}</p>
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

      {/* Route filter + My Location */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          >
            <option value="">All Routes</option>
            {routes?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          >
            <option value="">All Types</option>
            {storeTypes?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <Button variant="outline" size="sm" onClick={locateMe} disabled={locating} className="h-8 gap-1.5">
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            My Location
          </Button>
        </div>

        {/* Legend — wraps naturally on mobile */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {Array.from(storeTypeColorMap.entries()).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-full border border-white shadow-sm shrink-0" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-green-500 shrink-0" />
            <span className="text-muted-foreground">Visited</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-amber-500 shrink-0" />
            <span className="text-muted-foreground">Pending Order</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-slate-400 shrink-0" />
            <span className="text-muted-foreground">Inactive</span>
          </div>
          {companyCoords && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-[3px] border border-white shadow-sm bg-violet-600 shrink-0" />
              <span className="text-muted-foreground">{companySettings?.company_marker_label || "HQ"}</span>
            </div>
          )}
          {userLocation && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-full border border-white shadow-sm bg-blue-500 ring-2 ring-blue-200 shrink-0" />
              <span className="text-muted-foreground">You</span>
            </div>
          )}
          {activeSessions && activeSessions.some((s: any) => s.current_lat) && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-sm leading-none">🚶</span>
              <span className="text-muted-foreground">Agent (live)</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {storesWithLocation.length > 0 || companyCoords ? (
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
