import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { addToQueue } from "@/lib/offlineQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, X, CalendarIcon, Store as StoreIcon, Banknote, CreditCard, RotateCcw, Scale, AlertCircle, Receipt, Printer, Share2, UserCircle, MapPin, Phone, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
import {
Tooltip,
TooltipContent,
TooltipProvider,
TooltipTrigger,
} from "@/components/ui/tooltip";
import {
HoverCard,
HoverCardContent,
HoverCardTrigger,
} from "@/components/ui/hover-card";

const Transactions = () => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
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
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [loadedPages, setLoadedPages] = useState(1);

  // Transaction Receipt state
  const [showTransactionReceipt, setShowTransactionReceipt] = useState(false);
  const [receiptTxnId, setReceiptTxnId] = useState<string | null>(null);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterCustomer, filterPayment]);

  const { data: transactions, isLoading, isError, error: txnError, isFetching } = useQuery({
    queryKey: ["transactions", currentWarehouse?.id, isAdmin ? "all" : user?.id, filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterCustomer, filterPayment, loadedPages],
    queryFn: async () => {
      let query = (supabase as any)
      .from("transactions")
      .select("*, stores(name, display_id, store_type_id, route_id, outstanding, customer_id), customers(id, name, display_id)")
      .order("created_at", { ascending: false });
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      // Non-admin roles only see their own records
      if (!isAdmin) query = query.eq("recorded_by", user!.id);
      // Server-side filters
      if (filterFrom) query = query.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");
      if (filterStore !== "all") query = query.eq("store_id", filterStore);
      if (filterUser !== "all") query = query.eq("recorded_by", filterUser);
      if (filterCustomer !== "all") query = query.eq("customer_id", filterCustomer);
      if (filterPayment === "cash") query = query.gt("cash_amount", 0);
      if (filterPayment === "upi") query = query.gt("upi_amount", 0);
      // Store type and route filters (join with stores)
      if (filterStoreType !== "all") {
        query = query.eq("stores.store_type_id", filterStoreType);
      }
      if (filterRoute !== "all") {
        query = query.eq("stores.route_id", filterRoute);
      }
      // Cursor pagination
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const hasMoreTransactions = (transactions?.length || 0) >= loadedPages * PAGE_SIZE;

  const { data: stores } = useQuery({
    queryKey: ["stores-for-txn", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any).from("stores").select("id, name, outstanding, display_id, customer_id, is_active").order("is_active", { ascending: false }).order("name");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
  });

  // Fetch store types for filter
  const { data: storeTypes = [] } = useQuery({
    queryKey: ["store-types-for-txn", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  // Fetch routes for filter
  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-txn", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  // Fetch customers for filter
  const { data: customersForFilter = [] } = useQuery({
    queryKey: ["customers-for-txn-filter", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase.from("customers").select("id, name").eq("is_active", true).order("name");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
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

  // Fetch company settings for receipt
  const { data: settings = {} } = useQuery({
    queryKey: ["company-settings-txn"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { map[s.key] = s.value; });
      return map;
    },
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

  const resetReturnForm = () => {
    setReturnTxnId(null);
    setReturnAmount("");
    setReturnType("cash");
    setReturnReason("");
    setReturnNotes("");
  };

  const resetCorrectionForm = () => {
    setCorrectionStoreId("");
    setCorrectionType("adjustment");
    setCorrectionAmount("");
    setCorrectionReason("");
    setCorrectionDescription("");
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

    // Generate random display ID
    const { data: displayId } = await supabase.rpc("generate_random_display_id", { p_prefix: "PAY", p_table_name: "transactions" });

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    // Queue transaction for offline sync if no network connection
    if (!navigator.onLine) {
      await addToQueue({
        id: crypto.randomUUID(),
        type: "transaction",
        payload: {
          display_id: displayId,
          store_id: storeId,
          customer_id: customerId,
          recorded_by: effectiveRecordedBy,
          logged_by: loggedBy,
          cash_amount: cash,
          upi_amount: upi,
          total_amount: totalPayment,
          notes: notes || null,
          payment_date: txnDate || new Date().toISOString().split('T')[0],
          created_at: txnDate ? new Date(txnDate).toISOString() : new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });
      toast.warning("You're offline — transaction queued and will sync automatically when back online");
      setSaving(false);
      setShowAdd(false);
      resetForm();
      return;
    }

    // Use atomic RPC for online transactions
    const { data: txnResult, error: txnError } = await (supabase as any).rpc("record_transaction", {
      p_display_id: displayId,
      p_store_id: storeId,
      p_customer_id: customerId,
      p_recorded_by: effectiveRecordedBy,
      p_logged_by: loggedBy,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_total_amount: totalPayment,
      p_notes: notes || null,
      p_payment_date: txnDate || undefined,
      p_created_at: txnDate ? new Date(txnDate).toISOString() : undefined,
    });

    if (txnError) {
      toast.error(txnError.message);
      setSaving(false);
      return;
    }

    logActivity(user!.id, "Recorded transaction", "transaction", displayId, undefined, { total: totalPayment, store: storeId });
    toast.success("Transaction recorded");

    // Notify admins/managers
    const storeName = stores?.find((s) => s.id === storeId)?.name || "store";
    getAdminUserIds()
      .then((ids) => {
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
      })
      .catch((err) => {
        // Don't block on notification failures
        console.warn("Failed to notify admins:", err);
      });

    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  // Filtering is now done server-side; local array mirrors the fetched page(s)
  const filteredTransactions = transactions || [];

  const activeTxnFilterCount = [
    filterStore !== "all",
    filterStoreType !== "all",
    filterRoute !== "all",
    filterUser !== "all",
    filterCustomer !== "all",
    filterPayment !== "all",
    filterFrom !== thirtyDaysAgo,
    filterTo !== today
  ].filter(Boolean).length;

  const clearTxnFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterStore("all");
    setFilterStoreType("all");
    setFilterRoute("all");
    setFilterUser("all");
    setFilterCustomer("all");
    setFilterPayment("all");
  };

  // State for transaction receipt dialog
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  // State for payment return dialog
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnTxnId, setReturnTxnId] = useState<string | null>(null);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnType, setReturnType] = useState("cash");
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);

  const columns = [
    { header: "Payment ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "Old Bal.", accessor: (row: any) => `₹${Number(row.old_outstanding).toLocaleString()}`, className: "text-muted-foreground text-sm hidden lg:table-cell" },
    { header: "New Bal.", accessor: (row: any) => `₹${Number(row.new_outstanding).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
    { header: "Actions", accessor: (row: any) => (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {/* View Receipt */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                onClick={(e) => { e.stopPropagation(); setSelectedTransaction(row); }}
              >
                <Receipt className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>View Receipt</p></TooltipContent>
          </Tooltip>

          {/* Return Payment */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                onClick={(e) => { e.stopPropagation(); setReturnTxnId(row.id); setShowReturnDialog(true); }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Return Payment</p></TooltipContent>
          </Tooltip>
        </div>
        </TooltipProvider>
      ), className: "hidden sm:table-cell" },
  ];

  // Store Hover Card component
  const StoreHoverCard = ({ store, children }: { store: any; children: React.ReactNode }) => {
    if (!store) return <span>{children}</span>;
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Link to={`/stores/${store.id}`} className="hover:underline cursor-pointer">
            {children}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-64 p-0" align="start">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <StoreIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{store.name}</p>
                <p className="text-xs text-muted-foreground">{store.display_id}</p>
              </div>
            </div>
            {store.outstanding !== undefined && (
              <div className="flex items-center justify-between text-xs py-1 border-t">
                <span className="text-muted-foreground">Outstanding:</span>
                <span className={`font-medium ${Number(store.outstanding) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  ₹{Number(store.outstanding).toLocaleString()}
                </span>
              </div>
            )}
            <Button size="sm" variant="outline" className="w-full text-xs" asChild>
              <Link to={`/stores/${store.id}`}>View Store Profile</Link>
            </Button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Update columns to use hover cards
  const columnsWithHover = [
    { header: "Payment ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <StoreHoverCard store={row.stores}>
          <span>{row.stores?.name || "—"}</span>
        </StoreHoverCard>
      </div>
    ), className: "font-medium" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "Old Bal.", accessor: (row: any) => `₹${Number(row.old_outstanding).toLocaleString()}`, className: "text-muted-foreground text-sm hidden lg:table-cell" },
    { header: "New Bal.", accessor: (row: any) => `₹${Number(row.new_outstanding).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
    columns[8], // Keep the actions column
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
      <PageHeader 
        title="Transactions" 
        subtitle="View and record payment transactions" 
        primaryAction={{ label: "Record Transaction", onClick: () => setShowAdd(true) }}
      />



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
      <Select value={filterStoreType} onValueChange={setFilterStoreType}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All store types" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All store types</SelectItem>
          {storeTypes?.map((st: any) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterRoute} onValueChange={setFilterRoute}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All routes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All routes</SelectItem>
          {routes?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterCustomer} onValueChange={setFilterCustomer}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All customers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All customers</SelectItem>
          {customersForFilter?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterUser} onValueChange={setFilterUser}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All users" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          {allProfiles?.map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
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
      columns={columnsWithHover}
        data={filteredTransactions}
        searchKey="display_id"
        searchPlaceholder="Search by payment ID..."
        emptyMessage="No transactions recorded yet."
        renderMobileCard={(row: any) => (
          <div className="rounded-lg border bg-card p-3">
            {/* Header row: ID + Date */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-xs text-primary font-medium">{row.display_id}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
            </div>
            {/* Store name */}
            <div className="flex items-center gap-1.5 mb-2">
              <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate">{row.stores?.name || "—"}</span>
            </div>
            {/* Amounts row - inline compact */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</span>
              <span className="text-muted-foreground">Cash: ₹{Number(row.cash_amount).toLocaleString()}</span>
              <span className="text-muted-foreground">UPI: ₹{Number(row.upi_amount).toLocaleString()}</span>
            </div>
            {/* Footer: Recorder + Balance */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
                  <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{getRecorderName(row.recorded_by)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Bal:</span>
                <span className={Number(row.new_outstanding) < Number(row.old_outstanding) ? "font-semibold text-green-600" : "text-muted-foreground"}>
                  ₹{Number(row.new_outstanding).toLocaleString()}
                </span>
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

    {/* Transaction Receipt Dialog */}
    <Dialog open={!!selectedTransaction} onOpenChange={(v) => { if (!v) setSelectedTransaction(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Payment Receipt</span>
            <div className="flex gap-2">
              <Button 
                size="icon" 
                variant="outline" 
                onClick={() => {
                  if (selectedTransaction) {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(document.getElementById('txn-receipt-content')?.innerHTML || '');
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }
                }}
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="outline" 
                onClick={() => {
                  if (selectedTransaction) {
                    const text = `Receipt: ${selectedTransaction.display_id}\nStore: ${selectedTransaction.stores?.name}\nDate: ${new Date(selectedTransaction.created_at).toLocaleDateString('en-IN')}\nAmount: ₹${Number(selectedTransaction.total_amount).toLocaleString()}\nPrevious Balance: ₹${Number(selectedTransaction.old_outstanding).toLocaleString()}\nTotal Due: ₹${Number(selectedTransaction.new_outstanding).toLocaleString()}`;
                    navigator.clipboard.writeText(text);
                    toast.success("Receipt copied to clipboard");
                  }
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        {(() => {
          if (!selectedTransaction) return <p className="text-center text-muted-foreground py-8">Receipt not found</p>;
          
          const amountPaid = Number(selectedTransaction.total_amount || 0);
          const previousBalance = Number(selectedTransaction.old_outstanding || 0);
          const totalDue = Number(selectedTransaction.new_outstanding || 0);
          // Color logic: if totalDue > 0, store owes money (red), if < 0, warehouse owes (green)
          const balanceColor = totalDue > 0 ? "text-red-600" : totalDue < 0 ? "text-green-600" : "text-muted-foreground";
          
          return (
            <div id="txn-receipt-content" className="font-mono text-sm">
              {/* Header */}
              <div className="text-center mb-4">
                <h1 className="font-bold text-lg">{settings.business_name || "Aqua Prime"}</h1>
                {settings.business_address && <p className="text-xs text-muted-foreground">{settings.business_address}</p>}
                {settings.business_phone && <p className="text-xs text-muted-foreground">Tel: {settings.business_phone}</p>}
              </div>

              <div className="border-t border-dashed border-gray-400 my-3" />

              {/* Receipt Info */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Receipt No:</span>
                  <span className="font-bold">{selectedTransaction.display_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date(selectedTransaction.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {selectedTransaction.stores?.name && (
                  <div className="flex justify-between">
                    <span>Store:</span>
                    <span>{selectedTransaction.stores.name}</span>
                  </div>
                )}
                {selectedTransaction.customers?.name && (
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span>{selectedTransaction.customers.name}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-400 my-3" />

              {/* Payment Details */}
              <div className="space-y-1">
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>AMOUNT PAID:</span>
                  <span>₹{amountPaid.toLocaleString()}</span>
                </div>
                {Number(selectedTransaction.cash_amount) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>Cash:</span>
                    <span>₹{Number(selectedTransaction.cash_amount).toLocaleString()}</span>
                  </div>
                )}
                {Number(selectedTransaction.upi_amount) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>UPI:</span>
                    <span>₹{Number(selectedTransaction.upi_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-400 my-3" />

              {/* Balance Summary */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Previous Balance:</span>
                  <span>₹{previousBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Amount Paid:</span>
                  <span className="text-green-600">-₹{amountPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>Total Due:</span>
                  <span className={balanceColor}>₹{totalDue.toLocaleString()}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-400 my-3" />

              {/* Footer */}
              <div className="text-center text-xs space-y-1">
                <p className="font-semibold">Thank you for your payment!</p>
                {selectedTransaction.notes && <p className="text-muted-foreground text-[10px]">Note: {selectedTransaction.notes}</p>}
                <p className="text-[10px] text-muted-foreground mt-2">
                  This is a computer generated receipt
                </p>
              </div>
            </div>
          );
        })()}
      </DialogContent>
</Dialog>

      {/* Payment Return Dialog */}
      <Dialog open={showReturnDialog} onOpenChange={(v) => { setShowReturnDialog(v); if (!v) resetReturnForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Return Payment</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!returnTxnId || !returnAmount || parseFloat(returnAmount) <= 0) {
                toast.error("Please enter a valid return amount");
                return;
              }
              const txn = transactions?.find((t: any) => t.id === returnTxnId);
              if (!txn) {
                toast.error("Transaction not found");
                return;
              }
              const maxReturn = Number(txn.cash_amount) + Number(txn.upi_amount);
              if (parseFloat(returnAmount) > maxReturn) {
                toast.error(`Cannot return more than original payment (₹${maxReturn.toLocaleString()})`);
                return;
              }
              setReturnLoading(true);
              const { error } = await (supabase as any).rpc("record_payment_return", {
                p_original_transaction_id: returnTxnId,
                p_store_id: txn.store_id,
                p_customer_id: txn.customer_id,
                p_return_amount: parseFloat(returnAmount),
                p_return_type: returnType,
                p_reason: returnReason,
                p_notes: returnNotes || null,
                p_recorded_by: user!.id,
              });
              if (error) {
                toast.error(error.message);
              } else {
                toast.success("Payment return recorded");
                setShowReturnDialog(false);
                resetReturnForm();
                qc.invalidateQueries({ queryKey: ["transactions"] });
              }
              setReturnLoading(false);
            }}
            className="space-y-4"
          >
            {(() => {
              const txn = transactions?.find((t: any) => t.id === returnTxnId);
              if (!txn) return null;
              const originalAmount = Number(txn.cash_amount) + Number(txn.upi_amount);
              return (
                <>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>Original Payment:</span><span className="font-semibold">₹{originalAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Store:</span><span>{txn.stores?.name}</span></div>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Date:</span><span>{new Date(txn.created_at).toLocaleDateString()}</span></div>
                  </div>
                  <div>
                    <Label>Return Amount (₹) <span className="text-muted-foreground text-xs">max ₹{originalAmount.toLocaleString()}</span></Label>
                    <Input type="number" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} className="mt-1" placeholder="0" min="0.01" step="0.01" max={originalAmount} required />
                  </div>
                  <div>
                    <Label>Return Type</Label>
                    <Select value={returnType} onValueChange={setReturnType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reason <span className="text-red-500">*</span></Label>
                    <Select value={returnReason} onValueChange={setReturnReason} required>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="duplicate_payment">Duplicate Payment</SelectItem>
                        <SelectItem value="wrong_amount">Wrong Amount</SelectItem>
                        <SelectItem value="cancelled_order">Cancelled Order</SelectItem>
                        <SelectItem value="refund">Customer Refund</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} className="mt-1" placeholder="Additional details..." />
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between font-semibold">
                      <span>Store will be credited:</span>
                      <span className="text-green-600">+₹{(parseFloat(returnAmount) || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={returnLoading}>
                    {returnLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Return
                  </Button>
                </>
              );
            })()}
          </form>
        </DialogContent>
      </Dialog>
</div>
);
};

export default Transactions;