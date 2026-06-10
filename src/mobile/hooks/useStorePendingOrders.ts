import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PendingOrder {
  id: string;
  display_id: string;
  created_at: string;
  order_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    products: { id: string; name: string } | null;
  }>;
}

export function useStorePendingOrders(storeId?: string | null) {
  return useQuery({
    queryKey: ["mobile-pending-orders-for-store", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, display_id, created_at, order_items(id, product_id, quantity, unit_price, products(id, name))")
        .eq("store_id", storeId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PendingOrder[];
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}
