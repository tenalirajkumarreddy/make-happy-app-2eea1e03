import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { afterSaleReturned } from "@/lib/mutationHelpers";

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

interface Sale {
  id: string;
  display_id: string;
  total_amount: number;
  outstanding_amount: number;
  store_id: string;
  customer_id: string;
  created_at: string;
  sale_items?: SaleItem[];
}

interface SaleReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onSuccess?: () => void;
}

const returnReasons = [
  "damaged",
  "defective",
  "wrong_item",
  "not_needed",
  "expired",
  "other",
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
  const [isDamaged, setIsDamaged] = useState(false);
  const { user: authUser } = useAuth();

  const { data: fetchedItems = [] } = useQuery({
    queryKey: ["sale-items-for-return", sale?.id],
    queryFn: async () => {
      if (!sale?.id || sale?.sale_items?.length) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total_price, products(name, sku, unit)")
        .eq("sale_id", sale.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!sale?.id && open && !sale?.sale_items?.length,
  });

  const items = sale?.sale_items?.length ? sale.sale_items : fetchedItems;

  useEffect(() => {
    if (!open) {
      setReason("");
      setOtherReason("");
      setNotes("");
      setIsDamaged(false);
    }
  }, [open]);

  const createReturn = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("No sale selected");
      if (!items || items.length === 0) {
        throw new Error("No items found for this sale");
      }

      const finalReason = reason === "Other" ? otherReason : reason;
      if (!finalReason?.trim()) {
        throw new Error("Please provide a reason for the return");
      }

      const payload = items.map((item: any) => ({
        sale_item_id: item.id,
        product_id: item.product_id,
        return_qty: item.quantity,
        damaged_qty: isDamaged ? item.quantity : 0,
        unit_price: item.unit_price,
      }));

      const { data: result, error } = await (supabase as any).rpc("record_sale_return", {
        p_sale_id: sale.id,
        p_returned_by: authUser?.id,
        p_reason: finalReason,
        p_items: payload,
        p_created_at: new Date().toISOString(),
        p_notes: notes.trim() || null,
      });

      if (error) throw error;
      return result;
    },
    onSuccess: (result: any) => {
      const row = (result as any)?.[0];
      const returnId = row?.return_id;
      const displayId = row?.display_id;
      toast.success(`Sale fully returned. New outstanding: ₹${(row?.new_outstanding ?? 0).toLocaleString()}`);

      if (returnId && displayId && authUser?.id) {
        const finalReason = reason === "Other" ? otherReason : reason;
        logActivity(authUser.id, "Full sale return processed", "sale_return", displayId, returnId, { saleId: sale?.id, reason: finalReason });
        
        getAdminUserIds().then(async (ids) => {
          const recipientIds = [...ids];

          // Fetch customer's user_id if present
          if (sale.customer_id) {
            try {
              const { data: custData } = await supabase
                .from("customers")
                .select("user_id")
                .eq("id", sale.customer_id)
                .maybeSingle();
              if (custData?.user_id) {
                recipientIds.push(custData.user_id);
              }
            } catch (err) {
              console.error("Failed to fetch customer user_id for return notification", err);
            }
          }

          const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id !== authUser?.id)));
          if (uniqueRecipients.length > 0) {
            sendNotificationToMany(uniqueRecipients, {
              title: "Sale Returned",
              message: `Full return for sale #${displayId}${isDamaged ? " (Damaged Items)" : ""}`,
              type: "payment",
              entityType: "sale_return",
              entityId: returnId,
            });
          }
        });
      }

      onOpenChange(false);
      afterSaleReturned(qc, { saleId: sale.id, storeId: sale.store_id, returnData: result?.[0] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to process return");
    },
  });

  if (!sale) return null;

  const returnTotal = items.reduce((sum: number, i: any) => sum + i.quantity * i.unit_price, 0);
  const newOutstanding = Math.max(0, (sale.outstanding_amount ?? 0) - returnTotal);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Full Sale Return</DialogTitle>
          <DialogDescription>
            Sale: {sale.display_id} | Total: ₹{sale.total_amount.toLocaleString()} | Date: {format(new Date(sale.created_at), "dd MMM yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              All {items.length} item(s) will be fully returned. Stock will be restored and outstanding adjusted.
            </AlertDescription>
          </Alert>

          {/* Items being returned */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4" />
              Items to Return ({items.length})
            </Label>
            <div className="rounded-lg border divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium truncate flex-1">
                    {item.products?.name || "Product"}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ×{item.quantity} @ ₹{item.unit_price.toLocaleString()}
                  </span>
                  <span className="text-sm font-semibold ml-3 w-20 text-right">
                    ₹{(item.quantity * item.unit_price).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Outstanding summary */}
          <div className="rounded-lg bg-muted p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current outstanding:</span>
              <span>₹{(sale.outstanding_amount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Return adjustment:</span>
              <span className="text-red-500">-₹{returnTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-1.5">
              <span>New outstanding:</span>
              <span>₹{newOutstanding.toLocaleString()}</span>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Return Reason *</Label>
            <Select 
              value={reason} 
              onValueChange={(val) => {
                setReason(val);
                if (val === "damaged") {
                  setIsDamaged(true);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="damaged">Damaged Product</SelectItem>
                <SelectItem value="defective">Defective/Quality Issue</SelectItem>
                <SelectItem value="wrong_item">Wrong Item Delivered</SelectItem>
                <SelectItem value="not_needed">Not Needed Anymore</SelectItem>
                <SelectItem value="expired">Expired Product</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm bg-muted/40">
            <div className="space-y-0.5 max-w-[80%]">
              <Label className="text-sm font-semibold">Mark returned items as damaged?</Label>
              <p className="text-xs text-muted-foreground">
                If checked, these items will go directly to wastage and will NOT be added back to inventory.
              </p>
            </div>
            <Switch
              checked={isDamaged}
              onCheckedChange={setIsDamaged}
            />
          </div>

          {reason === "other" && (
            <div className="space-y-1.5">
              <Label>Specify Reason *</Label>
              <input
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Enter reason"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setReason(""); setOtherReason(""); setNotes(""); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={() => createReturn.mutate()} disabled={createReturn.isPending || !reason}>
            {createReturn.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm Full Return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}