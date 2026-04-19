import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface TransferOrderDialogProps {
  order: {
    id: string;
    display_id: string;
    stores?: { name: string };
  } | null;
  agents: Array<{ id: string; full_name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (orderId: string, newAssigneeId: string) => Promise<void>;
}

export function TransferOrderDialog({
  order,
  agents,
  open,
  onOpenChange,
  onTransfer,
}: TransferOrderDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState("");
  const [transferring, setTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!selectedAgent || !order) {
      toast.error("Please select an agent");
      return;
    }

    setTransferring(true);
    try {
      await onTransfer(order.id, selectedAgent);
      setSelectedAgent("");
    } catch (error) {
      console.error("Transfer failed:", error);
      toast.error("Failed to transfer order");
    } finally {
      setTransferring(false);
    }
  };

  const handleClose = () => {
    if (!transferring) {
      setSelectedAgent("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Transfer Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {order && (
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">Order:</span>{" "}
                <span className="font-mono font-medium">{order.display_id}</span>
              </p>
              {order.stores?.name && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Store:</span>{" "}
                  <span className="font-medium">{order.stores.name}</span>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Transfer to Agent</label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 ? (
                  <SelectItem value="" disabled>
                    No agents available
                  </SelectItem>
                ) : (
                  agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            The order will be reassigned to the selected agent. They will be notified
            and can see this order in their assigned orders list.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={transferring}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedAgent || transferring}
            className="gap-2"
          >
            {transferring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4" />
                Transfer Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
