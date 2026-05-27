import { useState, useEffect } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type EditHandoverDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handover: any | null;
  getName: (userId: string | null) => string;
  submitting: boolean;
  onSave: (handoverId: string, amount: string, status: string) => Promise<void>;
};

export function EditHandoverDialog({ open, onOpenChange, handover, getName, submitting, onSave }: EditHandoverDialogProps) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (handover) {
      setAmount((Number(handover.cash_amount) + Number(handover.upi_amount)).toString());
      setStatus(handover.status);
    }
  }, [handover]);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setAmount(""); setStatus(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Handover</DialogTitle>
          <DialogDescription>
            Modify the handover amount or status. This action is logged for audit purposes.
          </DialogDescription>
        </DialogHeader>
        {handover && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">From</span>
                <span className="text-sm">{getName(handover.user_id)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">To</span>
                <span className="text-sm">{getName(handover.handed_to)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Current Amount</span>
                <span className="text-sm font-bold">
                  ₹{(Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0)).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" />
            </div>
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Keep current</SelectItem>
                  <SelectItem value="awaiting_confirmation">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(handover?.id, amount, status)} disabled={submitting || !amount}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Edit2 className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
