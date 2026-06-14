import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOperatorWarehouse(userId?: string) {
  return useQuery({
    queryKey: ["operator-warehouse", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data: wh } = await supabase
        .from("warehouses")
        .select("id, name, location, city")
        .eq("created_by", userId)
        .maybeSingle();

      if (!wh) return { warehouse: null, posStore: null };

      const { data: storeTypes } = await supabase
        .from("store_types")
        .select("id")
        .eq("name", "POS/Counter")
        .maybeSingle();

      if (!storeTypes) return { warehouse: wh, posStore: null };

      const { data: posStore } = await supabase
        .from("stores")
        .select("id, display_id, name, warehouse_id, store_type_id, customer_id, outstanding")
        .eq("warehouse_id", wh.id)
        .eq("store_type_id", storeTypes.id)
        .maybeSingle();

      return { warehouse: wh, posStore };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}