import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ReturnReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: any; // Simplified type for prompt constraints
}

export function ReturnReviewModal({ isOpen, onClose, transfer }: ReturnReviewModalProps) {
  const queryClient = useQueryClient();
  const [actualQty, setActualQty] = useState<string>(transfer?.quantity?.toString() || "");
  const [diffOption, setDiffOption] = useState<"keep_with_staff" | "mark_as_error">("keep_with_staff");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diff = transfer ? transfer.quantity - (parseFloat(actualQty) || 0) : 0;

  const handleAccept = async () => {
    if (!transfer) return;
    try {
      setIsSubmitting(true);
      const aq = parseFloat(actualQty);
      if (isNaN(aq) || aq < 0) throw new Error("Invalid actual quantity");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const difference = transfer.quantity - aq;
      const productPrice = transfer.product?.base_price || 0;

      // 1. Update the transfer record
      await supabase.from("stock_transfers").update({
        status: "completed",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        actual_quantity: aq,
        difference: difference,
        action_taken: difference > 0 ? diffOption : null
      }).eq("id", transfer.id);

      // 2. Get current warehouse stock
      const { data: wStock } = await supabase.from("product_stock")
        .select("id, quantity").eq("product_id", transfer.product_id).eq("warehouse_id", transfer.to_warehouse_id).maybeSingle();

      // 3. Add actualQty to warehouse stock
      const newWarehouseQty = (wStock?.quantity ?? 0) + aq;
      if (wStock?.id) {
        await supabase.from("product_stock").update({ quantity: newWarehouseQty, updated_at: new Date().toISOString() }).eq("id", wStock.id);
      } else {
        await supabase.from("product_stock").insert({ product_id: transfer.product_id, warehouse_id: transfer.to_warehouse_id, quantity: aq });
      }

      // 4. Update staff_stock
      const { data: sStock } = await supabase.from("staff_stock")
        .select("id, quantity").eq("user_id", transfer.from_user_id).eq("product_id", transfer.product_id).maybeSingle(); // Assumes staff operates within one warehouse context per product mostly

      if (sStock) {
        let newStaffQty: number;
        if (difference === 0 || diffOption === "mark_as_error") {
          newStaffQty = Math.max(0, (sStock.quantity ?? 0) - transfer.quantity); // or just set to 0 if we assume full return
        } else {
          newStaffQty = difference; // if keeping difference with staff
        }
        await supabase.from("staff_stock").update({
          quantity: newStaffQty,
          is_negative: newStaffQty < 0,
          amount_value: newStaffQty * productPrice,
          updated_at: new Date().toISOString()
        }).eq("id", sStock.id);
      }

      // 5. Log return movement
      await supabase.from("stock_movements").insert({
        product_id: transfer.product_id,
        warehouse_id: transfer.to_warehouse_id,
        quantity: aq,
        type: "return",
        reason: `Staff return (${transfer.display_id}) ${notes ? '- '+notes : ''}`,
        reference_id: transfer.id,
        created_by: user.id
      });

      // 6. Log error movement if marked as error
      if (difference > 0 && diffOption === "mark_as_error") {
        await supabase.from("stock_movements").insert({
          product_id: transfer.product_id,
          warehouse_id: transfer.to_warehouse_id,
          quantity: -difference,
          type: "adjustment",
          reason: `Error/shortage on return (${transfer.display_id})`,
          reference_id: transfer.id,
          created_by: user.id
        });
      }

      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      
      toast.success("Return processed successfully");
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!transfer) return;
    setIsSubmitting(true);
    try {
      await supabase.from("stock_transfers").update({ status: "rejected" }).eq("id", transfer.id);
      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
      toast.success("Return request rejected");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transfer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review Return: {transfer.product?.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground mr-2">Requested:</span>
              <span className="font-semibold">{transfer.quantity}</span>
            </div>
            <div>
              <span className="text-muted-foreground mr-2">Expected in hand:</span>
              <span className="font-semibold">{transfer.quantity}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Actual Quantity Received</Label>
            <Input type="number" value={actualQty} onChange={(e) => setActualQty(e.target.value)} min={0} max={transfer.quantity} />
          </div>

          {diff > 0 && (
            <div className="space-y-3 p-4 border rounded-md bg-slate-50">
              <div className="flex items-center gap-2 text-amber-600 font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>Difference: {diff} unit{diff > 1 ? 's' : ''}</span>
              </div>
              <Label>Handle Difference:</Label>
              <RadioGroup value={diffOption} onValueChange={(v: "keep_with_staff" | "mark_as_error") => setDiffOption(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="keep_with_staff" id="keep" />
                  <Label htmlFor="keep" className="cursor-pointer">Keep with Staff ({diff} units stay with user)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mark_as_error" id="error" />
                  <Label htmlFor="error" className="cursor-pointer">Flag as Error (Staff stock drops to zero, variance logged)</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reviewer notes..." />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} disabled={isSubmitting}>Reject</Button>
          <Button onClick={handleAccept} disabled={isSubmitting}>{isSubmitting ? "Processing..." : "Approve Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
