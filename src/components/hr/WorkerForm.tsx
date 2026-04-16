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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Worker } from './worker-columns';
import { generateDisplayId } from '@/lib/utils';

const workerSchema = z.object({
  full_name: z.string().min(2, "Full name is required."),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address.").optional().or(z.literal('')),
  address: z.string().optional(),
  role_id: z.string().uuid("Please select a role.").optional().nullable(),
  joining_date: z.string().optional(),
  is_active: z.boolean(),
});

type WorkerFormData = z.infer<typeof workerSchema>;

interface WorkerFormProps {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
}

export const WorkerForm: React.FC<WorkerFormProps> = ({ isOpen, onClose, worker }) => {
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();
  const isEditMode = !!worker;

  const { data: roles } = useQuery({
    queryKey: ['worker_roles', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('worker_roles').select('id, name').eq('warehouse_id', warehouse?.id);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  const form = useForm<WorkerFormData>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      is_active: true,
    },
  });

  useEffect(() => {
    if (worker) {
      form.reset({
        ...worker,
        joining_date: worker.joining_date ? new Date(worker.joining_date).toISOString().split('T')[0] : undefined,
      });
    } else {
      form.reset({
        full_name: '',
        phone: '',
        email: '',
        address: '',
        role_id: null,
        joining_date: new Date().toISOString().split('T')[0],
        is_active: true,
      });
    }
  }, [worker, form]);

  const upsertWorker = useMutation({
    mutationFn: async (formData: WorkerFormData) => {
      if (!warehouse) throw new Error("No warehouse selected");

      const display_id = worker?.display_id || await generateDisplayId('workers', 'WKR');

      const payload = {
        id: worker?.id,
        display_id,
        ...formData,
        warehouse_id: warehouse.id,
      };

      const { error } = await supabase.from('workers').upsert(payload).select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEditMode ? "Worker updated successfully!" : "Worker created successfully!");
      queryClient.invalidateQueries({ queryKey: ['workers', warehouse?.id] });
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to save worker: " + error.message);
    },
  });

  const onSubmit = (data: WorkerFormData) => {
    upsertWorker.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Worker' : 'Add New Worker'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this worker.' : 'Add a new worker to your team.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 py-4">
            <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )}
            />
            <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )}
            />
            <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Address</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="role_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {roles?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="joining_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Joining Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="is_active" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 col-span-2">
                    <div className="space-y-0.5">
                        <FormLabel>Active Status</FormLabel>
                        <DialogDescription>Inactive workers cannot be assigned tasks.</DialogDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )}
            />
            <DialogFooter className="col-span-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={upsertWorker.isPending}>
                {upsertWorker.isPending ? 'Saving...' : 'Save Worker'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
