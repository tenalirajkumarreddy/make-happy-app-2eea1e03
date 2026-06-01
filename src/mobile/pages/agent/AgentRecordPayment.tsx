import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ChevronRight, Store as StoreIcon,
  IndianRupee, Banknote, CreditCard, AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { addToQueue, generateBusinessKey } from "@/lib/offlineQueue";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { StorePickerSheet, StoreOption } from "@/mobile/components/StorePickerSheet";
import { cn } from "@/lib/utils";
import { afterTransactionSaved } from "@/lib/mutationHelpers";

export function RecordPayment({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user } = useAuth();
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const { allowed: canBackdate } = usePermission("backdate" as any);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [txnDate, setTxnDate] = useState("");

  useEffect(() => {
    if (preselectStore) {
      setStore(preselectStore);
      setCashAmount("");
      setUpiAmount("");
      setNotes("");
      setRecordedFor("");
      setTxnDate("");
    }
  }, [preselectStore?.id]);

  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-for-behalf-payment", user?.id],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r) => r.user_id) || [];
      if (staffIds.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const totalPayment = cash + upi;
  const oldOutstanding = Number(store?.outstanding ?? 0);
  const newOutstanding = Math.max(0, oldOutstanding - totalPayment);

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (totalPayment <= 0) { toast.error("Enter payment amount"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }
    if (!user?.id) { toast.error("Authentication required"); return; }

    setSaving(true);

    const effectiveRecordedBy = recordedFor || user.id;
    const loggedBy = recordedFor ? user.id : null;

    const txData = {
      store_id: store.id,
      customer_id: store.customer_id,
      recorded_by: effectiveRecordedBy,
      logged_by: loggedBy,
      cash_amount: cash,
      upi_amount: upi,
      total_amount: totalPayment,
      old_outstanding: oldOutstanding,
      new_outstanding: newOutstanding,
      notes: notes || null,
      ...(txnDate ? { created_at: new Date(txnDate).toISOString() } : {}),
    };

    if (!navigator.onLine) {
      const businessKey = generateBusinessKey('transaction', {
        storeId: store.id,
        customerId: store.customer_id,
        amount: totalPayment,
        timestamp: txnDate || new Date().toISOString(),
      });

      await addToQueue({
        id: crypto.randomUUID(),
        type: "transaction",
        payload: { txData },
        businessKey,
        createdAt: new Date().toISOString(),
      });
      toast.warning("Offline — payment queued and will sync automatically");
      setSaving(false);
      resetPayment();
      return;
    }

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" }) as any;

    const { error } = await supabase.rpc("record_transaction", {
      p_display_id: String(displayId),
      p_store_id: store.id,
      p_customer_id: store.customer_id,
      p_recorded_by: effectiveRecordedBy,
      p_logged_by: loggedBy ?? undefined,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_notes: notes ?? undefined,
      p_created_at: txnDate ? new Date(txnDate).toISOString() : undefined,
    }) as any;

    if (error) { toast.error(error.message); setSaving(false); return; }

    logActivity(user.id, "Recorded transaction", "transaction", String(displayId), undefined, { total: totalPayment, store: store.id });
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "Payment Collected",
          message: `₹${totalPayment.toLocaleString()} collected from ${store.name} (${String(displayId)})`,
          type: "payment",
          entityType: "transaction",
          entityId: String(displayId),
        });
      }
    });

    toast.success("Payment recorded");
    setSaving(false);
    resetPayment();
    afterTransactionSaved(qc, { isMobile: true });
  };

  const resetPayment = () => {
    setStore(null);
    setCashAmount("");
    setUpiAmount("");
    setNotes("");
    setRecordedFor("");
    setTxnDate("");
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-2xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10"
              : "border-dashed border-border dark:border-border hover:border-emerald-200 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          )}
          onClick={() => setStorePickerOpen(true)}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-slate-100 dark:bg-slate-800"
          )}>
            <StoreIcon className={cn("h-5 w-5", store ? "text-emerald-500" : "text-muted-foreground")} />
          </div>
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground dark:text-white truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm flex-1 font-medium">Tap to select store...</span>
          )}
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-emerald-400" : "text-slate-300")} />
        </button>
      </div>

      {store && (
        <div className="px-4">
          <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3.5 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Outstanding Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{oldOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2.5">Payment Amount</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Banknote className="h-3.5 w-3.5 text-emerald-500" />
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Cash</Label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <Input
                type="number"
                min="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0"
                className="pl-7 h-11 rounded-xl text-base font-semibold border-border dark:border-border"
              />
            </div>
          </div>
          <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <CreditCard className="h-3.5 w-3.5 text-violet-500" />
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">UPI</Label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <Input
                type="number"
                min="0"
                value={upiAmount}
                onChange={(e) => setUpiAmount(e.target.value)}
                placeholder="0"
                className="pl-7 h-11 rounded-xl text-base font-semibold border-border dark:border-border"
              />
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="rounded-xl bg-card dark:bg-slate-800 border border-border dark:border-border px-3 py-2.5">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. cheque no., reference...)"
              className="border-0 p-0 h-auto text-sm bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-2 rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-border dark:border-border bg-card dark:bg-slate-900 px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers || [])?.map((member) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          {canBackdate && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Payment Date (optional)</Label>
              <Input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                className="mt-1 h-10 rounded-xl border-border dark:border-border"
              />
            </div>
          )}
        </div>
      </div>

      {store && totalPayment > 0 && (
        <div className="px-4 space-y-3">
          <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-200 dark:border-emerald-700/40 p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
              <span>Collecting</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{totalPayment.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
              <span>Current balance</span>
              <span className="font-semibold">₹{oldOutstanding.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-emerald-200 dark:border-emerald-700/40 pt-2">
              <span className="text-slate-700 dark:text-slate-200">New balance</span>
              <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{newOutstanding.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {totalPayment > oldOutstanding && oldOutstanding > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Payment exceeds outstanding balance
              </span>
            </div>
          )}

          <button
            className={cn(
              "w-full h-14 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
              saving
                ? "bg-emerald-400 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
            )}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 className="h-5 w-5 animate-spin" /><span>Recording...</span></>
            ) : (
              <>
                <IndianRupee className="h-5 w-5" />
                Collect ₹{totalPayment.toLocaleString("en-IN")}
              </>
            )}
          </button>
        </div>
      )}

      <StorePickerSheet
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        onSelect={setStore}
      />
    </div>
  );
}
