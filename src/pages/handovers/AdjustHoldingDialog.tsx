import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type StaffProfile = {
  user_id: string;
  full_name: string;
  role: string;
  roleLabel: string;
};

type AdjustHoldingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffProfiles: StaffProfile[];
  submitting: boolean;
  onAdjust: (data: { userId: string; cashAmount: string; upiAmount: string; reason: string }) => Promise<void>;
};

export function AdjustHoldingDialog({ open, onOpenChange, staffProfiles, submitting, onAdjust }: AdjustHoldingDialogProps) {
  const [userId, setUserId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    await onAdjust({ userId, cashAmount, upiAmount, reason });
    if (!submitting) {
      setUserId("");
      setCashAmount("");
      setUpiAmount("");
      setReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setUserId(""); setCashAmount(""); setUpiAmount(""); setReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Holding Balance</DialogTitle>
          <DialogDescription>
            Adjust the cash or UPI holding balance of any staff member. Use negative values to reduce balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Staff Member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {(staffProfiles || []).map((staff) => (
                  <SelectItem key={staff.user_id} value={staff.user_id}>
                    {staff.full_name} ({staff.roleLabel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cash Adjustment (₹)</Label>
              <Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="e.g. 500 or -200" />
              <span className="text-xs text-muted-foreground">Positive = add, Negative = reduce</span>
            </div>
            <div className="space-y-2">
              <Label>UPI Adjustment (₹)</Label>
              <Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} placeholder="e.g. 500 or -200" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for adjustment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !userId || (!cashAmount && !upiAmount)}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wallet className="h-4 w-4 mr-2" />}
            Adjust Balance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
