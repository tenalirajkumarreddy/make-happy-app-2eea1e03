import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StockTransfer {
  id: string;
  display_id: string;
  transfer_type: string;
  status?: string;
  actual_quantity?: number;
  difference?: number;
  action_taken?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  from_warehouse_id?: string;
  from_user_id?: string;
  to_warehouse_id?: string;
  to_user_id?: string;
  product_id: string;
  quantity: number;
  description?: string;
  reference_id?: string;
  created_by?: string;
  created_at: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
    image_url?: string;
  };
  from_warehouse?: {
    id: string;
    name: string;
  };
  to_warehouse?: {
    id: string;
    name: string;
  };
  from_user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
  to_user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface TransferData {
  transferType: string;
  fromWarehouseId?: string;
  fromUserId?: string;
  toWarehouseId?: string;
  toUserId?: string;
  productId: string;
  quantity: number;
  description?: string;
}

interface UseStockTransferOptions {
  warehouseId?: string;
  userId?: string;
  limit?: number;
  enabled?: boolean;
}

export function useStockTransfer(options: UseStockTransferOptions = {}) {
  const { warehouseId, userId, limit = 50, enabled = true } = options;
  const queryClient = useQueryClient();

  // Query for stock transfers
  const { data: transfers, isLoading: isLoadingTransfers, error: transfersError } = useQuery({
    queryKey: ["stock-transfers", warehouseId, userId, limit],
    queryFn: async () => {
    const selectVariants = [
      `
      *,
      product:products!stock_transfers_product_id_fkey(id, name, sku, unit, base_price, image_url),
      from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(id, name),
      to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(id, name),
      from_user:profiles!stock_transfers_from_user_id_profiles_fkey(id, full_name, avatar_url),
      to_user:profiles!stock_transfers_to_user_id_profiles_fkey(id, full_name, avatar_url)
      `,
    ];

      let lastError: any = null;

      for (const selectClause of selectVariants) {
        let query = supabase
          .from("stock_transfers")
          .select(selectClause)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (warehouseId) {
          query = query.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`);
        }
        if (userId) {
          query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
        }

        const { data, error } = await query;
        if (!error) {
          return (data || []) as StockTransfer[];
        }
        lastError = error;
      }

      throw lastError;
    },
    enabled,
  });

  // Mutation to create a stock transfer
  const createTransfer = useMutation({
    mutationFn: async (transferData: TransferData) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;
      if (!currentUserId) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.rpc("record_stock_transfer" as any, {
        p_transfer_type: transferData.transferType,
        p_from_warehouse_id: transferData.fromWarehouseId ?? null,
        p_from_user_id: transferData.fromUserId ?? null,
        p_to_warehouse_id: transferData.toWarehouseId ?? null,
        p_to_user_id: transferData.toUserId ?? null,
        p_product_id: transferData.productId,
        p_quantity: transferData.quantity,
        p_description: transferData.description ?? null,
      } as any);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["source-stock-transfer"] });
      toast.success("Stock transfer completed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to transfer stock");
    },
  });

  // Mutation to cancel a transfer
  const cancelTransfer = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase
        .from("stock_transfers")
        .delete()
        .eq("id", transferId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Transfer cancelled");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to cancel transfer");
    },
  });

  return {
    transfers,
    isLoading: isLoadingTransfers,
    error: transfersError,
    createTransfer,
    cancelTransfer,
  };
}
