import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const POS_STORE_TYPE_ID = "00000000-0000-0000-0000-000000000001";

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

      const { data: posStore } = await supabase
        .from("stores")
        .select("id, display_id, name, warehouse_id, store_type_id, customer_id, outstanding")
        .eq("warehouse_id", wh.id)
        .eq("store_type_id", POS_STORE_TYPE_ID)
        .maybeSingle();

      return { warehouse: wh, posStore };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}