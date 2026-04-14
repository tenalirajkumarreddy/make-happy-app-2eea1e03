import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface StockMovement {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  type: string;
  reason?: string;
  reference_id?: string;
  from_location?: string;
  to_location?: string;
  from_user_id?: string;
  to_user_id?: string;
  unit_price?: number;
  total_value?: number;
  transfer_id?: string;
  created_at: string;
  created_by?: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
    image_url?: string;
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
  creator?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
  warehouse?: {
    id: string;
    name: string;
  };
}

export interface RawMaterialAdjustment {
  id: string;
  display_id: string;
  raw_material_id: string;
  warehouse_id: string;
  adjustment_type: "used" | "remaining";
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason?: string;
  reference_id?: string;
  unit_price?: number;
  total_value?: number;
  performed_by?: string;
  created_at: string;
  raw_material?: {
    id: string;
    name: string;
    display_id: string;
    unit: string;
    unit_cost: number;
  };
  performer?: {
    id: string;
    full_name?: string;
  };
}

interface UseStockHistoryOptions {
  warehouseId?: string;
  productId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  enabled?: boolean;
}

export function useStockHistory(options: UseStockHistoryOptions = {}) {
  const { 
    warehouseId, 
    productId, 
    userId,
    dateFrom, 
    dateTo, 
    limit = 100, 
    enabled = true 
  } = options;

  // Query for product stock movements
  const { 
    data: movements, 
    isLoading: isLoadingMovements, 
    error: movementsError,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ["stock-movements", warehouseId, productId, userId, dateFrom, dateTo, limit],
    queryFn: async () => {
    let query = supabase
      .from("stock_movements")
      .select(`
        *,
        product:products!stock_movements_product_id_fkey(id, name, sku, unit, base_price, image_url),
        warehouse:warehouses!stock_movements_warehouse_id_fkey(id, name)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }
      if (productId) {
        query = query.eq("product_id", productId);
      }
      if (userId) {
        query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId},created_by.eq.${userId}`);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StockMovement[];
    },
    enabled,
  });

  // Query for raw material adjustments
  const { 
    data: rawMaterialAdjustments, 
    isLoading: isLoadingRawAdjustments, 
    error: rawAdjustmentsError,
    refetch: refetchRawAdjustments
  } = useQuery({
    queryKey: ["raw-material-adjustments", warehouseId, dateFrom, dateTo, limit],
    queryFn: async () => {
      let query = supabase
        .from("raw_material_adjustments")
        .select(`
          *,
          raw_material:raw_materials(id, name, display_id, unit, unit_cost),
          performer:profiles!raw_material_adjustments_performed_by_fkey(id, full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as RawMaterialAdjustment[];
    },
    enabled,
  });

  // Calculate statistics
  const stats = useMemo(() => {
    if (!movements) return undefined;

    return movements.reduce((acc, movement) => {
      acc.total++;
      acc.totalValue += movement.total_value || 0;
      
      if (movement.quantity > 0) {
        acc.totalIn += movement.quantity;
        acc.valueIn += movement.total_value || 0;
      } else {
        acc.totalOut += Math.abs(movement.quantity);
        acc.valueOut += movement.total_value || 0;
      }

      // Group by type
      if (!acc.byType[movement.type]) {
        acc.byType[movement.type] = { count: 0, quantity: 0, value: 0 };
      }
      acc.byType[movement.type].count++;
      acc.byType[movement.type].quantity += Math.abs(movement.quantity);
      acc.byType[movement.type].value += movement.total_value || 0;

      return acc;
    }, {
      total: 0,
      totalValue: 0,
      totalIn: 0,
      totalOut: 0,
      valueIn: 0,
      valueOut: 0,
      byType: {} as Record<string, { count: number; quantity: number; value: number }>,
    });
  }, [movements]);

  // Raw material stats
  const rawStats = useMemo(() => {
    if (!rawMaterialAdjustments) return undefined;

    return rawMaterialAdjustments.reduce((acc, adj) => {
      acc.total++;
      if (adj.adjustment_type === "used") {
        acc.totalUsed += Math.abs(adj.quantity_change);
        acc.usageCount++;
      } else {
        acc.totalAdjusted += Math.abs(adj.quantity_change);
        acc.adjustmentCount++;
      }
      acc.totalValue += adj.total_value || 0;
      return acc;
    }, {
      total: 0,
      totalUsed: 0,
      usageCount: 0,
      totalAdjusted: 0,
      adjustmentCount: 0,
      totalValue: 0,
    });
  }, [rawMaterialAdjustments]);

  // Group movements by date
  const groupedByDate = useMemo(() => {
    if (!movements) return {};

    const groups: Record<string, StockMovement[]> = {};
    movements.forEach((movement) => {
      const date = new Date(movement.created_at).toISOString().split("T")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(movement);
    });
    return groups;
  }, [movements]);

  // Group raw material adjustments by date
  const rawGroupedByDate = useMemo(() => {
    if (!rawMaterialAdjustments) return {};

    const groups: Record<string, RawMaterialAdjustment[]> = {};
    rawMaterialAdjustments.forEach((adj) => {
      const date = new Date(adj.created_at).toISOString().split("T")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(adj);
    });
    return groups;
  }, [rawMaterialAdjustments]);

  // Get unique movement types
  const movementTypes = useMemo(() => {
    if (!movements) return [];
    return [...new Set(movements.map(m => m.type))];
  }, [movements]);

  return {
    movements: movements || [],
    rawMaterialAdjustments: rawMaterialAdjustments || [],
    stats,
    rawStats,
    groupedByDate,
    rawGroupedByDate,
    movementTypes,
    isLoading: isLoadingMovements || isLoadingRawAdjustments,
    error: movementsError || rawAdjustmentsError,
    refetch: async () => {
      await refetchMovements();
      await refetchRawAdjustments();
    },
  };
}

// Hook for getting recent stock movements
export function useRecentStockHistory(limit: number = 10) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recent-stock-movements", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements_summary")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    recentMovements: data || [],
    isLoading,
    error,
  };
}

// Hook for getting stock history for a specific product
export function useProductStockHistory(productId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["product-stock-history", productId],
    queryFn: async () => {
      if (!productId) return [];

      const { data, error } = await supabase
        .from("stock_movements_summary")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });

  return {
    history: data || [],
    isLoading,
    error,
  };
}
