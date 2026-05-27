import { useState, useEffect } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type ExpenseCategory = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

type ExpenseReviewDialogProps = {
  expense: any | null;
  expenseCategories: ExpenseCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (expenseId: string, action: "approve" | "reject", data: { category: string; amount: string; notes: string }) => Promise<void>;
  actionLoading: string | null;
};

export function ExpenseReviewDialog({ expense, expenseCategories, open, onOpenChange, onReview, actionLoading }: ExpenseReviewDialogProps) {
  const [reviewCategory, setReviewCategory] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    if (expense) {
      setReviewCategory(expense.category_id || "");
      setReviewAmount(expense.amount?.toString() || "");
      setReviewNotes("");
    }
  }, [expense]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review Expense Claim</DialogTitle>
          <DialogDescription>
            Approve or reject this expense claim. You can adjust the category or amount if needed.
          </DialogDescription>
        </DialogHeader>
        {expense && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="text-sm font-bold">₹{Number(expense.amount || 0).toLocaleString()}</span>
              </div>
              <div className="pt-1 border-t">
                <span className="text-xs text-muted-foreground">Description</span>
                <p className="text-sm mt-0.5">{expense.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={reviewCategory} onValueChange={setReviewCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color || "#6b7280" }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Approved Amount (₹)</Label>
              <Input type="number" value={reviewAmount} onChange={(e) => setReviewAmount(e.target.value)} placeholder="0.00" min="0" />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add notes..." rows={2} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => onReview(expense?.id, "reject", { category: reviewCategory, amount: reviewAmount, notes: reviewNotes })} disabled={!!actionLoading}>
            {actionLoading === expense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
            Reject
          </Button>
          <Button onClick={() => onReview(expense?.id, "approve", { category: reviewCategory, amount: reviewAmount, notes: reviewNotes })} disabled={!!actionLoading || !reviewAmount || Number(reviewAmount) <= 0}>
            {actionLoading === expense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
