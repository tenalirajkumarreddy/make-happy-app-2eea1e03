import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle } from 'lucide-react';
import { toast } from "sonner";

const purchaseOrderSchema = z.object({
  vendor_id: z.string().uuid("Please select a vendor."),
  product_id: z.string().uuid("Please select a product."),
  quantity: z.number().min(1, "Quantity must be at least 1."),
  price: z.number().min(0, "Price cannot be negative."),
  notes: z.string().optional(),
});

type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export const PurchaseOrderForm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { warehouse, user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
        quantity: 1,
        price: 0,
    }
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors', warehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').eq('warehouse_id', warehouse?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  const { data: products } = useQuery({
    queryKey: ['products', warehouse?.id, 'raw_material'], // Assuming a way to filter for raw materials
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name').eq('warehouse_id', warehouse?.id).eq('is_raw_material', true); // This filter needs to be implemented
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id,
  });

  const createPurchaseOrder = useMutation({
    mutationFn: async (formData: PurchaseOrderFormData) => {
      const { error } = await supabase.from('purchase_orders').insert({
        ...formData,
        warehouse_id: warehouse?.id,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase order created successfully!");
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', warehouse?.id] });
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast.error("Failed to create purchase order: " + error.message);
    }
  });

  const onSubmit = (data: PurchaseOrderFormData) => {
    createPurchaseOrder.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription>
            Record a new purchase order for raw materials from a vendor.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="vendor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a vendor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendors?.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raw Material</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a raw material" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products?.map(product => (
                        <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Price</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional notes about the purchase order" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createPurchaseOrder.isPending}>
                {createPurchaseOrder.isPending ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
