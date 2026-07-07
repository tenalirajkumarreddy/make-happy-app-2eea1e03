import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleSession {
  id: string;
  vehicle_id: string;
  vehicle_plate?: string;
  start_time: string;
  end_time: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  total_distance_km: number | null;
  fuel_used_liters: number | null;
  fuel_cost: number | null;
  origin_warehouse_id: string | null;
  store_ids_visited: string[] | null;
  stop_count: number | null;
  status: string;
}

export function useVehicleSessions(vehicleId?: string) {
  return useQuery({
    queryKey: ["vehicle_sessions", vehicleId],
    queryFn: async (): Promise<VehicleSession[]> => {
      let query = supabase
        .from("vehicle_sessions")
        .select("*, vehicles!inner(plate_number)")
        .order("start_time", { ascending: false })
        .limit(100);

      if (vehicleId) {
        query = query.eq("vehicle_id", vehicleId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((s: any) => ({
        ...s,
        vehicle_plate: s.vehicles?.plate_number,
      }));
    },
  });
}

export function useVehicleSessionStops(sessionId: string | null) {
  return useQuery({
    queryKey: ["vehicle_session_stops", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("vehicle_session_stops")
        .select("*, stores!left(name)")
        .eq("session_id", sessionId)
        .order("arrival_time");

      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        store_name: s.stores?.name ?? null,
      }));
    },
    enabled: !!sessionId,
  });
}
