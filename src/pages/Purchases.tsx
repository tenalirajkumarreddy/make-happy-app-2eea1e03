import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from '@/components/ui/data-table';
import { purchaseOrderColumns } from '@/components/inventory/purchase-order-columns';
import { PageHeader } from '@/components/layout/PageHeader';
import { PurchaseOrderForm } from '@/components/inventory/PurchaseOrderForm';
import { TableSkeleton } from '@/components/shared/TableSkeleton';

const PurchasesPage = () => {
  const { warehouse } = useAuth();

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return [];
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          vendors (name),
          products (name)
        `)
        .eq('warehouse_id', warehouse.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Manage your raw material purchases and track their status."
      >
        <PurchaseOrderForm />
      </PageHeader>
      
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable columns={purchaseOrderColumns} data={purchaseOrders || []} />
      )}
    </div>
  );
};

export default PurchasesPage;
