import React, { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouse } from '@/contexts/WarehouseContext';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Calendar } from 'lucide-react';
import { toast } from "sonner";
import { format, addDays } from 'date-fns';

// Schema for creating a purchase order with its first item
const purchaseOrderSchema = z.object({
  vendor_id: z.string().uuid("Please select a vendor."),
  raw_material_id: z.string().uuid("Please select a raw material."),
  quantity: z.number().min(1, "Quantity must be at least 1."),
  unit_cost: z.number().min(0, "Unit cost cannot be negative."),
  expected_delivery: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export const PurchaseOrderForm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const queryClient = useQueryClient();

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      quantity: 1,
      unit_cost: 0,
      expected_delivery: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    }
  });

  // Watch values to calculate total
  const quantity = useWatch({ control: form.control, name: 'quantity', defaultValue: 1 });
  const unitCost = useWatch({ control: form.control, name: 'unit_cost', defaultValue: 0 });
  const totalAmount = (quantity || 0) * (unitCost || 0);

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors', currentWarehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('warehouse_id', currentWarehouse?.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentWarehouse?.id,
  });

  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['raw_materials', currentWarehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_materials')
        .select('id, name, unit')
        .eq('warehouse_id', currentWarehouse?.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentWarehouse?.id,
  });

  const createPurchaseOrder = useMutation({
    mutationFn: async (formData: PurchaseOrderFormData) => {
      if (!currentWarehouse?.id) {
        throw new Error('No warehouse selected');
      }

      // Step 1: Create the purchase order header
      const { data: orderData, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor_id: formData.vendor_id,
          warehouse_id: currentWarehouse.id,
          status: 'pending',
          total_amount: totalAmount,
          order_date: new Date().toISOString().split('T')[0],
          expected_delivery: formData.expected_delivery || null,
          notes: formData.notes || null,
          created_by: user?.id,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Step 2: Create the purchase item
      const { error: itemError } = await supabase
        .from('purchase_items')
        .insert({
          purchase_id: orderData.id,
          raw_material_id: formData.raw_material_id,
          quantity: formData.quantity,
          unit_cost: formData.unit_cost,
          total_cost: totalAmount,
          notes: formData.notes || null,
        });

      if (itemError) throw itemError;

      return orderData;
    },
    onSuccess: () => {
      toast.success("Purchase order created successfully!");
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', currentWarehouse?.id] });
      setIsOpen(false);
      form.reset({
        quantity: 1,
        unit_cost: 0,
        expected_delivery: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      });
    },
    onError: (error: any) => {
      toast.error("Failed to create purchase order: " + error.message);
    }
  });

  const onSubmit = (data: PurchaseOrderFormData) => {
    createPurchaseOrder.mutate(data);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && !createPurchaseOrder.isPending) {
      form.reset({
        quantity: 1,
        unit_cost: 0,
        expected_delivery: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription>
            Record a new purchase order for raw materials from a vendor.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Vendor Selection */}
            <FormField
              control={form.control}
              name="vendor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={vendorsLoading ? "Loading..." : "Select a vendor"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendors?.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                      ))}
                      {!vendorsLoading && vendors?.length === 0 && (
                        <SelectItem value="" disabled>No vendors found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Raw Material Selection */}
            <FormField
              control={form.control}
              name="raw_material_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raw Material *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={materialsLoading ? "Loading..." : "Select a raw material"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {materials?.map(material => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.name} {material.unit ? `(${material.unit})` : ''}
                        </SelectItem>
                      ))}
                      {!materialsLoading && materials?.length === 0 && (
                        <SelectItem value="" disabled>No materials found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity and Unit Cost Row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (₹) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Total Amount Preview */}
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Amount:</span>
                <span className="text-lg font-semibold">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Expected Delivery Date */}
            <FormField
              control={form.control}
              name="expected_delivery"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Expected Delivery Date
                  </FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes about the purchase order"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createPurchaseOrder.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPurchaseOrder.isPending || totalAmount <= 0}
              >
                {createPurchaseOrder.isPending ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
