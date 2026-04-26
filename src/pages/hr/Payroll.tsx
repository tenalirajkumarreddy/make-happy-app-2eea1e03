import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from "@/components/shared/DataTable";
import { payrollColumns } from '@/components/hr/payroll-columns';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { PayrollForm } from '@/components/hr/PayrollForm';
import { Payroll } from '@/components/hr/payroll-columns';

const PayrollPage = () => {
  const navigate = useNavigate();
  const { warehouse } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);

  const { data: payrolls, isLoading } = useQuery({
    queryKey: ['payrolls', warehouse?.id],
    queryFn: async () => {
      if (!warehouse) return [];
      const { data, error } = await supabase
        .from('payrolls')
        .select('*')
        .eq('warehouse_id', warehouse.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  const handleNewPayroll = () => {
    setSelectedPayroll(null);
    setIsFormOpen(true);
  };

  const handleEditPayroll = (payroll: Payroll) => {
    setSelectedPayroll(payroll);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedPayroll(null);
  };

  const columns = payrollColumns({ onEdit: handleEditPayroll, navigate });

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Payroll Management</h1>
        <Button onClick={handleNewPayroll}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create Payroll Run
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={payrolls || []}
        isLoading={isLoading}
        filterColumn="display_id"
        filterPlaceholder="Filter by Payroll ID..."
      />
      <PayrollForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        payroll={selectedPayroll}
      />
    </div>
  );
};

export default PayrollPage;
