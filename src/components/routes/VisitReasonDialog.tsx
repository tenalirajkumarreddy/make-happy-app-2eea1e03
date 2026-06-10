import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VISIT_REASONS = [
  { value: "stock_available", label: "Stock Available", icon: CheckCircle2, description: "Store has stock, no sale needed" },
  { value: "other_brand", label: "Other Brand/Bottle", icon: Building2, description: "Store stocks competitor brand" },
  { value: "other_reason", label: "Other Reason", icon: AlertCircle, description: "Custom reason" },
] as const;

export type VisitReason = (typeof VISIT_REASONS)[number]["value"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

export function VisitReasonDialog({ open, onOpenChange, storeName, onConfirm, loading }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");

  const handleConfirm = () => {
    const reason = selectedReason === "other_reason" ? customReason : selectedReason;
    if (!reason?.trim()) return;
    onConfirm(reason);
    setSelectedReason(null);
    setCustomReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedReason(null); setCustomReason(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Mark {storeName} as visited?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Select a reason for this visit:</p>
          {VISIT_REASONS.map((reason) => {
            const Icon = reason.icon;
            const isSelected = selectedReason === reason.value;
            return (
              <button
                key={reason.value}
                type="button"
                onClick={() => { setSelectedReason(reason.value); setCustomReason(""); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all",
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                    : "border-slate-100 dark:border-slate-700 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{reason.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{reason.description}</p>
                  </div>
                </div>
              </button>
            );
          })}

          {selectedReason === "other_reason" && (
            <div>
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                Describe the reason
              </Label>
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Why did you visit this store without making a sale?"
                rows={3}
                className="rounded-xl resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Skip
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleConfirm}
              disabled={!selectedReason || loading || (selectedReason === "other_reason" && !customReason.trim())}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Visit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
