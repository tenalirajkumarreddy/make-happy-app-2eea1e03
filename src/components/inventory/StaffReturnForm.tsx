import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeftRight, AlertCircle, Package, DollarSign, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

interface StaffReturnFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const RETURN_REASONS = [
  { value: "end_of_day", label: "End of Day" },
  { value: "route_completed", label: "Route Completed" },
  { value: "unsold_stock", label: "Unsold Stock" },
  { value: "damaged_goods", label: "Damaged Goods" },
  { value: "expired", label: "Expired Items" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "other", label: "Other" },
];

interface ReturnItem {
  product_id: string;
  product_name: string;
  current_quantity: number;
  unit_price: number;
  return_quantity: number;
  notes: string;
}

export function StaffReturnForm({ isOpen, onClose }: StaffReturnFormProps) {
  const { user } = useAuth();
  const { stockItems } = useStaffStock();
  const queryClient = useQueryClient();
  const [returnReason, setReturnReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<ReturnItem[]>([]);
  const [error, setError] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!returnReason) throw new Error("Please select a reason");
      if (selectedItems.length === 0) throw new Error("Please select at least one item");
      if (selectedItems.some((item) => item.return_quantity <= 0)) {
        throw new Error("Please specify return quantity for all items");
      }

      // Get warehouse ID from staff stock
      const warehouseId = stockItems?.[0]?.warehouse_id;
      if (!warehouseId) throw new Error("No warehouse assigned");

      const items = selectedItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.return_quantity,
        notes: item.notes,
      }));

      const { data, error } = await supabase.rpc("submit_stock_return", {
        p_staff_id: user.id,
        p_warehouse_id: warehouseId,
        p_return_reason: returnReason,
        p_custom_reason: returnReason === "other" ? customReason : null,
        p_items: items,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Return request ${data.display_id} submitted successfully`);
        queryClient.invalidateQueries({ queryKey: ["my-return-requests"] });
        queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
        onClose();
        resetForm();
      } else {
        setError(data.error || "Failed to submit return");
      }
    },
    onError: (error: any) => {
      setError(error.message || "Failed to submit return");
    },
  });

  const resetForm = () => {
    setReturnReason("");
    setCustomReason("");
    setSelectedItems([]);
    setError("");
  };

  const toggleItem = (item: any) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.product_id === item.product_id);
      if (exists) {
        return prev.filter((i) => i.product_id !== item.product_id);
      }
      return [
        ...prev,
        {
          product_id: item.product_id,
          product_name: item.product?.name,
          current_quantity: item.quantity,
          unit_price: item.product?.base_price || 0,
          return_quantity: item.quantity,
          notes: "",
        },
      ];
    });
  };

  const updateItemQuantity = (productId: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, return_quantity: quantity } : item
      )
    );
  };

  const updateItemNotes = (productId: string, notes: string) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, notes } : item
      )
    );
  };

  const totalValue = selectedItems.reduce(
    (sum, item) => sum + item.return_quantity * item.unit_price,
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    submitMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
            Return Stock to Warehouse
          </DialogTitle>
          <DialogDescription>
            Select items to return with quantities
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Return Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Return Reason *</Label>
            <Select value={returnReason} onValueChange={setReturnReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason */}
          {returnReason === "other" && (
            <div className="space-y-2">
              <Label htmlFor="customReason">Specify Reason *</Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Explain the reason for return..."
                required
              />
            </div>
          )}

          {/* Select Items */}
          <div className="space-y-2">
            <Label>Select Items to Return</Label>
            <div className="border rounded-lg p-4 space-y-2 max-h-[300px] overflow-y-auto">
              {stockItems?.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No stock to return</p>
                </div>
              ) : (
                stockItems?.map((item) => {
                  const selected = selectedItems.find(
                    (i) => i.product_id === item.product_id
                  );
                  const isSelected = !!selected;

                  return (
                    <Card
                      key={item.product_id}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "border-amber-500 bg-amber-50/50" : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleItem(item)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{item.product?.name}</div>
                              <Badge variant="outline">
                                <DollarSign className="h-3 w-3 mr-1" />
                                {formatCurrency(item.product?.base_price || 0)} / unit
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Current: {item.quantity} units • Value: {formatCurrency(item.amount_value)}
                            </div>

                            {isSelected && (
                              <div className="mt-3 space-y-2 border-t pt-2">
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm shrink-0">Return:</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max={item.quantity}
                                    value={selected.return_quantity}
                                    onChange={(e) =>
                                      updateItemQuantity(
                                        item.product_id,
                                        parseInt(e.target.value) || 0
                                      )
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-20"
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    of {item.quantity}
                                  </span>
                                </div>
                                <Textarea
                                  placeholder="Notes (optional)"
                                  value={selected.notes}
                                  onChange={(e) =>
                                    updateItemNotes(item.product_id, e.target.value)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm"
                                  rows={2}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* Summary */}
          {selectedItems.length > 0 && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Items Selected</div>
                  <div className="font-semibold">{selectedItems.length} products</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Return Value</div>
                  <div className="font-semibold text-amber-600">{formatCurrency(totalValue)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMutation.isPending || selectedItems.length === 0}
            >
              {submitMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Return Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
