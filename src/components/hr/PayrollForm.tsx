import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Payroll } from './payroll-columns';
import { generateDisplayId } from '@/lib/displayId';

const payrollSchema = z.object({
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().min(1, "End date is required."),
  status: z.enum(['draft', 'processing', 'completed', 'paid']),
  notes: z.string().optional(),
});

type PayrollFormData = z.infer<typeof payrollSchema>;

interface PayrollFormProps {
  isOpen: boolean;
  onClose: () => void;
  payroll: Payroll | null;
}

export const PayrollForm: React.FC<PayrollFormProps> = ({ isOpen, onClose, payroll }) => {
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();
  const isEditMode = !!payroll;

  const form = useForm<PayrollFormData>({
    resolver: zodResolver(payrollSchema),
    defaultValues: {
      status: 'draft',
    },
  });

  useEffect(() => {
    if (payroll) {
      form.reset({
        ...payroll,
        start_date: new Date(payroll.start_date).toISOString().split('T')[0],
        end_date: new Date(payroll.end_date).toISOString().split('T')[0],
      });
    } else {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      form.reset({
        start_date: firstDay,
        end_date: lastDay,
        status: 'draft',
        notes: '',
      });
    }
  }, [payroll, form]);

  const upsertPayroll = useMutation({
    mutationFn: async (formData: PayrollFormData) => {
      if (!warehouse) throw new Error("No warehouse selected");

      const display_id = payroll?.display_id || await generateDisplayId('payrolls', 'PAY');

      const payload = {
        id: payroll?.id,
        display_id,
        ...formData,
        warehouse_id: warehouse.id,
      };

      const { error } = await supabase.from('payrolls').upsert(payload).select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEditMode ? "Payroll run updated!" : "Payroll run created!");
      queryClient.invalidateQueries({ queryKey: ['payrolls', warehouse?.id] });
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to save payroll run: " + error.message);
    },
  });

  const onSubmit = (data: PayrollFormData) => {
    upsertPayroll.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Payroll Run' : 'Create New Payroll Run'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this payroll run.' : 'Define the period for a new payroll run.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="start_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Any notes for this payroll run..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={upsertPayroll.isPending}>
                {upsertPayroll.isPending ? 'Saving...' : 'Save Payroll Run'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
