import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Warehouse {
  id: string;
  name: string;
  is_active: boolean;
}

export function useWarehouseStock(warehouseId?: string) {
  const enabled = !!warehouseId && warehouseId !== 'all';

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

  return {
    data: items,
    items,
    isLoading,
    error,
  };
}
