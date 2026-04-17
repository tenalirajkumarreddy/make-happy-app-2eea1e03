import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { workerColumns, Worker } from '@/components/hr/worker-columns';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { WorkerForm } from '@/components/hr/WorkerForm';

const WorkersPage = () => {
  const { warehouse } = useAuth();
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [selectedWorker, setSelectedWorker] = React.useState<Worker | null>(null);

  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers', warehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('*, role:worker_roles(name)')
        .eq('warehouse_id', warehouse?.id);
      if (error) throw error;
      return data.map(w => ({ ...w, role_name: w.role?.name || 'N/A' }));
    },
    enabled: !!warehouse?.id,
  });

  const handleEdit = (worker: Worker) => {
    setSelectedWorker(worker);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedWorker(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedWorker(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Management"
        description="Onboard, view, and manage your workers."
        actions={
          <Button onClick={handleAddNew}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Worker
          </Button>
        }
      />
      <DataTable
        columns={workerColumns(handleEdit)}
        data={workers || []}
        isLoading={isLoading}
        filterColumn="full_name"
        filterPlaceholder="Filter by name..."
      />
      <WorkerForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        worker={selectedWorker}
      />
    </div>
  );
};

export default WorkersPage;
