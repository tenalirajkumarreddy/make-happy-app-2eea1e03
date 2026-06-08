import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

const visitedIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const agentIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapStore {
  id: string;
  name: string;
  display_id: string;
  lat: number | null;
  lng: number | null;
  visited: boolean;
  outstanding: number;
}

interface Props {
  stores: MapStore[];
  agentLocation?: { lat: number; lng: number } | null;
  onStoreClick?: (storeId: string) => void;
  className?: string;
}

function MapBoundsUpdater({ stores, agentLocation }: { stores: MapStore[]; agentLocation?: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    stores.forEach((store) => {
      if (store.lat != null && store.lng != null) {
        points.push([store.lat, store.lng]);
      }
    });
    if (agentLocation?.lat != null && agentLocation?.lng != null) {
      points.push([agentLocation.lat, agentLocation.lng]);
    }
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [stores, agentLocation, map]);

  return null;
}

export function RouteMap({ stores, agentLocation, onStoreClick, className }: Props) {
  const validStores = stores.filter((s) => s.lat != null && s.lng != null);
  const routePoints: [number, number][] = validStores.map((s) => [s.lat!, s.lng!]);

  const center: [number, number] = validStores.length > 0
    ? [validStores[0].lat!, validStores[0].lng!]
    : agentLocation
      ? [agentLocation.lat, agentLocation.lng]
      : [20.5937, 78.9629];

  return (
    <div className={cn("rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700", className)}>
      <MapContainer
        center={center}
        zoom={13}
        className="h-[300px] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsUpdater stores={stores} agentLocation={agentLocation} />
        {routePoints.length > 1 && (
          <Polyline positions={routePoints} color="#3B82F6" dashArray="10, 10" weight={3} opacity={0.7} />
        )}
        {validStores.map((store) => (
          <Marker
            key={store.id}
            position={[store.lat!, store.lng!]}
            icon={store.visited ? visitedIcon : undefined}
            eventHandlers={onStoreClick ? { click: () => onStoreClick(store.id) } : undefined}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{store.name}</p>
                <p className="text-xs text-muted-foreground">{store.display_id}</p>
                <p className="text-xs">Outstanding: ₹{Number(store.outstanding).toLocaleString("en-IN")}</p>
                <p className="text-xs">{store.visited ? "Visited" : "Pending"}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {agentLocation?.lat != null && agentLocation?.lng != null && (
          <Marker position={[agentLocation.lat, agentLocation.lng]} icon={agentIcon}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">Your Location</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
