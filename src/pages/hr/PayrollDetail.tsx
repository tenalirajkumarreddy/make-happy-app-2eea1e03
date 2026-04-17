import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from "@/components/shared/DataTable";
import { payrollItemColumns, PayrollItem } from '@/components/hr/payroll-item-columns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, DollarSign, Users, Calendar } from 'lucide-react';
import { PayrollItemForm } from '@/components/hr/PayrollItemForm';
import { toast } from 'sonner';

const PayrollDetailPage = () => {
  const { payrollId } = useParams<{ payrollId: string }>();
  const { warehouse } = useAuth();
  const queryClient = useQueryClient();
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null);

  const { data: payroll, isLoading: isLoadingPayroll } = useQuery({
    queryKey: ['payroll', payrollId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payrolls')
        .select('*')
        .eq('id', payrollId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: payrollItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ['payroll_items', payrollId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_items')
        .select('*, worker:workers(full_name, role:worker_roles(name)))')
        .eq('payroll_id', payrollId);
      if (error) throw error;
      return data.map(item => ({
          ...item,
          worker_name: item.worker.full_name,
          worker_role: item.worker.role.name,
      }));
    },
  });

  const processPayrollMutation = useMutation({
    mutationFn: async () => {
        if (!payrollId) return;
        const { error } = await supabase.rpc('process_payroll', { p_payroll_id: payrollId });
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Payroll successfully processed and marked as completed!");
        queryClient.invalidateQueries({ queryKey: ['payroll', payrollId] });
        queryClient.invalidateQueries({ queryKey: ['payrolls'] }); // To update list view
    },
    onError: (error) => {
        toast.error("Failed to process payroll: " + error.message);
    }
  });

  const handleNewItem = () => {
    setSelectedItem(null);
    setIsItemFormOpen(true);
  };

  const handleEditItem = (item: PayrollItem) => {
    setSelectedItem(item);
    setIsItemFormOpen(true);
  };

  const handleCloseItemForm = () => {
    setIsItemFormOpen(false);
    setSelectedItem(null);
  };

  const columns = payrollItemColumns({ onEdit: handleEditItem });

  if (isLoadingPayroll) {
    return <div>Loading payroll details...</div>;
  }

  if (!payroll) {
    return <div>Payroll run not found.</div>;
  }

  const totalAmount = payrollItems?.reduce((sum, item) => sum + item.amount, 0) || 0;

  return (
    <div className="container mx-auto py-10">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex justify-between items-start">
            <span>Payroll Run: {payroll.display_id}</span>
            <span className={`px-3 py-1 text-sm rounded-full ${
                payroll.status === 'paid' ? 'bg-green-100 text-green-800' :
                payroll.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                payroll.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
            }`}>
                {payroll.status}
            </span>
          </CardTitle>
          <CardDescription>{payroll.notes || "No notes for this payroll run."}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
                <Calendar className="h-6 w-6 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Period</p>
                    <p className="font-semibold">{new Date(payroll.start_date).toLocaleDateString()} - {new Date(payroll.end_date).toLocaleDateString()}</p>
                </div>
            </div>
            <div className="flex items-center space-x-3">
                <Users className="h-6 w-6 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Workers</p>
                    <p className="font-semibold">{payrollItems?.length || 0}</p>
                </div>
            </div>
            <div className="flex items-center space-x-3">
                <DollarSign className="h-6 w-6 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-semibold">
                        {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalAmount)}
                    </p>
                </div>
            </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Payroll Items</h2>
        <div>
            {payroll.status === 'draft' && (
                <Button onClick={handleNewItem} className="mr-2">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                </Button>
            )}
            {payroll.status === 'draft' && payrollItems && payrollItems.length > 0 && (
                 <Button onClick={() => processPayrollMutation.mutate()} disabled={processPayrollMutation.isPending}>
                    {processPayrollMutation.isPending ? 'Processing...' : 'Process Payroll'}
                </Button>
            )}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={payrollItems || []}
        isLoading={isLoadingItems}
        filterColumn="worker_name"
        filterPlaceholder="Filter by worker name..."
      />
      <PayrollItemForm
        isOpen={isItemFormOpen}
        onClose={handleCloseItemForm}
        item={selectedItem}
        payrollId={payrollId!}
      />
    </div>
  );
};

export default PayrollDetailPage;
