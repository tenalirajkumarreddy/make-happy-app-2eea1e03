import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { toast } from "sonner";
import { Loader2, X, Package, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface StockAdjustmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADJUSTMENT_REASONS = [
  "Stock Count Correction",
  "Damaged Goods",
  "Expired Products",
  "Theft/Loss",
  "Received from Supplier",
  "Return from Customer",
  "Other",
];

export function StockAdjustmentSheet({ open, onOpenChange }: StockAdjustmentSheetProps) {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [productId, setProductId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch products for picker
  const { data: products = [] } = useQuery({
    queryKey: ["mobile-products-for-adjustment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch current stock for selected product
  const { data: currentStock } = useQuery({
    queryKey: ["mobile-stock-for-adjustment", productId, currentWarehouse?.id],
    queryFn: async () => {
      if (!productId || !currentWarehouse?.id) return null;
      const { data, error } = await supabase
        .from("product_stock")
        .select("quantity")
        .eq("product_id", productId)
        .eq("warehouse_id", currentWarehouse.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!productId && !!currentWarehouse?.id,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Select a product");
      if (!quantity || Number(quantity) <= 0) throw new Error("Enter a valid quantity");
      if (!reason) throw new Error("Select a reason");
      if (!currentWarehouse?.id) throw new Error("No warehouse selected");
      if (!user?.id) throw new Error("Not authenticated");

      const qty = Number(quantity);
      const adjustedQty = adjustmentType === "add" ? qty : -qty;

      // Use the existing record_stock_movement RPC
      const { data, error } = await supabase.rpc("record_stock_movement" as any, {
        p_product_id: productId,
        p_warehouse_id: currentWarehouse.id,
        p_quantity: adjustedQty,
        p_reason: reason,
        p_notes: notes || null,
        p_user_id: user.id,
      } as any);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Stock adjusted successfully");
      qc.invalidateQueries({ queryKey: ["mobile-inventory"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to adjust stock");
    },
  });

  const resetForm = () => {
    setProductId("");
    setQuantity("");
    setReason("");
    setNotes("");
    setAdjustmentType("add");
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 !p-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Adjust Stock</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {/* Product Picker */}
            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Stock Display */}
            {currentStock && (
              <div className="rounded-xl bg-muted p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current Stock</span>
                <span className="text-sm font-bold">{currentStock.quantity}</span>
              </div>
            )}

            {/* Adjustment Type */}
            <div className="space-y-1.5">
              <Label>Adjustment Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={adjustmentType === "add" ? "default" : "outline"}
                  className={adjustmentType === "add" ? "bg-success hover:bg-success/90" : ""}
                  onClick={() => setAdjustmentType("add")}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Stock
                </Button>
                <Button
                  type="button"
                  variant={adjustmentType === "remove" ? "default" : "outline"}
                  className={adjustmentType === "remove" ? "bg-destructive hover:bg-destructive/90" : ""}
                  onClick={() => setAdjustmentType("remove")}
                >
                  <Minus className="h-4 w-4 mr-1" /> Remove Stock
                </Button>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="h-10 text-sm rounded-xl"
              />
              {currentStock && quantity && (
                <p className="text-xs text-muted-foreground">
                  New stock will be: {adjustmentType === "add"
                    ? currentStock.quantity + Number(quantity)
                    : Math.max(0, currentStock.quantity - Number(quantity))}
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className="text-sm rounded-xl"
              />
            </div>

            {/* Warning for large adjustments */}
            {quantity && Number(quantity) > 100 && (
              <div className="rounded-xl bg-warning/10 border border-warning/30 p-3">
                <p className="text-xs text-warning font-medium">
                  Large adjustment: You are {adjustmentType === "adding" ? "adding" : "removing"} {quantity} units. Please verify this is correct.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-5">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending || !productId || !quantity || !reason}
              className={adjustmentType === "add" ? "bg-success hover:bg-success/90" : "bg-destructive hover:bg-destructive/90"}
            >
              {adjustMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {adjustmentType === "add" ? "Add Stock" : "Remove Stock"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
