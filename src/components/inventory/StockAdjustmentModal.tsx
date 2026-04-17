import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PackagePlus, PackageMinus, RefreshCw, Undo2, AlertOctagon, ArrowDownToLine, ArrowUpToLine } from "lucide-react";

export interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId: string;
  defaultProductId?: string;
}

type AdjustmentType = 'purchase' | 'sale' | 'correction' | 'return' | 'damaged_lost' | 'transfer_in' | 'transfer_out';

const ADJUSTMENT_TYPES: { id: AdjustmentType, label: string, icon: React.ElementType, type: string, color: string }[] = [
  { id: 'purchase', label: 'Purchase', icon: PackagePlus, type: 'purchase', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { id: 'sale', label: 'Sale', icon: PackageMinus, type: 'sale', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { id: 'correction', label: 'Correction', icon: RefreshCw, type: 'adjustment', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { id: 'return', label: 'Return', icon: Undo2, type: 'return', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  { id: 'damaged_lost', label: 'Damaged/Lost', icon: AlertOctagon, type: 'adjustment', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { id: 'transfer_in', label: 'Transfer In', icon: ArrowDownToLine, type: 'transfer_in', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { id: 'transfer_out', label: 'Transfer Out', icon: ArrowUpToLine, type: 'transfer_out', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
];

export function StockAdjustmentModal({ isOpen, onClose, warehouseId, defaultProductId }: StockAdjustmentModalProps) {
  const queryClient = useQueryClient();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('purchase');
  const [productId, setProductId] = useState<string>(defaultProductId || '');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('Purchase');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProductId(defaultProductId || '');
    setAdjustmentType('purchase');
    setQuantity('');
    setReason('Purchase');
  }, [isOpen, defaultProductId]);

  const { data: stockItems } = useQuery({
    queryKey: ['warehouse-stock', warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_stock')
        .select('id, quantity, product:products(id, name, sku)')
        .eq('warehouse_id', warehouseId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!warehouseId
  });

  const { data: allProducts } = useQuery({
    queryKey: ['all-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, sku').eq('is_active', true);
      if (error) throw error;
      return data || [];
    }
  });

  const selectedStock = stockItems?.find(s => s.product?.id === productId);
  const currentQuantity = selectedStock?.quantity || 0;

  const negativeTypes = ['sale', 'damaged_lost', 'transfer_out'];
  const isNegative = negativeTypes.includes(adjustmentType);
  const projectedQuantity = currentQuantity + (isNegative ? -(parseFloat(quantity) || 0) : +(parseFloat(quantity) || 0));

  const handleSubmit = async () => {
    try {
      if (!warehouseId) throw new Error("Warehouse is required");
      const qty = parseFloat(quantity);
      if (!qty || qty <= 0) throw new Error("Quantity must be greater than 0");
      if (!productId) throw new Error("Product is required");

      setIsSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const delta = isNegative ? -Math.abs(qty) : Math.abs(qty);
      const newQty = currentQuantity + delta;

      const { data: setting } = await supabase.from('company_settings').select('value').eq('key', 'allow_negative_stock').maybeSingle();
      if (setting?.value !== 'true' && newQty < 0) {
        throw new Error(`Insufficient stock. Current: ${currentQuantity}, Requested: ${Math.abs(delta)}`);
      }

      if (selectedStock?.id) {
        await supabase.from('product_stock').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', selectedStock.id);
      } else {
        await supabase.from('product_stock').insert({ product_id: productId, warehouse_id: warehouseId, quantity: newQty });
      }

      const typeConfig = ADJUSTMENT_TYPES.find(t => t.id === adjustmentType);
      await supabase.from('stock_movements').insert({ product_id: productId, warehouse_id: warehouseId, quantity: delta, type: typeConfig?.type || 'adjustment', reason: reason || adjustmentType, created_by: user.id });

      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Stock adjusted successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader><DialogTitle>Adjust Stock</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
              <SelectContent>
                {allProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''} - Cap: {stockItems?.find(s => s.product?.id === p.id)?.quantity || 0}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {ADJUSTMENT_TYPES.map(t => {
                const Icon = t.icon;
                const isSelected = adjustmentType === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => { setAdjustmentType(t.id); setReason(t.label); }} className={`flex flex-col items-center justify-center p-3 rounded-md border text-sm transition-all ${isSelected ? t.color + ' border-transparent font-medium shadow-sm' : 'bg-background hover:bg-muted border-border text-muted-foreground'}`}>
                    <Icon className="h-5 w-5 mb-1" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{isNegative ? "Quantity to Remove" : "Quantity to Add"}</Label>
            <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min={1} placeholder="0" />
            <p className={`text-xs ${projectedQuantity < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>Preview: {currentQuantity} → {projectedQuantity}</p>
          </div>

          <div className="space-y-2">
            <Label>Reason / Notes</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={isSubmitting || !productId || !quantity} onClick={handleSubmit}>
              {isSubmitting ? 'Saving...' : 'Save Adjustment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
