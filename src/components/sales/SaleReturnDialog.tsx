import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Sale {
  id: string;
  display_id: string;
  total_amount: number;
  outstanding_amount: number;
  store_id: string;
  customer_id: string;
  sale_items?: Array<{
    product_id: string;
    product_name?: string;
    quantity: number;
    unit_price: number;
  }>;
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
  "Other",
];

export function SaleReturnDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
}: SaleReturnDialogProps) {
  const qc = useQueryClient();
  const [returnType, setReturnType] = useState<"full" | "partial">("partial");
  const [returnAmount, setReturnAmount] = useState("");
  const [cashRefund, setCashRefund] = useState("");
  const [upiRefund, setUpiRefund] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");

  const createReturn = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("No sale selected");

      const amount = parseFloat(returnAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid return amount");
      }

      const cash = parseFloat(cashRefund) || 0;
      const upi = parseFloat(upiRefund) || 0;

      if (cash + upi > amount) {
        throw new Error("Refund amounts exceed return total");
      }

      const { data: displayId } = await supabase.rpc("generate_display_id", {
        prefix: "RET",
        seq_name: "return_display_seq",
      });

      const finalReason = reason === "Other" ? otherReason : reason;

      const { data, error } = await supabase.rpc("process_sale_return", {
        p_display_id: displayId,
        p_sale_id: sale.id,
        p_return_amount: amount,
        p_reason: finalReason,
        p_return_items: sale.sale_items
          ? JSON.stringify(
              sale.sale_items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
              }))
            )
          : null,
        p_return_type: returnType,
        p_cash_refund: cash,
        p_upi_refund: upi,
        p_notes: notes || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Return request submitted for approval");
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

  const resetForm = () => {
    setReturnType("partial");
    setReturnAmount("");
    setCashRefund("");
    setUpiRefund("");
    setReason("");
    setOtherReason("");
    setNotes("");
  };

  const handleSubmit = () => {
    if (!reason || (reason === "Other" && !otherReason)) {
      toast.error("Please select a reason");
      return;
    }
    createReturn.mutate();
  };

  if (!sale) return null;

  const maxReturn = Math.min(sale.total_amount, sale.outstanding_amount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Sale Return</DialogTitle>
          <DialogDescription>
            Sale: {sale.display_id} | Total: ₹{sale.total_amount.toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Return will reduce outstanding by up to ₹
              {sale.outstanding_amount.toLocaleString()}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Return Type</Label>
            <Select
              value={returnType}
              onValueChange={(v) => {
                setReturnType(v as "full" | "partial");
                if (v === "full") {
                  setReturnAmount(maxReturn.toString());
                } else {
                  setReturnAmount("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Return</SelectItem>
                <SelectItem value="partial">Partial Return</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Return Amount *</Label>
            <Input
              type="number"
              value={returnAmount}
              onChange={(e) => setReturnAmount(e.target.value)}
              placeholder={`Max: ₹${maxReturn.toLocaleString()}`}
              max={maxReturn}
              disabled={returnType === "full"}
            />
            <p className="text-xs text-muted-foreground">
              Maximum: ₹{maxReturn.toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cash Refund</Label>
              <Input
                type="number"
                value={cashRefund}
                onChange={(e) => setCashRefund(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>UPI Refund</Label>
              <Input
                type="number"
                value={upiRefund}
                onChange={(e) => setUpiRefund(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

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

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
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
          <Button onClick={handleSubmit} disabled={createReturn.isPending}>
            {createReturn.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Submit Return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
