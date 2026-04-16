import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/data-table';
import { roleColumns, WorkerRole } from '@/components/hr/role-columns';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { RoleForm } from '@/components/hr/RoleForm';

const WorkerRolesPage = () => {
  const { warehouse } = useAuth();
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState<WorkerRole | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: ['worker_roles', warehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_roles')
        .select('*')
        .eq('warehouse_id', warehouse?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  const handleEdit = (role: WorkerRole) => {
    setSelectedRole(role);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedRole(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedRole(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Worker Roles"
        description="Manage job roles and responsibilities for your staff."
        actions={
          <Button onClick={handleAddNew}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Role
          </Button>
        }
      />
      <DataTable
        columns={roleColumns(handleEdit)}
        data={roles || []}
        isLoading={isLoading}
        filterColumn="name"
        filterPlaceholder="Filter by role name..."
      />
      <RoleForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        role={selectedRole}
      />
    </div>
  );
};

export default WorkerRolesPage;
