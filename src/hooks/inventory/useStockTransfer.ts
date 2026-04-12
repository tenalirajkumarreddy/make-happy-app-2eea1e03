import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StockTransfer {
  id: string;
  display_id: string;
  transfer_type: string;
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
      let query = supabase
        .from("stock_transfers")
        .select(`
          *,
          product:products(id, name, sku, unit, base_price, image_url),
          from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(id, name),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(id, name),
          from_user:profiles!stock_transfers_from_user_id_fkey(id, full_name, avatar_url),
          to_user:profiles!stock_transfers_to_user_id_fkey(id, full_name, avatar_url)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (warehouseId) {
        query = query.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`);
      }
      if (userId) {
        query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StockTransfer[];
    },
    enabled,
  });

  // Mutation to create a stock transfer
  const createTransfer = useMutation({
    mutationFn: async (transferData: TransferData) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      // Generate display ID
      const displayId = `STF-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Insert transfer record
      const { data: transfer, error: transferError } = await supabase
        .from("stock_transfers")
        .insert({
          display_id: displayId,
          transfer_type: transferData.transferType,
          from_warehouse_id: transferData.fromWarehouseId,
          from_user_id: transferData.fromUserId,
          to_warehouse_id: transferData.toWarehouseId,
          to_user_id: transferData.toUserId,
          product_id: transferData.productId,
          quantity: transferData.quantity,
          description: transferData.description,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (transferError) throw transferError;

      // Handle stock updates based on transfer type
      switch (transferData.transferType) {
        case "warehouse_to_staff":
          // Deduct from warehouse
          await supabase.rpc("record_stock_movement", {
            p_product_id: transferData.productId,
            p_warehouse_id: transferData.fromWarehouseId!,
            p_quantity: -transferData.quantity,
            p_type: "transfer_out",
            p_reason: `Transfer to staff: ${transferData.description || ""}`,
            p_user_id: currentUserId,
          });

          // Add to staff stock
          await supabase.rpc("add_staff_stock", {
            p_user_id: transferData.toUserId!,
            p_warehouse_id: transferData.fromWarehouseId!,
            p_product_id: transferData.productId,
            p_quantity: transferData.quantity,
          });
          break;

        case "staff_to_warehouse":
          // Deduct from staff
          await supabase.rpc("deduct_staff_stock", {
            p_user_id: transferData.fromUserId!,
            p_product_id: transferData.productId,
            p_quantity: transferData.quantity,
          });

          // Add to warehouse
          await supabase.rpc("record_stock_movement", {
            p_product_id: transferData.productId,
            p_warehouse_id: transferData.toWarehouseId!,
            p_quantity: transferData.quantity,
            p_type: "transfer_in",
            p_reason: `Transfer from staff: ${transferData.description || ""}`,
            p_user_id: currentUserId,
          });
          break;

        case "warehouse_to_warehouse":
          // Deduct from source warehouse
          await supabase.rpc("record_stock_movement", {
            p_product_id: transferData.productId,
            p_warehouse_id: transferData.fromWarehouseId!,
            p_quantity: -transferData.quantity,
            p_type: "transfer_out",
            p_reason: `Transfer to warehouse: ${transferData.description || ""}`,
            p_user_id: currentUserId,
          });

          // Add to destination warehouse
          await supabase.rpc("record_stock_movement", {
            p_product_id: transferData.productId,
            p_warehouse_id: transferData.toWarehouseId!,
            p_quantity: transferData.quantity,
            p_type: "transfer_in",
            p_reason: `Transfer from warehouse: ${transferData.description || ""}`,
            p_user_id: currentUserId,
          });
          break;

        case "staff_to_staff":
          // Deduct from source staff
          await supabase.rpc("deduct_staff_stock", {
            p_user_id: transferData.fromUserId!,
            p_product_id: transferData.productId,
            p_quantity: transferData.quantity,
          });

          // Add to destination staff
          await supabase.rpc("add_staff_stock", {
            p_user_id: transferData.toUserId!,
            p_warehouse_id: transferData.fromWarehouseId!, // Use original warehouse context
            p_product_id: transferData.productId,
            p_quantity: transferData.quantity,
          });
          break;
      }

      return transfer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
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
