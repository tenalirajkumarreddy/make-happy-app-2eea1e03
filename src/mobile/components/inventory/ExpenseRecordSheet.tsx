import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Receipt, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface ExpenseRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ExpenseRecordSheet({ open, onOpenChange }: ExpenseRecordSheetProps) {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [isAdhoc, setIsAdhoc] = useState(false);
  const [billFiles, setBillFiles] = useState<File[]>([]);

  // Fetch expense categories
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Select a category");
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Enter a valid amount");
      }

      // Check file size limit
      for (const file of billFiles) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`File "${file.name}" exceeds 10MB limit`);
        }
      }

      // Convert bill files to base64
      const billBase64: string[] = [];
      for (const file of billFiles) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        billBase64.push(base64);
      }

      const { data, error } = await supabase.functions.invoke("expense-manager", {
        body: {
          action: "create_expense",
          amount: parseFloat(amount),
          description: description.trim(),
          category_id: categoryId,
          expense_date: expenseDate,
          bill_base64: billBase64.length > 0 ? billBase64 : undefined,
          is_adhoc: isAdhoc,
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isAdhoc ? "Adhoc expense recorded" : "Expense submitted for approval");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to record expense");
    },
  });

  const resetForm = () => {
    setCategoryId("");
    setAmount("");
    setDescription("");
    setExpenseDate(new Date().toISOString().split("T")[0]);
    setIsAdhoc(false);
    setBillFiles([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setBillFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setBillFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 !p-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Record Expense</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-10 text-sm rounded-xl"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this expense for?"
                rows={2}
                className="text-sm rounded-xl"
              />
            </div>

            {/* Adhoc Toggle — only visible to admins */}
            {role === "super_admin" || role === "manager" ? (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm">Adhoc Expense</Label>
                  <p className="text-xs text-muted-foreground">Immediately reduces holding amount</p>
                </div>
                <Switch checked={isAdhoc} onCheckedChange={setIsAdhoc} />
              </div>
            ) : null}

            {/* Bill Upload */}
            <div className="space-y-1.5">
              <Label>Bill/Receipt (Optional)</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Add Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              {billFiles.length > 0 && (
                <div className="space-y-1 mt-2">
                  {billFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <span className="text-xs truncate flex-1">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-5">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !categoryId || !amount}
              className="bg-primary"
            >
              {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Expense
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
