import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from "@/components/shared/DataTable";
import { createPurchaseColumns } from '@/components/inventory/purchase-columns';
import { PageHeader } from "@/components/shared/PageHeader";
import { PurchaseOrderForm } from '@/components/inventory/PurchaseOrderForm';
import { RecordPurchaseForm } from '@/components/inventory/RecordPurchaseForm';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ShoppingCart } from "lucide-react";
import type { PurchaseRecord } from '@/types/purchases';

const PurchasesPage = () => {
  const { currentWarehouse } = useWarehouse();
  const { user, role } = useAuth();
  const [showRecordPurchase, setShowRecordPurchase] = useState(false);
  const [activeTab, setActiveTab] = useState<'purchases' | 'orders'>('purchases');

  const isManagerOrAdmin = role === 'super_admin' || role === 'manager';
  const isOperator = role === 'operator';

  useEffect(() => { document.title = "Purchases"; }, []);

  const { data: purchases, isLoading, error } = useQuery({
    queryKey: ['purchases', currentWarehouse?.id, user?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];

      let query = supabase
        .from('purchases')
        .select(`
          *,
          vendors (name)
        `)
        .eq('warehouse_id', currentWarehouse.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (isOperator && user?.id) {
        query = query.eq('created_by', user.id);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching purchases:', fetchError);
        throw fetchError;
      }

      return (data || []) as PurchaseRecord[];
    },
    enabled: !!currentWarehouse?.id,
  });

  const columns = createPurchaseColumns(isManagerOrAdmin, user?.id || '');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <PageHeader title="Purchases" />
        <div className="flex gap-2">
          {(isManagerOrAdmin || isOperator) && (
            <Button onClick={() => setShowRecordPurchase(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {isOperator ? "Submit Purchase" : "Record Purchase"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'purchases' | 'orders')}>
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          {error ? (
            <div className="p-8 text-center">
              <p className="text-red-500">Error loading purchases</p>
              <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            </div>
          ) : isLoading ? (
            <TableSkeleton />
          ) : purchases && purchases.length > 0 ? (
            <DataTable columns={columns} data={purchases} searchKey="display_id" />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No purchases found</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                {currentWarehouse?.name
                  ? `No purchases recorded for ${currentWarehouse.name} yet.`
                  : 'Select a warehouse to view purchases.'
                }
              </p>
              {(isManagerOrAdmin || isOperator) && (
                <Button onClick={() => setShowRecordPurchase(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {isOperator ? "Submit Purchase" : "Record Purchase"}
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <PurchaseOrderForm />
        </TabsContent>
      </Tabs>

      {(isManagerOrAdmin || isOperator) && (
        <RecordPurchaseForm open={showRecordPurchase} onOpenChange={setShowRecordPurchase} />
      )}
    </div>
  );
};

export default PurchasesPage;
