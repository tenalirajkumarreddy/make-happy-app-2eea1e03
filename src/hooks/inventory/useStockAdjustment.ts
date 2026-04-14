import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StockAdjustment {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  type: string;
  reason?: string;
  reference_id?: string;
  unit_price?: number;
  total_value?: number;
  from_user_id?: string;
  to_user_id?: string;
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
}

export interface AdjustmentData {
  productId: string;
  adjustmentType: string;
  quantity: number;
  reason?: string;
  notes?: string;
}

interface UseStockAdjustmentOptions {
  warehouseId?: string;
  productId?: string;
  limit?: number;
  enabled?: boolean;
}

const ADJUSTMENT_TYPES = {
  purchase: { label: "Purchase", color: "text-emerald-600", sign: 1 },
  sale: { label: "Sale", color: "text-red-600", sign: -1 },
  adjustment: { label: "Adjustment", color: "text-amber-600", sign: 1 },
  return: { label: "Return", color: "text-blue-600", sign: 1 },
  damaged: { label: "Damaged/Lost", color: "text-red-600", sign: -1 },
  transfer_in: { label: "Transfer In", color: "text-purple-600", sign: 1 },
  transfer_out: { label: "Transfer Out", color: "text-orange-600", sign: -1 },
};

export function useStockAdjustment(options: UseStockAdjustmentOptions = {}) {
  const { warehouseId, productId, limit = 50, enabled = true } = options;
  const queryClient = useQueryClient();

  // Query for stock movements/adjustments
  const { data: adjustments, isLoading: isLoadingAdjustments, error: adjustmentsError } = useQuery({
    queryKey: ["stock-movements", warehouseId, productId, limit],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select(`
          *,
          product:products!stock_movements_product_id_fkey(id, name, sku, unit, base_price, image_url)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }
      if (productId) {
        query = query.eq("product_id", productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StockAdjustment[];
    },
    enabled,
  });

  // Mutation to create a stock adjustment
  const createAdjustment = useMutation({
    mutationFn: async (adjustmentData: AdjustmentData & { warehouseId?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      // Determine sign based on adjustment type
      const adjustmentType = ADJUSTMENT_TYPES[adjustmentData.adjustmentType as keyof typeof ADJUSTMENT_TYPES];
      const signedQuantity = adjustmentData.quantity * (adjustmentType?.sign || 1);

      // Use the warehouse-specific RPC function
      const { data, error } = await supabase.rpc("record_stock_movement", {
        p_product_id: adjustmentData.productId,
        p_warehouse_id: adjustmentData.warehouseId,
        p_quantity: signedQuantity,
        p_type: adjustmentData.adjustmentType,
        p_reason: adjustmentData.reason || adjustmentType?.label || "Manual adjustment",
        p_user_id: currentUserId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
      toast.success("Stock adjusted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to adjust stock");
    },
  });

  // Mutation to adjust staff stock
  const adjustStaffStock = useMutation({
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
      toast.success("Staff stock adjusted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to adjust staff stock");
    },
  });

  // Mutation to adjust raw material stock
  const adjustRawMaterial = useMutation({
    mutationFn: async ({
      rawMaterialId,
      warehouseId,
      adjustmentType,
      quantity,
      reason,
    }: {
      rawMaterialId: string;
      warehouseId: string;
      adjustmentType: "used" | "remaining";
      quantity: number;
      reason?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      // Get current stock
      const { data: currentStock } = await supabase
        .from("raw_material_stock")
        .select("quantity")
        .eq("raw_material_id", rawMaterialId)
        .eq("warehouse_id", warehouseId)
        .single();

      const quantityBefore = currentStock?.quantity || 0;
      let quantityAfter: number;
      let quantityChange: number;

      if (adjustmentType === "used") {
        quantityChange = -quantity;
        quantityAfter = quantityBefore - quantity;
      } else {
        // remaining - set to this value
        quantityAfter = quantity;
        quantityChange = quantity - quantityBefore;
      }

      // Record adjustment
      const { error: adjError } = await supabase
        .from("raw_material_adjustments")
        .insert({
          raw_material_id: rawMaterialId,
          warehouse_id: warehouseId,
          adjustment_type: adjustmentType,
          quantity_before: quantityBefore,
          quantity_change: quantityChange,
          quantity_after: quantityAfter,
          reason: reason || (adjustmentType === "used" ? "Consumption" : "Physical count"),
          performed_by: currentUserId,
        });

      if (adjError) throw adjError;

      // Update stock
      const { error: stockError } = await supabase
        .from("raw_material_stock")
        .upsert({
          raw_material_id: rawMaterialId,
          warehouse_id: warehouseId,
          quantity: quantityAfter,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "raw_material_id,warehouse_id",
        });

      if (stockError) throw stockError;

      return { quantityAfter };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["raw-materials-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["raw-material-adjustments"] });
      toast.success("Raw material stock adjusted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to adjust raw material stock");
    },
  });

  // Get adjustment stats
  const stats = adjustments ? {
    totalAdjustments: adjustments.length,
    additions: adjustments.filter(a => a.quantity > 0).length,
    deductions: adjustments.filter(a => a.quantity < 0).length,
    totalValue: adjustments.reduce((sum, a) => sum + (a.total_value || 0), 0),
  } : undefined;

  return {
    adjustments,
    stats,
    isLoading: isLoadingAdjustments,
    error: adjustmentsError,
    createAdjustment,
    adjustStaffStock,
    adjustRawMaterial,
  };
}

// Hook for getting stock movement summary
export function useStockMovementSummary(warehouseId?: string) {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["stock-movement-summary", warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements_summary")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });

  return {
    summary: summary || [],
    isLoading,
    error,
  };
}
