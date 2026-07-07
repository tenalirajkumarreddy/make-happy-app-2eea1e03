import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleWithIntegration {
  id: string;
  plate_number: string;
  status: string;
  is_tracked: boolean;
  intangles_v_id: string | null;
}

export interface TelemetryData {
  id: string;
  vehicle_id: string;
  timestamp: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  heading: number | null;
  fuel_amount: number | null;
  fuel_percentage: number | null;
  adblue_level: number | null;
  adblue_percentage: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  status: string | null;
  connection_status: boolean | null;
  dtc_count: number;
  has_warning_lamps: boolean;
}

export interface FleetSummary {
  moving: number;
  parked: number;
  idling: number;
  stopped: number;
  out_of_network: number;
  sleeping: number;
  charging: number;
  connected: number;
  disconnected: number;
}

export function useVehiclesWithIntegrations() {
  return useQuery({
    queryKey: ["vehicles", "with-integrations"],
    queryFn: async (): Promise<VehicleWithIntegration[]> => {
      const { data: vehicles, error: ve } = await supabase
        .from("vehicles")
        .select("id, plate_number, status")
        .order("plate_number");

      if (ve) throw ve;

      const { data: integrations, error: ie } = await supabase
        .from("vehicle_integrations")
        .select("vehicle_id, intangles_v_id, is_tracked");

      if (ie) throw ie;

      const integMap = new Map(
        integrations?.map((i: any) => [i.vehicle_id, i]) ?? []
      );

      return (vehicles ?? []).map((v: any) => {
        const integ = integMap.get(v.id);
        return {
          id: v.id,
          plate_number: v.plate_number,
          status: v.status,
          is_tracked: integ?.is_tracked ?? false,
          intangles_v_id: integ?.intangles_v_id ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useLatestTelemetry(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle_telemetry", "latest", vehicleId],
    queryFn: async (): Promise<TelemetryData | null> => {
      if (!vehicleId) return null;
      const { data, error } = await supabase
        .from("vehicle_telemetry")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("timestamp", { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data?.[0] as TelemetryData) ?? null;
    },
    enabled: !!vehicleId,
    refetchInterval: 10_000,
  });
}

export function useFleetSummary() {
  return useQuery({
    queryKey: ["vehicle_fleet_summary"],
    queryFn: async (): Promise<FleetSummary | null> => {
      const { data, error } = await supabase
        .from("vehicle_fleet_summary")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return data?.[0] as FleetSummary ?? null;
    },
    refetchInterval: 15_000,
  });
}
