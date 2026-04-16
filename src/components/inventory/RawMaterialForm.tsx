import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle } from 'lucide-react';
import { toast } from "sonner";

const rawMaterialSchema = z.object({
  name: z.string().min(2, "Material name must be at least 2 characters."),
  sku: z.string().optional(),
  unit: z.string().min(1, "Unit is required (e.g., kg, ltr, pcs)."),
  reorder_level: z.number().min(0).optional(),
});

type RawMaterialFormData = z.infer<typeof rawMaterialSchema>;

export const RawMaterialForm = ({ isEditing = false, defaultValues = {} }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { warehouse, user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<RawMaterialFormData>({
    resolver: zodResolver(rawMaterialSchema),
    defaultValues: isEditing ? defaultValues : { reorder_level: 0 },
  });

  const upsertMaterial = useMutation({
    mutationFn: async (formData: RawMaterialFormData) => {
      const record = {
        ...formData,
        warehouse_id: warehouse?.id,
        created_by: user?.id,
        is_raw_material: true, // Crucial flag
        // If editing, we need the product ID
        ...(isEditing && { id: defaultValues.id }),
      };
      const { error } = await supabase.from('products').upsert(record);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Raw material ${isEditing ? 'updated' : 'created'} successfully!`);
      queryClient.invalidateQueries({ queryKey: ['raw_materials', warehouse?.id] });
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} material: ` + error.message);
    }
  });

  const onSubmit = (data: RawMaterialFormData) => {
    upsertMaterial.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
            <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Edit</span>...</Button> // Simplified trigger for table row
        ) : (
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Raw Material
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Raw Material</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the details of this raw material.' : 'Add a new raw material to your inventory.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Material Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Plastic Bottle 1L" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU (Stock Keeping Unit)</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional SKU" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., pcs, kg, ltr" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reorder_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Re-order Level</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={upsertMaterial.isPending}>
                {upsertMaterial.isPending ? 'Saving...' : 'Save Material'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
