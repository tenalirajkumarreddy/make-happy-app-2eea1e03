import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveSessionData {
  id: string;
  route_id: string;
  started_at?: string;
  current_lat?: number;
  current_lng?: number;
  routes?: {
    name: string;
    stores: Array<{
      id: string;
      name: string;
      display_id: string;
      photo_url?: string;
      address?: string;
      lat?: number;
      lng?: number;
      phone?: string;
      outstanding?: number;
      route_id?: string;
      store_type_id?: string;
      customer_id?: string;
      store_order?: number;
      customers?: { name: string } | null;
      store_types?: { name: string } | null;
    }>;
  };
}

export function useActiveSession(userId?: string | null, scope?: string) {
  return useQuery({
    queryKey: scope
      ? ["mobile-active-session", userId, scope]
      : ["mobile-active-session", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, display_id, photo_url, address, lat, lng, store_order, phone, outstanding, route_id, store_type_id, customer_id, customers(name), store_types(name), routes(name)))")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActiveSessionData | null) || null;
    },
    enabled: !!userId,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}
