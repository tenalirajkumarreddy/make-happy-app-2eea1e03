import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, Package, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";

interface Sale {
  id: string;
  display_id: string;
  total_amount: number;
  outstanding_amount: number;
  store_id: string;
  customer_id: string;
  created_at: string;
}

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
}

interface ReturnItem {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  max_qty: number;
  unit_price: number;
  selected: boolean;
}

interface SaleReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onSuccess?: () => void;
}

const returnReasons = [
  "Defective product",
  "Wrong product delivered",
  "Customer changed mind",
  "Product not as described",
  "Damaged in transit",
  "Expired product",
  "Delivered by mistake",
  "Other",
];

export function SaleReturnDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
}: SaleReturnDialogProps) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [cashRefund, setCashRefund] = useState("");
  const [upiRefund, setUpiRefund] = useState("");

  // Fetch sale items when sale is selected
  const { data: saleItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["sale-items-for-return", sale?.id],
    queryFn: async () => {
      if (!sale?.id) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total_price, products(name, sku, unit)")
        .eq("sale_id", sale.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!sale?.id && open,
  });

  // Initialize return items when sale items load
  useEffect(() => {
    if (saleItems.length > 0 && returnItems.length === 0) {
      const items: ReturnItem[] = saleItems.map((si: SaleItem) => ({
        sale_item_id: si.id,
        product_id: si.product_id,
        product_name: si.products?.name || "Unknown Product",
        quantity: 0,
        max_qty: si.quantity,
        unit_price: si.unit_price,
        selected: false,
      }));
      setReturnItems(items);
    }
  }, [saleItems]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setReason("");
    setOtherReason("");
    setNotes("");
    setReturnItems([]);
    setCashRefund("");
    setUpiRefund("");
  };

  const toggleItem = (index: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[index].selected = !updated[index].selected;
      // If selecting, set default quantity to max
      if (updated[index].selected && updated[index].quantity === 0) {
        updated[index].quantity = updated[index].max_qty;
      }
      return updated;
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      updated[index].quantity = Math.max(0, Math.min(newQty, updated[index].max_qty));
      // Auto-select if quantity > 0
      if (updated[index].quantity > 0) {
        updated[index].selected = true;
      }
      return updated;
    });
  };

  const setQuantity = (index: number, qty: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[index].quantity = Math.max(0, Math.min(qty, updated[index].max_qty));
      if (updated[index].quantity > 0) {
        updated[index].selected = true;
      }
      return updated;
    });
  };

  const calculateReturnTotal = () => {
    return returnItems
      .filter((item) => item.selected && item.quantity > 0)
      .reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const selectedItems = returnItems.filter((item) => item.selected && item.quantity > 0);
  const returnTotal = calculateReturnTotal();
  const cashRefundAmount = parseFloat(cashRefund) || 0;
  const upiRefundAmount = parseFloat(upiRefund) || 0;
  const totalRefund = cashRefundAmount + upiRefundAmount;

  const createReturn = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("No sale selected");

      const itemsToReturn = selectedItems.map((item) => ({
        sale_item_id: item.sale_item_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
      }));

      if (itemsToReturn.length === 0) {
        throw new Error("Please select at least one item to return");
      }

      const finalReason = reason === "Other" ? otherReason : reason;
      if (!finalReason?.trim()) {
        throw new Error("Please provide a reason for the return");
      }

      // Get sale details for store/customer
      const { data: saleData } = await supabase
        .from("sales")
        .select("store_id, customer_id")
        .eq("id", sale.id)
        .single();

      // Generate display ID
      const { data: displayId, error: displayError } = await supabase.rpc("generate_display_id", {
        prefix: "SRET",
        seq_name: "sale_return_display_seq",
      });
      if (displayError) throw displayError;

      // Create sale return
      const { data: newReturn, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          display_id: displayId,
          sale_id: sale.id,
          store_id: saleData?.store_id,
          customer_id: saleData?.customer_id,
          total_amount: returnTotal,
          cash_refund: cashRefundAmount,
          upi_refund: upiRefundAmount,
          reason: finalReason,
          notes: notes || null,
          status: "pending",
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // Create return items
      const { error: itemsError } = await supabase.from("sale_return_items").insert(
        itemsToReturn.map((item) => ({
          return_id: newReturn.id,
          sale_item_id: item.sale_item_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }))
      );

      if (itemsError) throw itemsError;

      return newReturn;
    },
    onSuccess: () => {
      toast.success("Sale return created successfully");
      resetForm();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["sale-returns"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create return");
    },
  });

  const handleSubmit = () => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    if (reason === "Other" && !otherReason.trim()) {
      toast.error("Please specify the reason");
      return;
    }
    if (totalRefund > returnTotal) {
      toast.error("Refund amount cannot exceed return total");
      return;
    }
    createReturn.mutate();
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Process Sale Return</DialogTitle>
          <DialogDescription>
            Sale: {sale.display_id} | Total: ₹{sale.total_amount.toLocaleString()} | Date: {format(new Date(sale.created_at), "dd MMM yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Select items to return. Outstanding will be reduced by up to ₹{sale.outstanding_amount.toLocaleString()}
            </AlertDescription>
          </Alert>

          {/* Items Selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Select Items to Return
            </Label>
            
            {loadingItems ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : saleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items found for this sale.</p>
            ) : (
              <div className="space-y-2">
                {returnItems.map((item, index) => (
                  <div
                    key={item.sale_item_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      item.selected ? "bg-primary/5 border-primary/30" : "bg-card"
                    }`}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(index)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Max: {item.max_qty} | ₹{item.unit_price.toLocaleString()} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(index, -1)}
                        disabled={!item.selected}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        max={item.max_qty}
                        value={item.quantity}
                        onChange={(e) => setQuantity(index, parseInt(e.target.value) || 0)}
                        className="w-16 h-7 text-center text-sm"
                        disabled={!item.selected}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(index, 1)}
                        disabled={!item.selected || item.quantity >= item.max_qty}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-20 text-right">
                      <p className="font-medium text-sm">
                        ₹{(item.quantity * item.unit_price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Return Summary */}
          {selectedItems.length > 0 && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items to return:</span>
                <span className="font-medium">{selectedItems.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total quantity:</span>
                <span className="font-medium">{selectedItems.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t pt-2">
                <span>Return Total:</span>
                <span>₹{returnTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Refund Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cash Refund (Optional)</Label>
              <Input
                type="number"
                min={0}
                max={returnTotal}
                value={cashRefund}
                onChange={(e) => setCashRefund(e.target.value)}
                placeholder="0"
                disabled={selectedItems.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label>UPI Refund (Optional)</Label>
              <Input
                type="number"
                min={0}
                max={returnTotal}
                value={upiRefund}
                onChange={(e) => setUpiRefund(e.target.value)}
                placeholder="0"
                disabled={selectedItems.length === 0}
              />
            </div>
          </div>
          {totalRefund > 0 && (
            <p className={`text-sm ${totalRefund > returnTotal ? "text-destructive" : "text-muted-foreground"}`}>
              Total refund: ₹{totalRefund.toLocaleString()} 
              {totalRefund > returnTotal && " (exceeds return amount)"}
            </p>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label>Return Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {returnReasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "Other" && (
            <div className="space-y-2">
              <Label>Specify Reason *</Label>
              <Input
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Enter reason"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createReturn.isPending || selectedItems.length === 0}
          >
            {createReturn.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create Return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
