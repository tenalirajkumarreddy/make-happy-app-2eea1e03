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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PackagePlus, PackageMinus, RefreshCw, Undo2, AlertOctagon, ArrowDownToLine, ArrowUpToLine, AlertCircle } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }
    setProductId(defaultProductId || '');
    setAdjustmentType('purchase');
    setQuantity('');
    setReason('Purchase');
    setError(null);
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
  const qtyValue = parseFloat(quantity) || 0;
  const projectedQuantity = currentQuantity + (isNegative ? -qtyValue : qtyValue);

  const handleSubmit = async () => {
    try {
      setError(null);
      
      if (!warehouseId) {
        setError("Warehouse is required");
        return;
      }
      
      const qty = parseFloat(quantity);
      if (!qty || qty <= 0) {
        setError("Quantity must be greater than 0");
        return;
      }
      
      if (!productId) {
        setError("Product is required");
        return;
      }

      setIsSubmitting(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        return;
      }

      // Calculate quantity change (negative for removals)
      const quantityChange = isNegative ? -Math.abs(qty) : Math.abs(qty);
      
      // Get the type for the RPC
      const typeConfig = ADJUSTMENT_TYPES.find(t => t.id === adjustmentType);
      const adjustmentTypeForRpc = typeConfig?.type || 'adjustment';

    // Call the atomic adjust_stock RPC
    const { data: result, error: rpcError } = await supabase.rpc('adjust_stock', {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity_change: quantityChange,
      p_adjustment_type: adjustmentTypeForRpc,
      p_reason: reason || adjustmentType,
      p_created_by: user.id
    });

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to adjust stock');
      }

      // Check if the RPC returned an error
      if (result && !result.success) {
        throw new Error(result.error || 'Stock adjustment failed');
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      
      toast.success(`Stock adjusted successfully. Previous: ${result?.previous_quantity || currentQuantity}, New: ${result?.new_quantity || projectedQuantity}`);
      onClose();
    } catch (err: any) {
      console.error('Stock adjustment error:', err);
      setError(err.message || "Failed to adjust stock");
      toast.error(err.message || "Failed to adjust stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader><DialogTitle>Adjust Stock</DialogTitle></DialogHeader>
        
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
              <SelectContent>
                {allProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''} - Current: {stockItems?.find(s => s.product?.id === p.id)?.quantity || 0}</SelectItem>
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
            <Input 
              type="number" 
              value={quantity} 
              onChange={e => {
                setQuantity(e.target.value);
                setError(null);
              }} 
              min={1} 
              placeholder="0" 
            />
            <p className={`text-xs ${projectedQuantity < 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
              Preview: {currentQuantity} → {projectedQuantity}
              {projectedQuantity < 0 && (
                <span className="block mt-1">⚠️ This would result in negative stock</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Reason / Notes</Label>
            <Textarea 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              placeholder="Enter reason for adjustment..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button 
              disabled={isSubmitting || !productId || !quantity || parseFloat(quantity) <= 0} 
              onClick={handleSubmit}
            >
              {isSubmitting ? 'Saving...' : 'Save Adjustment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
