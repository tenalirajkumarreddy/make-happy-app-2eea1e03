import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface StockTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId?: string;
  defaultProductId?: string;
}

type TransferType = 'warehouse_to_staff' | 'staff_to_warehouse' | 'staff_to_staff';

export function StockTransferModal({ isOpen, onClose, warehouseId, defaultProductId }: StockTransferModalProps) {
  const queryClient = useQueryClient();
  const [transferType, setTransferType] = useState<TransferType>('warehouse_to_staff');
  const [fromId, setFromId] = useState<string>(warehouseId || '');
  const [toId, setToId] = useState<string>('');
  const [productId, setProductId] = useState<string>(defaultProductId || '');
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, name').eq('is_active', true);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: staff } = useQuery({
    queryKey: ['staff_directory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_directory').select('user_id, full_name, role').eq('is_active', true).in('role', ['agent', 'manager']);
      if (error) throw error;
      return data || [];
    }
  });

  // Source Stock Logic
  const { data: sourceStock } = useQuery({
    queryKey: ['source_stock', transferType, fromId, productId],
    queryFn: async () => {
      if (!fromId) return [];
      
      let query;
      if (transferType === 'warehouse_to_staff') {
        query = supabase.from('product_stock').select('product_id, quantity, product:products(id, name, sku, unit, base_price)').eq('warehouse_id', fromId).gt('quantity', 0);
      } else {
        query = supabase.from('staff_stock').select('product_id, quantity, product:products(id, name, sku, unit, base_price)').eq('user_id', fromId).gt('quantity', 0);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      if (productId) return data?.filter(s => s.product_id === productId) || [];
      return data || [];
    },
    enabled: !!fromId
  });

  const selectedStock = sourceStock?.find(s => s.product_id === productId);
  const maxQuantity = selectedStock?.quantity || 0;

  const handleSubmit = async () => {
    try {
      const qty = parseFloat(quantity);
      if (!qty || qty <= 0) throw new Error("Quantity must be greater than 0");
      if (qty > maxQuantity && transferType !== 'staff_to_warehouse') throw new Error(`Insufficient stock. Max available: ${maxQuantity}`);
      if (!fromId) throw new Error("Source is required");
      if (!toId) throw new Error("Destination is required");
      if (!productId) throw new Error("Product is required");
      if (fromId === toId) throw new Error("Source and destination cannot be the same");

      setIsSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const productPrice = selectedStock?.product?.base_price || 0;

      if (transferType === 'warehouse_to_staff') {
        const { data: wStock } = await supabase.from('product_stock').select('quantity').eq('product_id', productId).eq('warehouse_id', fromId).single();
        if ((wStock?.quantity || 0) < qty) throw new Error('Insufficient warehouse stock');
        
        await supabase.from('product_stock').update({ quantity: wStock.quantity - qty, updated_at: new Date().toISOString() }).eq('product_id', productId).eq('warehouse_id', fromId);

        const { data: existing } = await supabase.from('staff_stock').select('id, quantity, transfer_count').eq('user_id', toId).eq('product_id', productId).eq('warehouse_id', fromId).maybeSingle();
        if (existing) {
          await supabase.from('staff_stock').update({ quantity: existing.quantity + qty, amount_value: (existing.quantity + qty) * productPrice, transfer_count: (existing.transfer_count || 0) + 1, last_received_at: new Date().toISOString(), is_negative: false, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('staff_stock').insert({ user_id: toId, warehouse_id: fromId, product_id: productId, quantity: qty, amount_value: qty * productPrice, transfer_count: 1, last_received_at: new Date().toISOString(), is_negative: false });
        }

        const display_id = `TRF-${Date.now().toString(36).toUpperCase()}`;
        await supabase.from('stock_transfers').insert({ display_id, transfer_type: 'warehouse_to_staff', from_warehouse_id: fromId, to_user_id: toId, product_id: productId, quantity: qty, status: 'completed', created_by: user.id, description: notes || null });
        await supabase.from('stock_movements').insert({ product_id: productId, warehouse_id: fromId, quantity: -qty, type: 'transfer_out', reason: `Transfer to staff`, reference_id: display_id, created_by: user.id });

      } else if (transferType === 'staff_to_warehouse') {
        const display_id = `TRF-${Date.now().toString(36).toUpperCase()}`;
        await supabase.from('stock_transfers').insert({ display_id, transfer_type: 'staff_to_warehouse', from_user_id: fromId, to_warehouse_id: toId, product_id: productId, quantity: qty, status: 'pending', created_by: user.id, description: notes || null });

      } else if (transferType === 'staff_to_staff') {
        const homeWarehouse = warehouseId || warehouses?.[0]?.id;
        const { data: sStock } = await supabase.from('staff_stock').select('id, quantity').eq('user_id', fromId).eq('product_id', productId).maybeSingle();
        if (!sStock || sStock.quantity < qty) throw new Error('Insufficient staff stock');
        
        await supabase.from('staff_stock').update({ quantity: sStock.quantity - qty, amount_value: (sStock.quantity - qty) * productPrice, updated_at: new Date().toISOString() }).eq('id', sStock.id);

        const { data: existing } = await supabase.from('staff_stock').select('id, quantity, transfer_count').eq('user_id', toId).eq('product_id', productId).maybeSingle();
        if (existing) {
          await supabase.from('staff_stock').update({ quantity: existing.quantity + qty, amount_value: (existing.quantity + qty) * productPrice, transfer_count: (existing.transfer_count || 0) + 1, last_received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('staff_stock').insert({ user_id: toId, warehouse_id: homeWarehouse, product_id: productId, quantity: qty, amount_value: qty * productPrice, transfer_count: 1, last_received_at: new Date().toISOString(), is_negative: false });
        }

        const display_id = `TRF-${Date.now().toString(36).toUpperCase()}`;
        await supabase.from('stock_transfers').insert({ display_id, transfer_type: 'staff_to_staff', from_user_id: fromId, to_user_id: toId, product_id: productId, quantity: qty, status: 'completed', created_by: user.id, description: notes || null });
      }

      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
      toast.success("Transfer successful");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to process transfer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>Transfer Stock</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant={transferType === 'warehouse_to_staff' ? 'default' : 'outline'} onClick={() => { setTransferType('warehouse_to_staff'); setFromId(warehouseId || ''); setToId(''); setProductId(''); }}>W → Staff</Button>
            <Button variant={transferType === 'staff_to_warehouse' ? 'default' : 'outline'} onClick={() => { setTransferType('staff_to_warehouse'); setFromId(''); setToId(warehouseId || ''); setProductId(''); }}>Staff → W</Button>
            <Button variant={transferType === 'staff_to_staff' ? 'default' : 'outline'} onClick={() => { setTransferType('staff_to_staff'); setFromId(''); setToId(''); setProductId(''); }}>Staff ↔ Staff</Button>
          </div>

          <div className="space-y-2">
            <Label>From</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
              <SelectContent>
                {transferType === 'warehouse_to_staff' && warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                {(transferType === 'staff_to_warehouse' || transferType === 'staff_to_staff') && staff?.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder="Select Destination" /></SelectTrigger>
              <SelectContent>
                {(transferType === 'warehouse_to_staff' || transferType === 'staff_to_staff') && staff?.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                {transferType === 'staff_to_warehouse' && warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
              <SelectContent>
                {sourceStock?.map(s => <SelectItem key={s.product_id} value={s.product_id}>{s.product?.name} (Avail: {s.quantity})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min={1} placeholder={`Max available: ${maxQuantity}`} />
            {productId && <p className="text-xs text-muted-foreground">Source currently has {maxQuantity} available.</p>}
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for transfer" />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={isSubmitting || !fromId || !toId || !productId || !quantity} onClick={handleSubmit}>
              {isSubmitting ? 'Transferring...' : 'Transfer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
