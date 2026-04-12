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

export function useStaffStock(options: UseStaffStockOptions = {}) {
  const { userId, warehouseId, enabled = true } = options;
  const queryClient = useQueryClient();

  // Query for staff stock items
  const { data: staffStock, isLoading: isLoadingStock, error: stockError } = useQuery({
    queryKey: ["staff-stock", userId, warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("staff_stock")
        .select(`
          id,
          user_id,
          product_id,
          warehouse_id,
          quantity,
          is_negative,
          amount_value,
          last_received_at,
          last_sale_at,
          transfer_count,
          product:products(id, name, sku, unit, base_price, image_url)
        `)
        .order("updated_at", { ascending: false });

      if (userId) {
        query = query.eq("user_id", userId);
      }
      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StaffStockItem[];
    },
    enabled,
  });

  // Query for staff inventory summary
  const { data: summary, isLoading: isLoadingSummary, error: summaryError } = useQuery({
    queryKey: ["staff-inventory-summary", warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("staff_inventory_summary")
        .select("*");

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StaffInventorySummary[];
    },
    enabled,
  });

  // Mutation to update staff stock
  const updateStock = useMutation({
    mutationFn: async ({
      staffStockId,
      quantity,
      reason,
    }: {
      staffStockId: string;
      quantity: number;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_stock")
        .update({
          quantity,
          is_negative: quantity < 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", staffStockId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-inventory-summary"] });
      toast.success("Stock updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update stock");
    },
  });

  // Mutation to transfer stock between staff
  const transferStock = useMutation({
    mutationFn: async ({
      fromUserId,
      toUserId,
      productId,
      quantity,
      warehouseId,
      reason,
    }: {
      fromUserId: string;
      toUserId: string;
      productId: string;
      quantity: number;
      warehouseId: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("transfer_staff_stock", {
        p_from_user_id: fromUserId,
        p_to_user_id: toUserId,
        p_product_id: productId,
        p_quantity: quantity,
        p_warehouse_id: warehouseId,
        p_reason: reason,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Stock transferred successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to transfer stock");
    },
  });

  return {
    staffStock,
    summary,
    isLoading: isLoadingStock || isLoadingSummary,
    error: stockError || summaryError,
    updateStock,
    transferStock,
  };
}

// Hook for getting a single user's stock
export function useMyStaffStock(userId?: string) {
  const queryClient = useQueryClient();

  const { data: myStock, isLoading, error } = useQuery({
    queryKey: ["my-staff-stock", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`
          id,
          product_id,
          warehouse_id,
          quantity,
          is_negative,
          amount_value,
          last_received_at,
          last_sale_at,
          product:products(id, name, sku, unit, base_price, image_url)
        `)
.eq("staff_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data || []) as StaffStockItem[];
    },
    enabled: !!userId,
  });

  // Calculate total value
  const totalValue = myStock?.reduce((sum, item) => sum + (item.amount_value || 0), 0) || 0;
  const totalQuantity = myStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const hasNegative = myStock?.some(item => item.is_negative) || false;

  return {
    myStock: myStock || [],
    totalValue,
    totalQuantity,
    hasNegative,
    isLoading,
    error,
  };
}
