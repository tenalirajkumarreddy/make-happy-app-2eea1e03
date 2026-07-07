import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TelemetryData } from "@/hooks/useVehicleTracking";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const vehicleIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 20px; height: 20px;
    background: #1a73e8;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface Props {
  telemetry: TelemetryData | null;
  plateNumber: string;
}

export default function VehicleMap({ telemetry, plateNumber }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapInstance.current) return;

    mapInstance.current = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([15.6, 79.6], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    if (telemetry?.lat && telemetry?.lng) {
      const latlng: L.LatLngExpression = [telemetry.lat, telemetry.lng];

      if (markerRef.current) {
        markerRef.current.setLatLng(latlng);
      } else {
        markerRef.current = L.marker(latlng, { icon: vehicleIcon })
          .addTo(mapInstance.current)
          .bindPopup(
            `<b>${plateNumber}</b><br/>
             Status: ${telemetry.status || "N/A"}<br/>
             Speed: ${telemetry.speed ?? "?"} km/h<br/>
             Fuel: ${telemetry.fuel_percentage ?? "?"}%<br/>
             Last: ${new Date(telemetry.timestamp).toLocaleTimeString()}`
          );
      }

      mapInstance.current.setView(latlng, mapInstance.current.getZoom() < 13 ? 13 : undefined);
    }
  }, [telemetry, plateNumber]);

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ minHeight: 300, height: "100%" }}>
      {!telemetry?.lat && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-[1000]">
          <p className="text-sm text-muted-foreground">
            {telemetry ? "No location data available" : "Select a vehicle to show on map"}
          </p>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
