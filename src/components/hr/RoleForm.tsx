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
import { toast } from 'sonner';
import { WorkerRole } from './role-columns';

const roleSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters."),
  description: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface RoleFormProps {
  isOpen: boolean;
  onClose: () => void;
  role: WorkerRole | null;
}

export const RoleForm: React.FC<RoleFormProps> = ({ isOpen, onClose, role }) => {
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();
  const isEditMode = !!role;

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (role) {
      form.reset({
        name: role.name,
        description: role.description || '',
      });
    } else {
      form.reset({
        name: '',
        description: '',
      });
    }
  }, [role, form]);

  const upsertRole = useMutation({
    mutationFn: async (formData: RoleFormData) => {
      if (!warehouse) throw new Error("No warehouse selected");

      const payload = {
        id: isEditMode ? role.id : undefined,
        name: formData.name,
        description: formData.description,
        warehouse_id: warehouse.id,
      };

      const { error } = await supabase.from('worker_roles').upsert(payload).select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEditMode ? "Role updated successfully!" : "Role created successfully!");
      queryClient.invalidateQueries({ queryKey: ['worker_roles', warehouse?.id] });
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to save role: " + error.message);
    },
  });

  const onSubmit = (data: RoleFormData) => {
    upsertRole.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Worker Role' : 'Create New Worker Role'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this role.' : 'Add a new role to your organization.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Production Manager" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the responsibilities of this role." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={upsertRole.isPending}>
                {upsertRole.isPending ? 'Saving...' : 'Save Role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
