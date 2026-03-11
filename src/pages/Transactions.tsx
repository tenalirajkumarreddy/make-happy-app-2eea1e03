import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { addToQueue } from "@/lib/offlineQueue";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, X, CalendarIcon, Store as StoreIcon, Banknote, CreditCard } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

const Transactions = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState(searchParams.get("store") ?? "");
  const PAGE_SIZE = 100;

  // When navigated with ?store=<id>, auto-open the add dialog
  useEffect(() => {
    const storeParam = searchParams.get("store");
    if (storeParam) {
      setStoreId(storeParam);
      setShowAdd(true);
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [txnDate, setTxnDate] = useState("");

  // List filters
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterStore, setFilterStore] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [loadedPages, setLoadedPages] = useState(1);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, filterStore, filterPayment]);

  const { data: transactions, isLoading, isError, error: txnError, isFetching } = useQuery({
    queryKey: ["transactions", isAdmin ? "all" : user?.id, filterFrom, filterTo, filterStore, filterPayment, loadedPages],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*, stores(name)")
        .order("created_at", { ascending: false });
      // Non-admin roles only see their own records
      if (!isAdmin) query = query.eq("recorded_by", user!.id);
      // Server-side filters
      if (filterFrom) query = query.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");
      if (filterStore !== "all") query = query.eq("store_id", filterStore);
      if (filterPayment === "cash") query = query.gt("cash_amount", 0);
      if (filterPayment === "upi") query = query.gt("upi_amount", 0);
      // Cursor pagination
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const hasMoreTransactions = (transactions?.length || 0) >= loadedPages * PAGE_SIZE;

  const { data: stores } = useQuery({
    queryKey: ["stores-for-txn"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, outstanding, display_id, customer_id, is_active").order("is_active", { ascending: false }).order("name");
      return data || [];
    },
  });

  const { data: allProfiles } = useQuery({
    queryKey: ["profiles-for-txn"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });
  const profileMap = new Map((allProfiles || []).map((p: any) => [p.user_id, p]));
  const getRecorderName = (id: string) => (profileMap.get(id) as any)?.full_name || "Unknown";
  const getRecorderAvatar = (id: string) => (profileMap.get(id) as any)?.avatar_url || null;

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
    setStoreId(""); setCashAmount(""); setUpiAmount(""); setNotes(""); setRecordedFor(""); setTxnDate("");
  };

  // Force fresh fetch on mount to bypass any stale cache
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || totalPayment <= 0) {
      toast.error("Please select a store and enter payment amount");
      return;
    }
    if (cash < 0 || upi < 0) {
      toast.error("Cash and UPI amounts cannot be negative");
      return;
    }

    const customerId = selectedStore?.customer_id;
    if (!customerId) {
      toast.error("Store has no linked customer");
      return;
    }

    setSaving(true);

    // Queue transaction for offline sync if no network connection
    if (!navigator.onLine) {
      const effectiveRecordedByOffline = recordedFor || user!.id;
      const loggedByOffline = recordedFor ? user!.id : null;
      await addToQueue({
        id: crypto.randomUUID(),
        type: "transaction",
        payload: {
          txData: {
            store_id: storeId,
            customer_id: customerId,
            recorded_by: effectiveRecordedByOffline,
            logged_by: loggedByOffline,
            cash_amount: cash,
            upi_amount: upi,
            total_amount: totalPayment,
            old_outstanding: oldOutstanding,
            new_outstanding: newOutstanding,
            notes: notes || null,
            ...(txnDate ? { created_at: new Date(txnDate).toISOString() } : {}),
          },
          storeUpdate: { outstanding: newOutstanding },
        },
        createdAt: new Date().toISOString(),
      });
      toast.warning("You're offline — transaction queued and will sync automatically when back online");
      setSaving(false);
      setShowAdd(false);
      resetForm();
      return;
    }

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" });

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
      ...(txnDate ? { created_at: new Date(txnDate).toISOString() } : {}),
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("stores").update({ outstanding: newOutstanding }).eq("id", storeId);

    // If backdated, recalculate all running balances in chronological order
    if (txnDate) {
      const { data: storeRow } = await supabase.from("stores").select("opening_balance").eq("id", storeId).single();
      let runBal = Number(storeRow?.opening_balance || 0);
      const [{ data: allSales }, { data: allTxns }] = await Promise.all([
        supabase.from("sales").select("id, created_at, total_amount, cash_amount, upi_amount").eq("store_id", storeId).order("created_at", { ascending: true }),
        supabase.from("transactions").select("id, created_at, total_amount").eq("store_id", storeId).order("created_at", { ascending: true }),
      ]);
      const timeline = [
        ...(allSales || []).map((s: any) => ({ type: "sale", id: s.id, date: s.created_at, delta: Number(s.total_amount) - Number(s.cash_amount) - Number(s.upi_amount) })),
        ...(allTxns || []).map((t: any) => ({ type: "txn", id: t.id, date: t.created_at, delta: -Number(t.total_amount) })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (const entry of timeline) {
        const oldBal = runBal;
        runBal += entry.delta;
        if (entry.type === "sale") {
          await supabase.from("sales").update({ old_outstanding: oldBal, new_outstanding: runBal }).eq("id", entry.id);
        } else {
          await supabase.from("transactions").update({ old_outstanding: oldBal, new_outstanding: runBal }).eq("id", entry.id);
        }
      }
      await supabase.from("stores").update({ outstanding: runBal }).eq("id", storeId);
    }

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

  // Filtering is now done server-side; local array mirrors the fetched page(s)
  const filteredTransactions = transactions || [];

  const activeTxnFilterCount = [filterStore !== "all", filterPayment !== "all", filterFrom !== thirtyDaysAgo, filterTo !== today].filter(Boolean).length;

  const clearTxnFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterStore("all");
    setFilterPayment("all");
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

  if (isError) {
    return (
      <div className="rounded-xl border bg-destructive/10 p-6 text-center text-destructive">
        <p className="font-semibold">Failed to load transactions</p>
        <p className="text-xs mt-1">{(txnError as any)?.message || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Transactions" subtitle="View and record payment transactions" primaryAction={{ label: "Record Transaction", onClick: () => setShowAdd(true) }} />



      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 text-xs gap-1.5 justify-start font-normal flex-1 min-w-[100px] sm:flex-none">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {filterFrom ? format(new Date(filterFrom + "T00:00:00"), "dd MMM yy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterFrom ? new Date(filterFrom + "T00:00:00") : undefined} onSelect={(d) => setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 text-xs gap-1.5 justify-start font-normal flex-1 min-w-[100px] sm:flex-none">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM yy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
        <Select value={filterStore} onValueChange={setFilterStore}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All stores" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {stores?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="Payment method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
          </SelectContent>
        </Select>
        {activeTxnFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearTxnFilters}>
            <X className="h-3 w-3 mr-1" /> Clear ({activeTxnFilterCount})
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filteredTransactions.length}{hasMoreTransactions ? "+" : ""} result{filteredTransactions.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable
        columns={columns}
        data={filteredTransactions}
        searchKey="display_id"
        searchPlaceholder="Search by payment ID..."
        emptyMessage="No transactions recorded yet."
        renderMobileCard={(row: any) => (
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs text-muted-foreground">{row.display_id}</span>
              <span className="text-[11px] text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
            </div>
            <div className="mb-3">
              <div className="flex items-center gap-1.5">
                <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground">{row.stores?.name || "—"}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-sm font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cash</p>
                <p className="text-sm font-medium text-foreground">₹{Number(row.cash_amount).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">UPI</p>
                <p className="text-sm font-medium text-foreground">₹{Number(row.upi_amount).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground">{getRecorderName(row.recorded_by)}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">New Balance</p>
                <p className={`text-sm font-semibold ${Number(row.new_outstanding) < Number(row.old_outstanding) ? "text-green-500" : "text-muted-foreground"}`}>
                  ₹{Number(row.new_outstanding).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      />

      {hasMoreTransactions && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
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
            {isAdmin && (
              <div>
                <Label>Transaction Date <span className="text-muted-foreground text-xs font-normal">(leave blank to use current time)</span></Label>
                <Input
                  type="datetime-local"
                  value={txnDate}
                  onChange={(e) => setTxnDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Store</Label>
              <div className="flex gap-2 mt-1">
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores?.map((s) => (
                      <SelectItem key={s.id} value={s.id} disabled={!(s as any).is_active}>
                        {s.name} ({s.display_id}){!(s as any).is_active ? " — Inactive" : ""}
                      </SelectItem>
                    ))}</SelectContent>
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