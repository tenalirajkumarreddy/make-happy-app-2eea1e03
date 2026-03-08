import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState } from "react";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const Transactions = () => {
  const { user } = useAuth();
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedFor, setRecordedFor] = useState("");

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, stores(name), customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-for-txn"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, outstanding, display_id, customer_id").eq("is_active", true);
      return data || [];
    },
  });

  // Fetch staff users for "record on behalf" selector
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-for-behalf-txn"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r) => r.user_id) || [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const totalPayment = cash + upi;
  const selectedStore = stores?.find((s) => s.id === storeId);
  const oldOutstanding = Number(selectedStore?.outstanding || 0);
  const newOutstanding = oldOutstanding - totalPayment;

  const resetForm = () => {
    setStoreId(""); setCashAmount(""); setUpiAmount(""); setNotes(""); setRecordedFor("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || totalPayment <= 0) {
      toast.error("Please select a store and enter payment amount");
      return;
    }

    const customerId = selectedStore?.customer_id;
    if (!customerId) {
      toast.error("Store has no linked customer");
      return;
    }

    setSaving(true);

    const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true });
    const displayId = `PAY-${String((count || 0) + 1).padStart(6, "0")}`;

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    const { error } = await supabase.from("transactions").insert({
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId,
      recorded_by: effectiveRecordedBy,
      logged_by: loggedBy,
      cash_amount: cash,
      upi_amount: upi,
      total_amount: totalPayment,
      old_outstanding: oldOutstanding,
      new_outstanding: newOutstanding,
      notes: notes || null,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("stores").update({ outstanding: newOutstanding }).eq("id", storeId);

    logActivity(user!.id, "Recorded transaction", "transaction", displayId, undefined, { total: totalPayment, store: storeId });
    toast.success("Transaction recorded");

    // Notify admins/managers
    const storeName = stores?.find((s) => s.id === storeId)?.name || "store";
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "Payment Collected",
          message: `₹${totalPayment.toLocaleString()} collected from ${storeName} (${displayId})`,
          type: "payment",
          entityType: "transaction",
          entityId: displayId,
        });
      }
    });

    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const columns = [
    { header: "Payment ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "Old Bal.", accessor: (row: any) => `₹${Number(row.old_outstanding).toLocaleString()}`, className: "text-muted-foreground text-sm hidden lg:table-cell" },
    { header: "New Bal.", accessor: (row: any) => `₹${Number(row.new_outstanding).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={8} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Transactions" subtitle="View and record payment transactions" primaryAction={{ label: "Record Transaction", onClick: () => setShowAdd(true) }} />
      <DataTable columns={columns} data={transactions || []} searchKey="display_id" searchPlaceholder="Search by payment ID..." />

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Transaction</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            {canRecordBehalf && (
              <div>
                <Label>Record on behalf of</Label>
                <Select value={recordedFor || "self"} onValueChange={(v) => setRecordedFor(v === "self" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Myself (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>
                    {staffUsers?.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Store</Label>
              <div className="flex gap-2 mt-1">
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}</SelectContent>
                </Select>
                <QrStoreSelector onStoreSelected={setStoreId} />
              </div>
              {selectedStore && (
                <p className="text-xs text-muted-foreground mt-1">Current outstanding: ₹{oldOutstanding.toLocaleString()}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cash (₹)</Label><Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
              <div><Label>UPI (₹)</Label><Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total Payment</span><span className="font-semibold">₹{totalPayment.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold"><span>New Outstanding</span><span className={newOutstanding < oldOutstanding ? "text-success" : ""}>₹{newOutstanding.toLocaleString()}</span></div>
            </div>
            <div><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Payment reference..." /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Transaction
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Transactions;