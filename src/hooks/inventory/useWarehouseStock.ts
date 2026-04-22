import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Warehouse {
  id: string;
  name: string;
  is_active: boolean;
}

interface UseWarehouseStockOptions {
  warehouseId?: string;
  enabled?: boolean;
}

export function useWarehouseStock(options: UseWarehouseStockOptions = {}) {
  const { warehouseId, enabled: enabledProp = true } = options;
  const queryClient = useQueryClient();
  
  const enabled = enabledProp && !!warehouseId;

  // Query for warehouse stock items
  const { data: items, isLoading, error } = useQuery({
    queryKey: ['warehouse-stock', warehouseId],
    queryFn: async () => {
      if (!warehouseId || warehouseId === 'all') return [];

      const { data, error } = await supabase
        .from('product_stock')
        .select(`
          id,
          quantity,
          updated_at,
          product:products!product_stock_product_id_fkey(
            id, name, sku, unit, base_price, image_url,
            min_stock_level, category, is_active
          )
        `)
        .eq('warehouse_id', warehouseId);

      if (error) throw error;

      // Type assertion and filter out active products
      return (data || []).map((item: any) => ({
        id: item.id,
        quantity: item.quantity,
        updated_at: item.updated_at,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
      }));
    },
    enabled: enabled,
  });

  // Query for warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Query for products
  const { data: products } = useQuery({
    queryKey: ['products-for-warehouse', warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, unit, base_price, image_url, min_stock_level, category, is_active')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: enabled,
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!items) return { totalStockValue: 0, lowStockProducts: 0 };
    
    const totalStockValue = items.reduce((sum: number, item: any) => {
      return sum + (item.quantity || 0) * Number(item.product?.base_price || 0);
    }, 0);
    
    const lowStockProducts = items.filter((item: any) => {
      return item.quantity <= (item.product?.min_stock_level || 0);
    }).length;
    
    return { totalStockValue, lowStockProducts };
  }, [items]);

  // Mutation to update stock with retry logic
  const updateStock = useMutation({
    mutationFn: async (params: {
      productId: string;
      warehouseId: string;
      quantity: number;
      type: string;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('record_stock_movement', {
        p_product_id: params.productId,
        p_warehouse_id: params.warehouseId,
        p_quantity: params.quantity,
        p_type: params.type,
        p_reason: params.reason,
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) {
        // Classify errors for better UX
        if (error.code === '42501') {
          throw new Error('Permission denied: You do not have access to update this stock');
        } else if (error.code === '23514') {
          throw new Error('Validation failed: Check stock constraints');
        } else if (error.code?.startsWith('23')) {
          throw new Error('Data validation error: ' + error.message);
        } else {
          throw error;
        }
      }
    },
    retry: (failureCount, error: any) => {
      // Retry on network errors only, not on permission/validation errors
      return failureCount < 3 && !error?.code?.startsWith('425') && !error?.code?.startsWith('235');
    },
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 10000), // Exponential backoff
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Stock updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update stock');
    },
  });

  return {
    data: items,
    items,
    warehouses,
    products,
    stats,
    isLoading,
    error,
    updateStock,
  };
}
