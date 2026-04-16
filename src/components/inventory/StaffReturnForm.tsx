import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffStock } from "@/hooks/inventory/useStaffStock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface StaffReturnFormProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId: string;
}

export function StaffReturnForm({ isOpen, onClose, warehouseId }: StaffReturnFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { staffStock: stock, isLoadingStock: isStockLoading } = useStaffStock({ userId: user?.id, warehouseId });

  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState<string>("");

  const selectedStock = stock?.find((s) => s.product_id === productId);
  const maxQuantity = selectedStock?.quantity || 0;

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User unauthenticated");
      if (!productId) throw new Error("Please select a product");
      if (quantity <= 0) throw new Error("Quantity must be greater than 0");
      if (quantity > maxQuantity) throw new Error(`You only have ${maxQuantity} in stock`);

      const displayId = `TRF-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase
        .from("stock_transfers")
        .insert({
          display_id: displayId,
          transfer_type: "staff_to_warehouse",
          from_user_id: user.id,
          to_warehouse_id: warehouseId,
          product_id: productId,
          quantity: quantity,
          status: "pending",
          description: reason,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Return request submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["staff-stock", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["pending-returns", warehouseId] });
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit return request");
    },
  });

  const resetForm = () => {
    setProductId("");
    setQuantity(0);
    setReason("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    returnMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Submit Stock Return</DialogTitle>
          <DialogDescription>
            Return excess or unsold stock to the warehouse for review.
          </DialogDescription>
        </DialogHeader>

        <form id="return-form" onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product">Product</Label>
            <Select value={productId} onValueChange={setProductId} disabled={isStockLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {stock && stock.length > 0 ? (
                  stock.map((item) => (
                    <SelectItem key={item.product_id} value={item.product_id}>
                      {item.product?.name} (In stock: {item.quantity})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="empty" disabled>
                    No available stock to return
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {productId && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="quantity">Quantity to Return</Label>
                <span className="text-xs text-muted-foreground">
                  Max: {maxQuantity}
                </span>
              </div>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="E.g., End of shift, customer cancelled..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="return-form" 
            disabled={!productId || quantity <= 0 || quantity > maxQuantity || returnMutation.isPending}
          >
            {returnMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Submit Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

