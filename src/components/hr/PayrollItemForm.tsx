import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PayrollItem } from './payroll-item-columns';

const payrollItemSchema = z.object({
  worker_id: z.string().uuid("Please select a worker."),
  item_type: z.enum(['salary', 'bonus', 'deduction']),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  notes: z.string().optional(),
});

type PayrollItemFormData = z.infer<typeof payrollItemSchema>;

interface PayrollItemFormProps {
  isOpen: boolean;
  onClose: () => void;
  item: PayrollItem | null;
  payrollId: string;
}

export const PayrollItemForm: React.FC<PayrollItemFormProps> = ({ isOpen, onClose, item, payrollId }) => {
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();
  const isEditMode = !!item;

  const { data: workers } = useQuery({
    queryKey: ['workers', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('workers').select('id, full_name').eq('warehouse_id', warehouse?.id).eq('is_active', true);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  const form = useForm<PayrollItemFormData>({
    resolver: zodResolver(payrollItemSchema),
    defaultValues: {
      item_type: 'salary',
    },
  });

  useEffect(() => {
    if (item) {
      form.reset(item);
    } else {
      form.reset({
        worker_id: undefined,
        item_type: 'salary',
        amount: 0,
        notes: '',
      });
    }
  }, [item, form]);

  const upsertPayrollItem = useMutation({
    mutationFn: async (formData: PayrollItemFormData) => {
      if (!warehouse) throw new Error("No warehouse selected");

      const payload = {
        id: item?.id,
        ...formData,
        payroll_id: payrollId,
        warehouse_id: warehouse.id,
      };

      const { error } = await supabase.from('payroll_items').upsert(payload).select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEditMode ? "Payroll item updated!" : "Payroll item added!");
      queryClient.invalidateQueries({ queryKey: ['payroll_items', payrollId] });
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to save item: " + error.message);
    },
  });

  const onSubmit = (data: PayrollItemFormData) => {
    upsertPayrollItem.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Payroll Item' : 'Add Payroll Item'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this payroll item.' : 'Add a new salary, bonus, or deduction for a worker.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="worker_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Worker</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditMode}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a worker" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {workers?.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="item_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select item type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="deduction">Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="e.g., Performance bonus for Q2" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={upsertPayrollItem.isPending}>
                {upsertPayrollItem.isPending ? 'Saving...' : 'Save Item'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
