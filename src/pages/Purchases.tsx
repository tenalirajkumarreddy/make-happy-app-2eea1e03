import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { DataTable } from "@/components/shared/DataTable";
import { purchaseOrderColumns } from '@/components/inventory/purchase-order-columns';
import { PageHeader } from "@/components/shared/PageHeader";
import { PurchaseOrderForm } from '@/components/inventory/PurchaseOrderForm';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { PurchaseOrderView } from '@/types/purchases';

const PurchasesPage = () => {
  const { currentWarehouse } = useWarehouse();

  const { data: purchaseOrders, isLoading, error } = useQuery({
    queryKey: ['purchase_orders', currentWarehouse?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];

      // Fetch purchase orders with vendor info
      const { data: orders, error: ordersError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          vendors (name)
        `)
        .eq('warehouse_id', currentWarehouse.id)
        .is('deleted_at', null)
        .order('order_date', { ascending: false });

      if (ordersError) {
        console.error('Error fetching purchase orders:', ordersError);
        throw ordersError;
      }

      if (!orders || orders.length === 0) return [];

      // Get item counts for each order
      const orderIds = orders.map((o: any) => o.id);
      const { data: items, error: itemsError } = await supabase
        .from('purchase_items')
        .select('purchase_id, id')
        .in('purchase_id', orderIds);

      if (itemsError) {
        console.error('Error fetching purchase items:', itemsError);
        throw itemsError;
      }

      // Count items per order
      const itemCountMap = new Map<string, number>();
      (items || []).forEach((item: any) => {
        const count = itemCountMap.get(item.purchase_id) || 0;
        itemCountMap.set(item.purchase_id, count + 1);
      });

      // Transform to view model
      return (orders as any[]).map((order): PurchaseOrderView => ({
        id: order.id,
        display_id: order.display_id || order.id.substring(0, 8),
        vendor_id: order.vendor_id,
        warehouse_id: order.warehouse_id,
        status: order.status || 'pending',
        total_amount: order.total_amount || 0,
        order_date: order.order_date,
        expected_delivery: order.expected_delivery,
        notes: order.notes,
        vendors: order.vendors,
        item_count: itemCountMap.get(order.id) || 0,
      }));
    },
    enabled: !!currentWarehouse?.id,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Manage your raw material purchases and track their status."
      >
        <PurchaseOrderForm />
      </PageHeader>

      {error ? (
        <div className="p-8 text-center">
          <p className="text-red-500">Error loading purchase orders</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : isLoading ? (
        <TableSkeleton />
      ) : purchaseOrders && purchaseOrders.length > 0 ? (
        <DataTable columns={purchaseOrderColumns} data={purchaseOrders} />
      ) : (
        <div className="flex flex-col items-center justify-center p-12 border rounded-lg bg-muted/50">
          <p className="text-lg font-medium mb-2">No Purchase Orders</p>
          <p className="text-sm text-muted-foreground mb-4">
            {currentWarehouse?.name
              ? `No purchase orders found for ${currentWarehouse.name}`
              : 'Select a warehouse to view purchase orders'
            }
          </p>
          <PurchaseOrderForm />
        </div>
      )}
    </div>
  );
};

export default PurchasesPage;
