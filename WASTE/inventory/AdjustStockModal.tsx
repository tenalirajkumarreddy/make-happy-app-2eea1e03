import React, { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Product } from '@/lib/types';

const adjustStockSchema = z.object({
  quantity: z.coerce.number().positive("Quantity must be positive."),
  reason: z.string().optional(),
  from_user_id: z.string().uuid().optional(),
  to_user_id: z.string().uuid().optional(),
});

type AdjustStockFormData = z.infer<typeof adjustStockSchema>;

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({ isOpen, onClose, product }) => {
  const queryClient = useQueryClient();
  const { warehouse, user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<'purchase' | 'sale' | 'transfer'>('purchase');
  const [transferType, setTransferType] = useState<'W_S' | 'S_W' | 'S_S'>('W_S');

  const form = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
  });

  const { data: staff } = useQuery({
    queryKey: ['active_staff', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('workers').select('id, full_name').eq('warehouse_id', warehouse?.id).eq('is_active', true);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  const recordStockMovement = useMutation({
    mutationFn: async ({ type, payload }: { type: 'purchase' | 'sale', payload: any }) => {
        const { error } = await supabase.rpc('record_stock_movement', payload);
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success(`Stock ${activeTab === 'purchase' ? 'purchased' : 'sold'} successfully!`);
        queryClient.invalidateQueries({ queryKey: ['products_with_stock'] });
        onClose();
    },
    onError: (error) => {
        toast.error(`Failed to record ${activeTab}: ${error.message}`);
    }
  });

  const recordStockTransfer = useMutation({
    mutationFn: async (payload: any) => {
        const { error } = await supabase.rpc('record_stock_transfer', payload);
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Stock transferred successfully!");
        queryClient.invalidateQueries({ queryKey: ['products_with_stock'] });
        onClose();
    },
    onError: (error) => {
        toast.error(`Transfer failed: ${error.message}`);
    }
  });

  const onSubmit = (data: AdjustStockFormData) => {
    if (!warehouse) return;

    if (activeTab === 'purchase' || activeTab === 'sale') {
        recordStockMovement.mutate({
            type: activeTab,
            payload: {
                p_product_id: product.id,
                p_warehouse_id: warehouse.id,
                p_quantity: activeTab === 'purchase' ? data.quantity : -data.quantity,
                p_type: activeTab,
                p_reason: data.reason,
                p_user_id: user?.id,
            }
        });
    } else { // Transfer
        let p_transfer_type = '';
        if (transferType === 'W_S') p_transfer_type = 'warehouse_to_staff';
        if (transferType === 'S_W') p_transfer_type = 'staff_to_warehouse';
        if (transferType === 'S_S') p_transfer_type = 'staff_to_staff';

        recordStockTransfer.mutate({
            p_transfer_type,
            p_from_warehouse_id: transferType === 'W_S' ? warehouse.id : null,
            p_from_user_id: transferType !== 'W_S' ? data.from_user_id : null,
            p_to_warehouse_id: transferType === 'S_W' ? warehouse.id : null,
            p_to_user_id: transferType !== 'S_W' ? data.to_user_id : null,
            p_product_id: product.id,
            p_quantity: data.quantity,
            p_reason: data.reason,
        });
    }
  };

  const warehouseStock = product.warehouse_quantity || 0;
  const staffStockHoldings = product.staff_holdings || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock: {product.name}</DialogTitle>
          <DialogDescription>
            Record purchases, sales, or transfers for this product.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm p-2 bg-muted rounded-md">
            <p><strong>In Warehouse:</strong> {warehouseStock} {product.unit}</p>
            <p><strong>With Staff:</strong> {staffStockHoldings.reduce((acc, s) => acc + s.quantity, 0)} {product.unit}</p>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="purchase">Purchase</TabsTrigger>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <TabsContent value="purchase" className="space-y-4 py-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Quantity to Add</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="reason" render={({ field }) => (
                    <FormItem><FormLabel>Reason/Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </TabsContent>
              <TabsContent value="sale" className="space-y-4 py-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Quantity to Remove</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="reason" render={({ field }) => (
                    <FormItem><FormLabel>Reason/Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </TabsContent>
              <TabsContent value="transfer" className="space-y-4 py-4">
                <Select onValueChange={(v) => setTransferType(v as any)} defaultValue={transferType}>
                    <SelectTrigger><SelectValue placeholder="Select transfer type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="W_S">Warehouse to Staff</SelectItem>
                        <SelectItem value="S_S">Staff to Staff</SelectItem>
                        {(role === 'super_admin' || role === 'manager') && <SelectItem value="S_W">Staff to Warehouse (Return)</SelectItem>}
                    </SelectContent>
                </Select>
                
                {transferType !== 'W_S' && <FormField control={form.control} name="from_user_id" render={({ field }) => (
                    <FormItem><FormLabel>From Staff</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select source staff" /></SelectTrigger></FormControl>
                            <SelectContent>{staff?.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                        </Select>
                    <FormMessage /></FormItem>
                )}/>}

                {transferType !== 'S_W' && <FormField control={form.control} name="to_user_id" render={({ field }) => (
                    <FormItem><FormLabel>To Staff</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select destination staff" /></SelectTrigger></FormControl>
                            <SelectContent>{staff?.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                        </Select>
                    <FormMessage /></FormItem>
                )}/>}

                <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Quantity to Transfer</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="reason" render={({ field }) => (
                    <FormItem><FormLabel>Reason/Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </TabsContent>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={recordStockMovement.isPending || recordStockTransfer.isPending}>
                    {recordStockMovement.isPending || recordStockTransfer.isPending ? 'Saving...' : 'Confirm'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
