import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { enqueueWithContext } from "@/lib/conflictResolver";
import { generateBusinessKey } from "@/lib/offlineQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, X, CalendarIcon, Store as StoreIcon, RotateCcw, Receipt, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
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
import { afterTransactionSaved, afterPaymentReturned } from "@/lib/mutationHelpers";
const Transactions = () => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const isAdmin = role === "super_admin" || role === "manager";
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const { allowed: canModifyTransactions } = usePermission("modify_transactions" as any);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState(searchParams.get("store") ?? "");
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
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

  useEffect(() => {
    document.title = "Transactions";
  }, []);

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
  const [filterSearch, setFilterSearch] = useState("");
  const debouncedSearch = useDebounce(filterSearch);
  const [loadedPages, setLoadedPages] = useState(1);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
     
  }, [filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterCustomer, filterPayment, debouncedSearch]);

   const { data: transactions, isLoading, isError, error: txnError, isFetching } = useQuery({
      queryKey: ["transactions", currentWarehouse?.id, isAdmin ? "all" : user?.id, filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterCustomer, filterPayment, debouncedSearch, loadedPages],
      queryFn: async () => {
       let query: any = supabase
       .from("transactions")
        .select("*, is_fully_returned, stores(name, display_id, store_type_id, route_id, outstanding, customer_id), customers(id, name, display_id)")
       .order("created_at", { ascending: false });
       if (currentWarehouse?.id) query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
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
      if (debouncedSearch.trim()) query = query.ilike("display_id", `%${debouncedSearch.trim()}%`);

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
       let query: any = supabase.from("stores").select("id, name, outstanding, display_id, customer_id, is_active").order("is_active", { ascending: false }).order("name");
       if (currentWarehouse?.id) query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
       const { data } = await query;
       return (data ?? []) as any[];
     },
   });

  // Fetch store types for filter
  const { data: storeTypes = [] } = useQuery({
    queryKey: ["store-types-for-txn", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("store_types").select("id, name") as any).eq("is_active", true);
      return (data ?? []) as any[];
    },
  });

  // Fetch routes for filter
  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-txn", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("routes").select("id, name") as any).eq("is_active", true);
      return (data ?? []) as any[];
    },
  });

  // Fetch customers for filter
  const { data: customersForFilter = [] } = useQuery({
    queryKey: ["customers-for-txn-filter", currentWarehouse?.id],
    queryFn: async () => {
      let query: any = supabase.from("customers").select("id, name").eq("is_active", true).order("name");
      if (currentWarehouse?.id) query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await query;
      return (data ?? []) as any[];
    },
  });

  const { data: allProfiles } = useQuery({
    queryKey: ["profiles-for-txn"],
    queryFn: async () => {
      const { data } = await (supabase.from("profiles").select("user_id, full_name, avatar_url") as any);
      return (data ?? []) as any[];
    },
  });
  const profileMap = new Map((allProfiles || []).map((p: any) => [p.user_id, p]));
  const getRecorderName = (id: string): string => (profileMap.get(id) as any)?.full_name || "Unknown";
  const getRecorderAvatar = (id: string): string | null => (profileMap.get(id) as any)?.avatar_url || null;

  // Fetch staff users for "record on behalf" selector
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-for-behalf-txn"],
    queryFn: async () => {
      const { data: roles } = await (supabase.from("user_roles").select("user_id, role") as any).neq("role", "customer");
      const staffIds = (roles ?? []).map((r: any) => r.user_id);
      const { data: profs } = await (supabase.from("profiles").select("user_id, full_name") as any).in("user_id", staffIds);
      return ((profs ?? []).filter((p: any) => p.user_id !== user?.id) as any[]);
    },
    enabled: canRecordBehalf,
  });

  // Fetch company settings for receipt
  const { data: settings = {} } = useQuery({
    queryKey: ["company-settings-txn"],
    queryFn: async () => {
      const { data } = await (supabase.from("company_settings").select("key, value") as any);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => { map[s.key] = s.value; });
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
    setEditingTransaction(null);
  };

  const resetReturnForm = () => {
    setReturnTxnId(null);
    setFullReturnAmount(-1);
    setReturnType("cash");
    setReturnReason("");
    setReturnNotes("");
  };

  // Force fresh fetch on mount to bypass any stale cache
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }, []);

  const startEdit = (txn: any) => {
    setEditingTransaction(txn);
    setStoreId(txn.store_id);
    setCashAmount(String(txn.cash_amount || ""));
    setUpiAmount(String(txn.upi_amount || ""));
    setNotes(txn.notes || "");
    setTxnDate(txn.created_at ? new Date(txn.created_at).toISOString().slice(0, 16) : "");
    setShowAdd(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingTransaction) {
      if (!editingTransaction.id) { toast.error("Transaction not found"); return; }
      if (cash < 0 || upi < 0) { toast.error("Cash and UPI amounts cannot be negative"); return; }
      if (totalPayment <= 0) { toast.error("Total payment must be positive"); return; }

      // Offline: queue edit and return
      if (!navigator.onLine) {
        const bizKey = generateBusinessKey("transaction_edit", {
          storeId: editingTransaction.store_id,
          customerId: editingTransaction.customer_id,
          timestamp: new Date().toISOString(),
        });
        await enqueueWithContext({
          id: crypto.randomUUID(),
          type: "transaction_edit",
          payload: {
            txnId: editingTransaction.id,
            cashAmount: cash,
            upiAmount: upi,
            notes: notes || null,
            recordedBy: user!.id,
          },
          createdAt: new Date().toISOString(),
          businessKey: bizKey,
        });
        setSaving(false);
        setShowAdd(false);
        resetForm();
        toast.warning("Offline — transaction edit queued and will sync automatically");
        return;
      }

      setSaving(true);
      const { data: result, error: rpcError } = await (supabase as any).rpc("update_transaction", {
        p_transaction_id: editingTransaction.id,
        p_cash_amount: cash,
        p_upi_amount: upi,
        p_notes: notes || null,
      });

      if (rpcError) { toast.error(rpcError.message); setSaving(false); return; }

      toast.success("Transaction updated");
      setSaving(false);
      setShowAdd(false);
      resetForm();
      afterTransactionSaved(qc, { storeId });
      return;
    }

    if (!storeId || totalPayment <= 0) {
      toast.error("Please select a store and enter payment amount");
      return;
    }
    if (cash < 0 || upi < 0) {
      toast.error("Cash and UPI amounts cannot be negative");
      return;
    }

    // Fresh fetch to ensure we have the latest outstanding before recording
    const { data: freshStore, error: freshErr } = await supabase
      .from("stores").select("outstanding").eq("id", storeId).single();
    if (freshErr) { toast.error("Failed to fetch latest store balance"); setSaving(false); return; }
    const freshOutstanding = Number(freshStore?.outstanding || 0);

    const customerId = selectedStore?.customer_id;
    if (!customerId) {
      toast.error("Store has no linked customer");
      return;
    }

    setSaving(true);

    // Generate random display ID
    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" }) as any;

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    // Queue transaction for offline sync if no network connection
    if (!navigator.onLine) {
      const bizKey = generateBusinessKey('transaction', {
        storeId: storeId,
        customerId: customerId,
        amount: totalPayment,
        timestamp: txnDate || new Date().toISOString(),
      });
      await enqueueWithContext({
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
        businessKey: bizKey,
      });
      toast.warning("You're offline — transaction queued and will sync automatically when back online");
      setSaving(false);
      setShowAdd(false);
      resetForm();
      return;
    }

    // Use atomic RPC for online transactions
    // Note: p_total_amount is calculated internally by the function (cash + upi)
    const { data: txnResult, error: txnError } = await (supabase as any).rpc("record_transaction", {
      p_display_id: displayId,
      p_store_id: storeId,
      p_customer_id: customerId,
      p_recorded_by: effectiveRecordedBy,
      p_logged_by: loggedBy,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_notes: notes || null,
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
    afterTransactionSaved(qc, { storeId });
  };

  // Filtering is now done server-side; local array mirrors the fetched page(s)
  const filteredTransactions: any[] = transactions || [];

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
  const [receiptTxnId, setReceiptTxnId] = useState<string | null>(null);

  // State for payment return dialog
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnTxnId, setReturnTxnId] = useState<string | null>(null);
  const [fullReturnAmount, setFullReturnAmount] = useState<number>(-1); // -1 = loading
  const [returnType, setReturnType] = useState("cash");
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);

  useEffect(() => {
    if (!returnTxnId) { setFullReturnAmount(-1); return; }
    const txn = transactions?.find((t: any) => t.id === returnTxnId);
    if (!txn) { setFullReturnAmount(0); return; }
    (async () => {
      const { data: returnedRows } = await (supabase as any)
        .from("payment_returns")
        .select("return_amount")
        .eq("original_transaction_id", returnTxnId)
        .eq("status", "completed");
      const totalReturned = (returnedRows || []).reduce((sum: number, r: any) => sum + Number(r.return_amount), 0);
      setFullReturnAmount(Number(txn.total_amount) - totalReturned);
    })();
  }, [returnTxnId]);

  const columns = [
    { header: "Payment ID", accessor: (row: any) => (
      <span className={`font-mono text-xs ${row.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>
        {row.display_id}
        {row.is_fully_returned && <span className="ml-2 text-4xs font-bold bg-warning/20 text-warning border border-warning/30 rounded px-1 py-0">Returned</span>}
      </span>
    ), className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => <span className={row.is_fully_returned ? "line-through text-muted-foreground" : ""}>{row.stores?.name || "—"}</span>, className: "font-medium" },
    { header: "Total", accessor: (row: any) => (
      <span className={`font-semibold ${row.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>
        ₹{Number(row.total_amount || 0).toLocaleString()}
      </span>
    ), className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${row.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>₹{Number(row.cash_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${row.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>₹{Number(row.upi_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
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
                onClick={(e) => { e.stopPropagation(); setReceiptTxnId(row.id); }}
              >
                <Receipt className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>View Receipt</p></TooltipContent>
          </Tooltip>

          {!row.is_fully_returned && <>
            {/* Return (opens dialog for full or partial) */}
            {(() => {
              const isToday = new Date(row.created_at).toDateString() === new Date().toDateString();
              const canReturn = isAdmin || (row.recorded_by === user?.id && isToday);
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${canReturn ? "text-success hover:bg-success/10" : "text-muted-foreground/30 cursor-not-allowed"}`}
                      onClick={(e) => {
                        if (!canReturn) return;
                        e.stopPropagation();
                        setReturnTxnId(row.id);
                        setShowReturnDialog(true);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>{canReturn ? "Return (Full / Partial)" : "Only same-day self-returns allowed"}</p></TooltipContent>
                </Tooltip>
              );
            })()}

            {/* Edit Transaction - only for users with modify_transactions permission */}
            {canModifyTransactions && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-warning hover:bg-warning/10"
                  onClick={(e) => { e.stopPropagation(); startEdit(row); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Edit Transaction</p></TooltipContent>
            </Tooltip>
            )}
          </>}
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
                <span className={`font-medium ${Number(store.outstanding) > 0 ? 'text-destructive' : 'text-success'}`}>
                  ₹{Number(store.outstanding || 0).toLocaleString()}
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
  const returnedClass = (row: any) => row.is_fully_returned ? "line-through text-muted-foreground" : "";

  const columnsWithHover = [
    { header: "Payment ID", accessor: (row: any) => (
      <span className={`font-mono text-xs ${returnedClass(row)}`}>
        {row.display_id}
        {row.is_fully_returned && <span className="ml-2 text-4xs font-bold bg-warning/20 text-warning border border-warning/30 rounded px-1 py-0">Returned</span>}
      </span>
    ), className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => (
      <div className={`flex items-center gap-2 ${returnedClass(row)}`}>
        <StoreIcon className={`h-4 w-4 shrink-0 ${returnedClass(row)}`} />
        <StoreHoverCard store={row.stores}>
          <span>{row.stores?.name || "—"}</span>
        </StoreHoverCard>
      </div>
    ), className: "font-medium" },
    { header: "Total", accessor: (row: any) => <span className={`font-semibold ${returnedClass(row)}`}>₹{Number(row.total_amount || 0).toLocaleString()}</span>, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${returnedClass(row)}`}>₹{Number(row.cash_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${returnedClass(row)}`}>₹{Number(row.upi_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "Old Bal.", accessor: (row: any) => <span className={`text-sm hidden lg:table-cell ${returnedClass(row)} ${Number(row.old_outstanding || 0) > 0 ? "text-destructive" : Number(row.old_outstanding || 0) < 0 ? "text-green-600" : "text-muted-foreground"}`}>₹{Math.abs(Number(row.old_outstanding || 0)).toLocaleString()}</span>, className: "text-sm hidden lg:table-cell" },
    { header: "New Bal.", accessor: (row: any) => <span className={`text-sm hidden lg:table-cell ${returnedClass(row)} ${Number(row.new_outstanding || 0) > 0 ? "text-destructive" : Number(row.new_outstanding || 0) < 0 ? "text-green-600" : "text-muted-foreground"}`}>₹{Math.abs(Number(row.new_outstanding || 0)).toLocaleString()}</span>, className: "text-sm hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => <span className={`text-muted-foreground text-xs hidden sm:table-cell ${returnedClass(row)}`}>{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>, className: "text-muted-foreground text-xs hidden sm:table-cell" },
    columns[5], // Keep the actions column
  ];

  if (isLoading) {
    return <TableSkeleton columns={8} />;
  }

  if (isError) {
    return (
      <div className="rounded-xl border bg-destructive/10 p-6 text-center text-destructive">
        <p className="font-semibold">Failed to load transactions</p>
        <p className="text-xs mt-1">{(txnError )?.message || "Unknown error"}</p>
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



<div className="flex flex-wrap md:flex-nowrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 w-full sm:w-[90px] md:w-[100px] justify-start gap-2 text-xs font-normal">
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
          <Button variant="outline" className="h-8 w-full sm:w-[90px] md:w-[100px] justify-start gap-2 text-xs font-normal">
            <CalendarIcon className="h-3 w-3 shrink-0" />
            {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM yy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
        </PopoverContent>
      </Popover>
      <Select value={filterStore} onValueChange={setFilterStore}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[110px] md:w-[120px] lg:w-[130px]"><SelectValue placeholder="All stores" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stores</SelectItem>
          {stores?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterStoreType} onValueChange={setFilterStoreType}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[100px] md:w-[110px] lg:w-[120px]"><SelectValue placeholder="All store types" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All store types</SelectItem>
          {storeTypes?.map((st: any) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterRoute} onValueChange={setFilterRoute}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[100px] md:w-[110px] lg:w-[120px]"><SelectValue placeholder="All routes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All routes</SelectItem>
          {routes?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterCustomer} onValueChange={setFilterCustomer}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[100px] md:w-[110px] lg:w-[120px]"><SelectValue placeholder="All customers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All customers</SelectItem>
          {customersForFilter?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterUser} onValueChange={setFilterUser}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[100px] md:w-[110px] lg:w-[120px]"><SelectValue placeholder="All users" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          {allProfiles?.map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterPayment} onValueChange={setFilterPayment}>
        <SelectTrigger className="h-8 text-xs w-full sm:w-[110px] md:w-[120px] lg:w-[130px]"><SelectValue placeholder="Payment method" /></SelectTrigger>
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
          <div className={`rounded-lg border bg-card p-3 ${row.is_fully_returned ? "opacity-70 bg-slate-50 dark:bg-slate-900/40 border-dashed border-destructive/30 dark:border-destructive/30" : ""}`}>
            {/* Header row: ID + Date */}
            <div className="mb-2 flex items-center justify-between">
              <span className={`font-mono text-xs font-medium ${row.is_fully_returned ? "line-through text-muted-foreground" : "text-primary"}`}>
                {row.display_id}
                {row.is_fully_returned && <span className="ml-2 text-4xs font-bold bg-warning/20 dark:bg-warning/20 text-warning dark:text-warning border border-warning/30 dark:border-warning/30 rounded px-2 py-0">Returned</span>}
              </span>
              <span className="text-2xs text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
            </div>
            {/* Store name */}
            <div className={`mb-2 flex items-center gap-2 ${returnedClass(row)}`}>
              <StoreIcon className={`h-4 w-4 shrink-0 ${returnedClass(row)}`} />
              <span className="font-medium text-sm truncate">{row.stores?.name || "—"}</span>
            </div>
            {/* Amounts row - inline compact */}
            <div className="flex items-center gap-3 text-xs">
              <span className={`font-bold ${returnedClass(row)}`}>₹{Number(row.total_amount || 0).toLocaleString()}</span>
              <span className={`${returnedClass(row)}`}>Cash: ₹{Number(row.cash_amount || 0).toLocaleString()}</span>
              <span className={`${returnedClass(row)}`}>UPI: ₹{Number(row.upi_amount || 0).toLocaleString()}</span>
            </div>
            {/* Footer: Recorder + Balance */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
                  <AvatarFallback className="text-5xs bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-2xs text-muted-foreground truncate max-w-[100px]">{getRecorderName(row.recorded_by)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Bal:</span>
                <span className={`${returnedClass(row)} ${Number(row.new_outstanding || 0) > 0 ? "text-destructive" : Number(row.new_outstanding || 0) < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                  ₹{Math.abs(Number(row.new_outstanding || 0)).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      />

      {hasMoreTransactions && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); else qc.invalidateQueries({ queryKey: ["stores-for-txn"] }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTransaction ? "Edit Transaction" : "Record Transaction"}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            {!editingTransaction && canRecordBehalf && (
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
            {!editingTransaction && isAdmin && (
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
                <Select value={storeId} onValueChange={setStoreId} disabled={!!editingTransaction}>
                  <SelectTrigger className="flex-1" data-testid="txn-store-select"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores?.map((s) => (
                      <SelectItem key={s.id} value={s.id} disabled={!(s ).is_active}>
                        {s.name} ({s.display_id}){!(s ).is_active ? " — Inactive" : ""}
                      </SelectItem>
                    ))}</SelectContent>
                </Select>
                {!editingTransaction && <QrStoreSelector onStoreSelected={setStoreId} />}
              </div>
              {selectedStore && (
                <p className="text-xs mt-1"><span className="text-muted-foreground">Current outstanding: </span><span className={oldOutstanding > 0 ? "text-destructive font-medium" : oldOutstanding < 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>₹{Math.abs(oldOutstanding).toLocaleString()}</span></p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cash (₹)</Label><Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="mt-1" placeholder="0" data-testid="txn-cash-input" /></div>
               <div><Label>UPI (₹)</Label><Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="mt-1" placeholder="0" data-testid="txn-upi-input" /></div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total Payment</span><span className="font-semibold">₹{totalPayment.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold"><span>New Outstanding</span><span className={newOutstanding > 0 ? "text-destructive" : newOutstanding < 0 ? "text-green-600" : "text-muted-foreground"}>₹{Math.abs(newOutstanding).toLocaleString()}</span></div>
            </div>
            <div><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Payment reference..." /></div>
            <Button type="submit" className="w-full" disabled={saving} data-testid="txn-submit-btn">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTransaction ? "Update Transaction" : "Record Transaction"}
            </Button>
</form>
      </DialogContent>
    </Dialog>

    {/* Transaction Receipt */}
    <TransactionReceipt
      transactionId={receiptTxnId || ""}
      open={!!receiptTxnId}
      onClose={() => setReceiptTxnId(null)}
    />

      {/* Payment Return Dialog */}
      <Dialog open={showReturnDialog} onOpenChange={(v) => { setShowReturnDialog(v); if (!v) resetReturnForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Return Payment</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!returnTxnId) {
                toast.error("Transaction not found");
                return;
              }
              if (fullReturnAmount === -1) {
                toast.error("Still calculating return amount, please wait");
                return;
              }
              if (fullReturnAmount <= 0) {
                toast.error("This transaction has already been fully returned");
                return;
              }
              const txn = transactions?.find((t: any) => t.id === returnTxnId);
              if (!txn) {
                toast.error("Transaction not found");
                return;
              }
              if (!returnReason) {
                toast.error("Please select a return reason");
                return;
              }

              // Offline: queue payment return
              if (!navigator.onLine) {
                const offlineDisplayId = "RET-" + Date.now().toString().slice(-6);
                const bizKey = generateBusinessKey("payment_return", {
                  storeId: txn.store_id,
                  customerId: txn.customer_id,
                  amount: fullReturnAmount,
                  timestamp: new Date().toISOString(),
                });
                await enqueueWithContext({
                  id: crypto.randomUUID(),
                  type: "payment_return",
                  payload: {
                    displayId: offlineDisplayId,
                    originalTransactionId: returnTxnId,
                    storeId: txn.store_id,
                    customerId: txn.customer_id,
                    recordedBy: user!.id,
                    loggedBy: user!.id,
                    returnAmount: fullReturnAmount,
                    returnType: returnType,
                    reason: returnReason,
                    notes: returnNotes || null,
                  },
                  createdAt: new Date().toISOString(),
                  businessKey: bizKey,
                });
                setShowReturnDialog(false);
                resetReturnForm();
                toast.warning("Offline — payment return queued and will sync automatically");
                return;
              }

               setReturnLoading(true);
                const { data: displayIdResult } = await (supabase as any).rpc("generate_random_display_id", {
                  p_prefix: "RET",
                  p_table_name: "payment_returns",
                });
                const displayId = displayIdResult || ("RET-" + Date.now().toString().slice(-6));
                const { error } = await (supabase as any).rpc("record_payment_return", {
                 p_original_transaction_id: returnTxnId,
                 p_store_id: txn.store_id,
                 p_customer_id: txn.customer_id,
                 p_return_amount: fullReturnAmount,
                 p_return_type: returnType,
                 p_reason: returnReason,
                 p_notes: returnNotes || null,
                 p_recorded_by: user!.id,
                 p_display_id: displayId,
                 p_logged_by: user!.id,
               });
              if (error) {
                toast.error(error.message);
              } else {
                toast.success("Payment return recorded");
                setShowReturnDialog(false);
                resetReturnForm();
                afterPaymentReturned(qc);
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
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    <div className="flex justify-between font-semibold">
                      <span className="text-destructive">Amount to return:</span>
                      <span className="text-destructive">{fullReturnAmount === -1 ? "Loading..." : `₹${fullReturnAmount.toLocaleString()}`}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Full return — for partial adjustments, edit the transaction instead.</p>
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
                    <Label>Reason <span className="text-destructive">*</span></Label>
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
                      <span className="text-success">{fullReturnAmount === -1 ? "Loading..." : `+₹${fullReturnAmount.toLocaleString()}`}</span>
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
