import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Warehouse {
  id: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  is_active: boolean;
  created_at?: string;
}

export interface WarehouseStock {
  id: string;
  name: string;
  sku: string;
  category?: string;
  unit: string;
  base_price: number;
  image_url?: string;
  quantity: number;
  min_stock_level?: number;
  reorder_point?: number;
  reorder_quantity?: number;
}

export interface WarehouseStats {
  totalProducts: number;
  totalStockValue: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalQuantity: number;
  avgStockLevel: number;
}

interface UseWarehouseStockOptions {
  warehouseId?: string;
  enabled?: boolean;
}

export function useWarehouseStock(options: UseWarehouseStockOptions = {}) {
  const { warehouseId, enabled = true } = options;
  const queryClient = useQueryClient();

  // Query for all warehouses
  const { data: warehouses, isLoading: isLoadingWarehouses, error: warehousesError } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data || []) as Warehouse[];
    },
    enabled,
  });

  // Query for products in a specific warehouse
  const { data: products, isLoading: isLoadingProducts, error: productsError } = useQuery({
    queryKey: ["warehouse-products", warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [];

      // Get all active products
      const { data: allProducts, error: productsError } = await supabase
        .from("products")
        .select("id, name, sku, unit, category, image_url, base_price, min_stock_level")
        .eq("is_active", true)
        .order("name");

      if (productsError) throw productsError;

      // Get stock for this warehouse
      const { data: stockData, error: stockError } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", warehouseId);

      if (stockError) throw stockError;

      // Create stock map
      const stockMap = new Map(stockData?.map(s => [s.product_id, s.quantity]) || []);

      // Merge data
      return (allProducts || []).map(product => ({
        ...product,
        quantity: stockMap.get(product.id) || 0,
      })) as WarehouseStock[];
    },
    enabled: enabled && !!warehouseId,
  });

  // Calculate stats
  const stats: WarehouseStats | undefined = products ? {
    totalProducts: products.length,
    totalStockValue: products.reduce((sum, p) => sum + ((p.quantity || 0) * (p.base_price || 0)), 0),
    lowStockProducts: products.filter(p => {
      const minStock = p.min_stock_level || 0;
      return p.quantity <= minStock && p.quantity > 0;
    }).length,
    outOfStockProducts: products.filter(p => p.quantity <= 0).length,
    totalQuantity: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
    avgStockLevel: products.length > 0 
      ? products.reduce((sum, p) => sum + (p.quantity || 0), 0) / products.length 
      : 0,
  } : undefined;

  // Mutation to update warehouse stock
  const updateStock = useMutation({
    mutationFn: async ({
      productId,
      warehouseId,
      quantity,
      type,
      reason,
    }: {
      productId: string;
      warehouseId: string;
      quantity: number;
      type: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("record_stock_movement", {
        p_product_id: productId,
        p_warehouse_id: warehouseId,
        p_quantity: quantity,
        p_type: type,
        p_reason: reason,
        p_user_id: undefined, // Will be set by the function
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Stock updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update stock");
    },
  });

  // Mutation to transfer stock between warehouses
  const transferBetweenWarehouses = useMutation({
    mutationFn: async ({
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity,
      reason,
    }: {
      fromWarehouseId: string;
      toWarehouseId: string;
      productId: string;
      quantity: number;
      reason?: string;
    }) => {
      // Create stock transfer record
      const { data: transferData, error: transferError } = await supabase
        .from("stock_transfers")
        .insert({
          display_id: `STF-${Date.now()}`,
          transfer_type: "warehouse_to_warehouse",
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          product_id: productId,
          quantity,
          description: reason,
        })
        .select()
        .single();

      if (transferError) throw transferError;

      // Record outgoing movement
      await supabase.rpc("record_stock_movement", {
        p_product_id: productId,
        p_warehouse_id: fromWarehouseId,
        p_quantity: -quantity,
        p_type: "transfer_out",
        p_reason: reason || `Transfer to warehouse`,
        p_user_id: undefined,
      });

      // Record incoming movement
      await supabase.rpc("record_stock_movement", {
        p_product_id: productId,
        p_warehouse_id: toWarehouseId,
        p_quantity: quantity,
        p_type: "transfer_in",
        p_reason: reason || `Transfer from warehouse`,
        p_user_id: undefined,
      });

      return transferData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Stock transferred successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to transfer stock");
    },
  });

  return {
    warehouses,
    products,
    stats,
    isLoading: isLoadingWarehouses || isLoadingProducts,
    error: warehousesError || productsError,
    updateStock,
    transferBetweenWarehouses,
  };
}

// Hook for getting warehouse stock by product
export function useProductWarehouseStock(productId?: string) {
  const { data: warehouseStock, isLoading, error } = useQuery({
    queryKey: ["product-warehouse-stock", productId],
    queryFn: async () => {
      if (!productId) return [];

      const { data, error } = await supabase
        .from("product_stock")
        .select(`
          id,
          quantity,
          updated_at,
          warehouse:warehouses(id, name, is_active)
        `)
        .eq("product_id", productId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });

  const totalStock = warehouseStock?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

  return {
    warehouseStock: warehouseStock || [],
    totalStock,
    isLoading,
    error,
  };
}
