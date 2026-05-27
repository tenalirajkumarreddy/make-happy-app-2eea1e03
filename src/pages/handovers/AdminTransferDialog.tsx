import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export type StaffProfile = {
  user_id: string;
  full_name: string;
  role: string;
  roleLabel: string;
};

type AdminTransferDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffProfiles: StaffProfile[];
  allStaffBalances: Record<string, { total: number; sentPending: number }> | undefined;
  submitting: boolean;
  onTransfer: (data: { fromUserId: string; toUserId: string; amount: string; reason: string }) => Promise<void>;
};

export function AdminTransferDialog({ open, onOpenChange, staffProfiles, allStaffBalances, submitting, onTransfer }: AdminTransferDialogProps) {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    await onTransfer({ fromUserId, toUserId, amount, reason });
    if (!submitting) {
      setFromUserId("");
      setToUserId("");
      setAmount("");
      setReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setFromUserId(""); setToUserId(""); setAmount(""); setReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Admin Transfer Between Staff</DialogTitle>
          <DialogDescription>
            Transfer money from one staff member to another. This action is logged for audit purposes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Transfer From *</Label>
            <Select value={fromUserId || "__none__"} onValueChange={(v) => setFromUserId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Select sender</SelectItem>
                {staffProfiles?.map((p) => {
                  const bal = allStaffBalances?.[p.user_id];
                  const balance = bal ? (bal.total + bal.sentPending) : 0;
                  return (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      <div className="flex items-center justify-between w-full gap-3">
                        <span className="font-medium">{p.full_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{p.roleLabel}</span>
                          <span className={`text-xs font-semibold ${(balance || 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                            ₹{(balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {fromUserId && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Available Balance:</span>
                <span className={`font-bold ${(allStaffBalances?.[fromUserId]?.total || 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  ₹{((allStaffBalances?.[fromUserId]?.total || 0) + (allStaffBalances?.[fromUserId]?.sentPending || 0)).toLocaleString()}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Transfer To *</Label>
            <Select value={toUserId || "__none__"} onValueChange={(v) => setToUserId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Select recipient</SelectItem>
                {staffProfiles?.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id} disabled={p.user_id === fromUserId}>
                    {p.full_name} ({p.roleLabel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount (₹) *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="1" />
          </div>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for audit log" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !fromUserId || !toUserId || !amount || fromUserId === toUserId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
