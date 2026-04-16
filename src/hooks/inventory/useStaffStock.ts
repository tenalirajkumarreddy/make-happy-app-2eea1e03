import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StaffStockItem {
  id: string;
  user_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  is_negative: boolean;
  amount_value: number;
  last_received_at?: string;
  last_sale_at?: string;
  transfer_count: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
    image_url?: string;
  };
}

export interface StaffInventorySummary {
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  user_role?: string;
  warehouse_id: string;
  warehouse_name?: string;
  total_products: number;
  total_quantity: number;
  total_value: number;
  negative_products: number;
  negative_value: number;
  last_received?: string;
  last_sale?: string;
  total_transfers: number;
}

interface UseStaffStockOptions {
  userId?: string;
  warehouseId?: string;
  enabled?: boolean;
}

export function useStaffStockByWarehouse(warehouseId: string) {
  return useQuery({
    queryKey: ['staff-stock-by-warehouse', warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [];

    // Step 1: get staff_stock rows
    const { data: stockRows, error } = await supabase
      .from('staff_stock')
      .select(`
        id, user_id, warehouse_id, product_id, quantity, is_negative, amount_value,
        last_received_at, last_sale_at, transfer_count,
        product:products!staff_stock_product_id_fkey(id, name, sku, unit, base_price, image_url)
      `)
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0); // optional, adjust if zero is needed

      if (error) throw error;
      if (!stockRows?.length) return [];

      // Step 2: get profiles for those user_ids
      const userIds = [...new Set(stockRows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, email')
        .in('user_id', userIds);

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));

      // Step 3: group by user
      const grouped: Record<string, any> = {};
      for (const row of stockRows) {
        if (!grouped[row.user_id]) {
          const profile = profileMap[row.user_id];
          grouped[row.user_id] = {
            user_id: row.user_id,
            full_name: profile?.full_name ?? 'Unknown',
            email: profile?.email ?? '',
            avatar_url: profile?.avatar_url ?? null,
            items: [],
            totalValue: 0,
            totalQuantity: 0,
            negativeItems: 0
          };
        }
        grouped[row.user_id].items.push(row);
        grouped[row.user_id].totalValue += row.amount_value ?? 0;
        grouped[row.user_id].totalQuantity += row.quantity ?? 0;
        if (row.is_negative) grouped[row.user_id].negativeItems++;
      }

      return Object.values(grouped);
    },
    enabled: !!warehouseId
  });
}

// Deprecated or simplified proxy function if needed by other components
export function useStaffStock(options: UseStaffStockOptions = {}) {
  const { userId, warehouseId, enabled = true } = options;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-stock", userId, warehouseId],
    queryFn: async () => {
    let q = supabase
      .from('staff_stock')
      .select(`
        id, user_id, warehouse_id, product_id, quantity, is_negative, amount_value,
        last_received_at, last_sale_at, transfer_count,
        product:products!staff_stock_product_id_fkey(id, name, sku, unit, base_price, image_url)
      `);

      if (userId) q = q.eq('user_id', userId);
      if (warehouseId) q = q.eq('warehouse_id', warehouseId);

      const { data: stockRows, error } = await q;
      if (error) throw error;
      if (!stockRows?.length) return [];

      const userIds = [...new Set(stockRows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, email')
        .in('user_id', userIds);

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));

      return stockRows.map(item => ({
        ...item,
        profile: profileMap[item.user_id] || { full_name: 'Unknown User' }
      }));
    },
    enabled: enabled && (!!userId || !!warehouseId)
  });

  return {
    staffStock: data,
    isLoadingStock: isLoading,
    stockError: error
  };
}

// ... Additional mutations can go here ...
