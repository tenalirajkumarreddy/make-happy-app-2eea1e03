import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from "@/components/shared/DataTable";
import { bomColumns } from '@/components/inventory/bom-columns';
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TableSkeleton } from '@/components/shared/TableSkeleton';

const BillOfMaterialsPage = () => {
  const { warehouse } = useAuth();

  const { data: boms, isLoading } = useQuery({
    queryKey: ['boms', warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return [];
      // This RPC call is needed to get the summary data for each BOM.
      const { data, error } = await supabase.rpc('get_bom_summary', { p_warehouse_id: warehouse.id });
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bill of Materials (BOM)"
        description="Define the raw material composition for your finished products."
      >
        <Button asChild>
          <Link to="/inventory/boms/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create BOM
          </Link>
        </Button>
      </PageHeader>
      
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable columns={bomColumns} data={boms || []} />
      )}
    </div>
  );
};

export default BillOfMaterialsPage;
