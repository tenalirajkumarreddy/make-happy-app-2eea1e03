import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, Wallet, Receipt, RotateCcw, ShoppingCart, Printer, Calendar, Filter, XCircle, Pencil, FileText } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmtINR } from "@/lib/utils";
import { afterSaleCancelled, afterSaleEdited } from "@/lib/mutationHelpers";
import { SaleReturnDialog } from "@/components/sales/SaleReturnDialog";
import { InvoiceDialog } from "@/mobile/components/InvoiceDialog";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { SaleReceipt } from "@/components/shared/SaleReceipt";

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: {
    name: string;
    sku: string;
  };
}

interface Sale {
  id: string;
  display_id: string;
  store_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  outstanding_amount: number;
  created_at: string;
  recorded_by: string;
  is_fully_returned?: boolean;
  stores?: { name: string; display_id: string };
  customers?: { name: string; display_id: string };
  sale_items?: SaleItem[];
}

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export function AdminSales({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { allowed: canCancelSales } = usePermission("cancel_sales");
  const { allowed: canEditSales } = usePermission("edit_sales" as any);
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [page, setPage] = useState(1);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelRestockTarget, setCancelRestockTarget] = useState<"warehouse" | "agent">("agent");
  const [cancelSelectedAgentId, setCancelSelectedAgentId] = useState("");
  const [isCancellingSale, setIsCancellingSale] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);

  // Edit state
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [editCash, setEditCash] = useState("");
  const [editUpi, setEditUpi] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Return state
  const [returnSale, setReturnSale] = useState<Sale | null>(null);

  // Invoice state
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);

  const openEditSale = (sale: Sale) => {
    setEditCash(String(sale.cash_amount || 0));
    setEditUpi(String(sale.upi_amount || 0));
    setEditingItems([]);
    setEditingSaleId(sale.id);
  };

  const getDateRange = useCallback((filter: string) => {
    const now = new Date();
    if (filter === "today") return { from: format(now, "yyyy-MM-dd") + "T00:00:00", to: format(now, "yyyy-MM-dd") + "T23:59:59" };
    if (filter === "week") return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") + "T00:00:00", to: null };
    if (filter === "month") return { from: format(startOfMonth(now), "yyyy-MM-dd") + "T00:00:00", to: null };
    return { from: null, to: null };
  }, []);

  const PAGE_SIZE = 20;

  const { data: sales, isLoading, refetch } = useQuery({
    queryKey: ["mobile-sales", currentWarehouse?.id, paymentFilter, dateFilter, customDateFrom, customDateTo, storeFilter, customerFilter, agentFilter, page],
    queryFn: async () => {
      const range = getDateRange(dateFilter);
      const from = 0;
      const to = page * PAGE_SIZE - 1;
      let query = supabase
        .from("sales")
        .select(`
          *,
          stores(id, name, display_id),
          customers(name, display_id),
          sale_items(id, product_id, quantity, unit_price, total_price, products(name, sku))
        `, { count: "exact" })
        .is("deleted_at", null)
        .eq("is_fully_returned", false)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (currentWarehouse?.id) query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      if (paymentFilter === "cash") query = query.gt("cash_amount", 0).eq("upi_amount", 0);
      if (paymentFilter === "upi") query = query.gt("upi_amount", 0).eq("cash_amount", 0);
      if (paymentFilter === "outstanding") query = query.gt("outstanding_amount", 0);
      if (dateFilter === "custom" && customDateFrom) query = query.gte("created_at", `${customDateFrom}T00:00:00`);
      if (dateFilter === "custom" && customDateTo) query = query.lte("created_at", `${customDateTo}T23:59:59`);
      if (range.from && dateFilter !== "custom") query = query.gte("created_at", range.from);
      if (range.to && dateFilter !== "custom") query = query.lte("created_at", range.to);
      if (storeFilter !== "all") query = query.eq("store_id", storeFilter);
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (agentFilter !== "all") query = query.eq("recorded_by", agentFilter);

      const { data, error, count } = await query;
      if (error) throw error;
      return { sales: (data || []) as Sale[], total: count || 0 };
    },
});

  // Filter options
  const { data: stores = [] } = useQuery({
    queryKey: ["mobile-sales-stores", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name").order("name").limit(100);
      return data || [];
    },
    enabled: !!currentWarehouse,
});

  const { data: customers = [] } = useQuery({
    queryKey: ["mobile-sales-customers", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name").limit(100);
      return data || [];
    },
});

  const { data: agentProfiles = [] } = useQuery({
    queryKey: ["mobile-agent-profiles"],
    queryFn: async () => {
      const { data: agentIds } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent");
      if (!agentIds?.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", agentIds.map((a: any) => a.user_id));
      return data || [];
    },
    enabled: canCancelSales,
});

  const allSales = sales?.sales || [];
  const totalSales = sales?.total || 0;
  const hasMore = allSales.length < totalSales;
  const editingSale = useMemo(() => allSales.find((s) => s.id === editingSaleId), [allSales, editingSaleId]);

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh: async () => { setPage(1); await refetch(); },
  });

  // Fetch profiles for recorder names
  const { data: profileMap = {} } = useQuery({
    queryKey: ["mobile-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, Profile> = {};
      (data || []).forEach((p: Profile) => {
        map[p.user_id] = p;
      });
      return map;
    },
});

  // Fetch items for editing sale
  const { data: editSaleItems } = useQuery({
    queryKey: ["edit-sale-items", editingSaleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*, products(name, sku)")
        .eq("sale_id", editingSaleId!);
      return data || [];
    },
    enabled: !!editingSaleId,
});

  useEffect(() => {
    if (editSaleItems && editSaleItems.length > 0) {
      setEditingItems(editSaleItems.map((item: any) => ({
        product_id: item.product_id,
        name: item.products?.name || "Product",
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      })));
    }
  }, [editSaleItems]);

  const handleEditSale = async () => {
    if (!editingSale || !editingSaleId) return;
    if (editingItems.length === 0) { toast.error("At least one product item is required"); return; }
    setSubmittingEdit(true);
    try {
      const editedTotalAmount = editingItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
      const editedOutstanding = editedTotalAmount - (Number(editCash) || 0) - (Number(editUpi) || 0);
      if (editedOutstanding < 0) { toast.error("Payment exceeds sale total. Reduce payment amount."); setSubmittingEdit(false); return; }
      const { error } = await (supabase as any).rpc("edit_sale", {
        p_original_sale_id: editingSaleId,
        p_store_id: editingSale.store_id,
        p_customer_id: editingSale.customer_id,
        p_display_id: editingSale.display_id,
        p_total_amount: editedTotalAmount,
        p_cash_amount: Number(editCash) || 0,
        p_upi_amount: Number(editUpi) || 0,
        p_outstanding_amount: editedOutstanding,
        p_sale_items: editingItems.map((si: any) => ({
          product_id: si.product_id,
          quantity: si.quantity,
          unit_price: si.unit_price,
          total_price: si.quantity * si.unit_price,
        })),
        p_recorded_by: editingSale.recorded_by,
        p_logged_by: null,
        p_created_at: editingSale.created_at,
        p_expected_outstanding: (editingSale as any).outstanding ?? null,
      });
      if (error) throw error;
      toast.success("Sale updated successfully");
      setEditingSaleId(null);
      setEditCash("");
      setEditUpi("");
      setEditingItems([]);
      afterSaleEdited(qc, { storeId: editingSale?.store_id });
    } catch (err: any) {
      toast.error(err.message || "Failed to edit sale");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [paymentFilter, dateFilter, customDateFrom, customDateTo, storeFilter, customerFilter, agentFilter]);

  // Filter by search term
  const filteredSales = useMemo(() => {
    return allSales.filter((sale) =>
      sale.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.stores?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allSales, searchTerm]);

  const loadMore = () => setPage((p) => p + 1);

  const getRecorderName = (userId: string) => {
    return profileMap[userId]?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    return profileMap[userId]?.avatar_url || null;
  };

  // Use shared fmtINR for ₹ symbol consistency

  return (
    <div className="pb-6">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Sales</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">All recorded sales</p>
          </div>
          <Button size="sm" className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl" onClick={() => onNavigate("/sales")}>
            <Plus className="h-4 w-4" /> Record
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 -mt-3 space-y-2 mb-3">
        <Input placeholder="Search sale ID or store..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />

        {/* Payment Filter */}
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
            <SelectItem value="outstanding">Has outstanding</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {(["all", "today", "week", "month", "custom"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                dateFilter === d
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {d === "all" ? "All time" : d === "today" ? "Today" : d === "week" ? "Week" : d === "month" ? "Month" : "Custom"}
            </button>
          ))}
        </div>

        {/* Custom Date Range */}
        {dateFilter === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="pl-9 text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="pl-9 text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>
        )}

        {/* Additional Filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Recorded by (Agent)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agentProfiles.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {(paymentFilter !== "all" || dateFilter !== "all" || storeFilter !== "all" || customerFilter !== "all" || agentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-10 text-xs text-muted-foreground"
            onClick={() => {
              setPaymentFilter("all");
              setDateFilter("all");
              setCustomDateFrom("");
              setCustomDateTo("");
              setStoreFilter("all");
              setCustomerFilter("all");
              setAgentFilter("all");
            }}
          >
            <Filter className="h-3 w-3 mr-1" /> Clear Filters
          </Button>
        )}
      </div>

      {/* List with pull-to-refresh */}
      <div {...pullHandlers} className="overflow-y-auto">
        <PullRefreshIndicator isRefreshing={isRefreshing} isPulling={isPulling} pullDistance={pullDistance} threshold={threshold} />
        {/* Sales List */}
        {isLoading ? (
          <CardSkeletonList count={4} />
        ) : filteredSales.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
            <ShoppingCart className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No sales found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {paymentFilter !== "all" || storeFilter !== "all" || customerFilter !== "all" || agentFilter !== "all"
              ? "Try adjusting your filters above"
              : "No sales match your current criteria"}
          </p>
        </div>
        ) : (
        <div className="px-4 space-y-3">
          {filteredSales.map((sale) => {
            const itemCount = sale.sale_items?.length || 0;
            const isReturned = sale.is_fully_returned;
            
            return (
              <div
                key={sale.id}
                className={`rounded-2xl border bg-white dark:bg-slate-800 shadow-sm overflow-hidden ${isReturned ? "opacity-70 bg-slate-50 dark:bg-slate-900/40 border-dashed border-red-200 dark:border-red-900/40" : "border-slate-100 dark:border-slate-700"}`}
              >
                {/* Card Content */}
                <div
                  onClick={() => {
                    setSelectedSale(sale);
                    setShowDetailModal(true);
                  }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-sm font-mono font-semibold ${isReturned ? "line-through text-slate-400" : "text-primary"}`}>{sale.display_id}</p>
                        {isReturned && (
                          <span className="text-xs font-bold bg-warning/20 text-warning border border-warning/30 dark:bg-warning/30 rounded px-1.5 py-0">
                            Returned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {sale.stores?.name || "Unknown Store"}
                      </p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${isReturned ? "line-through text-slate-400 font-normal" : "text-primary"}`}>{fmtINR(sale.total_amount)}</p>
                  </div>

                  {/* Sale Items Preview */}
                  {sale.sale_items && sale.sale_items.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {sale.sale_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className={`flex justify-between text-xs ${isReturned ? "line-through text-slate-400" : ""}`}>
                          <span className="text-muted-foreground truncate flex-1">
                            {item.products?.name} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">
                            {fmtINR(item.total_price)}
                          </span>
                        </div>
                      ))}
                      {sale.sale_items.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{sale.sale_items.length - 2} more items
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Badges */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {sale.cash_amount > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isReturned ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" : "bg-success/20 text-success dark:bg-success/30"}`}>
                        Cash {fmtINR(sale.cash_amount)}
                      </span>
                    )}
                    {sale.upi_amount > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isReturned ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" : "bg-info/20 text-info dark:bg-info/30"}`}>
                        UPI {fmtINR(sale.upi_amount)}
                      </span>
                    )}
                    {sale.outstanding_amount > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isReturned ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" : "bg-destructive/20 text-destructive dark:bg-destructive/30"}`}>
                        Due {fmtINR(sale.outstanding_amount)}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={getRecorderAvatar(sale.recorded_by) || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10">
                          {getRecorderName(sale.recorded_by).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                        {getRecorderName(sale.recorded_by)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(sale.created_at), "dd MMM, hh:mm a")}
                    </span>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex border-t border-border/50">
                  {sale.invoice_sales?.length > 0 ? (
                    <button
                      onClick={() => onNavigate(`/invoices/${sale.invoice_sales[0].invoice_id}`)}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-green-600 hover:bg-green-50 active:bg-green-100 transition-colors border-r border-border/50"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Invoice</span>
                    </button>
                  ) : role === "super_admin" || role === "manager" ? (
                    <button
                      onClick={() => setInvoiceSale(sale)}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors border-r border-border/50"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Invoice</span>
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setShowDetailModal(false); setReceiptSaleId(sale.id); }}
                    className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Printer className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Receipt</span>
                  </button>
                  {!isReturned && canEditSales && (
                    <button
                      onClick={() => openEditSale(sale)}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors border-r border-border/50"
                    >
                      <Pencil className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Edit</span>
                    </button>
                  )}
                  {!isReturned && (
                    <button
                      onClick={() => { setReturnSale(sale); }}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-orange-600 hover:bg-orange-50 active:bg-orange-100 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Return</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="px-4 py-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
              disabled={isLoading && page > 1}
            >
              {isLoading && page > 1 ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                `Load More (${allSales.length} of ${totalSales})`
              )}
            </Button>
          </div>
        )}
      </div>{/* end pull-to-refresh wrapper */}

      {/* Detail Modal */}
      <Dialog key={selectedSale?.id || 'none'} open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Sale Details</DialogTitle>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4">
              {/* Sale Info */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                {selectedSale.is_fully_returned && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-2.5 text-amber-800 text-xs font-semibold mb-2">
                    This sale has been fully returned and cancelled.
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Sale ID</span>
                  <span className={`font-mono text-sm font-semibold ${selectedSale.is_fully_returned ? "line-through text-slate-400" : ""}`}>{selectedSale.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedSale.stores?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedSale.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
              </div>

              {/* Sale Items */}
              {selectedSale.sale_items && selectedSale.sale_items.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Sale Items ({selectedSale.sale_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedSale.sale_items.map((item, idx) => (
                      <div key={idx} className="px-3 py-2.5">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-sm font-medium ${selectedSale.is_fully_returned ? "line-through text-slate-400" : ""}`}>{item.products?.name}</span>
                          <span className={`text-sm font-semibold tabular-nums ${selectedSale.is_fully_returned ? "line-through text-slate-400" : ""}`}>{fmtINR(item.total_price)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                          <span>Qty: {item.quantity} × {fmtINR(item.unit_price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Amount</span>
                  <span className={`font-semibold ${selectedSale.is_fully_returned ? "line-through text-slate-400" : "text-primary"}`}>{fmtINR(selectedSale.total_amount)}</span>
                </div>
                {selectedSale.cash_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${selectedSale.is_fully_returned ? "text-slate-400" : "text-green-700"}`}>Cash</span>
                    <span className={`text-sm ${selectedSale.is_fully_returned ? "line-through text-slate-400" : ""}`}>{fmtINR(selectedSale.cash_amount)}</span>
                  </div>
                )}
                {selectedSale.upi_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${selectedSale.is_fully_returned ? "text-slate-400" : "text-purple-700"}`}>UPI</span>
                    <span className={`text-sm ${selectedSale.is_fully_returned ? "line-through text-slate-400" : ""}`}>{fmtINR(selectedSale.upi_amount)}</span>
                  </div>
                )}
                {selectedSale.outstanding_amount > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className={`text-xs font-medium ${selectedSale.is_fully_returned ? "text-slate-400" : "text-red-700"}`}>Outstanding</span>
                    <span className={`text-sm font-semibold ${selectedSale.is_fully_returned ? "line-through text-slate-400" : "text-red-700"}`}>{fmtINR(selectedSale.outstanding_amount)}</span>
                  </div>
                )}
              </div>

              {/* Recorder Info */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={getRecorderAvatar(selectedSale.recorded_by) || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10">
                    {getRecorderName(selectedSale.recorded_by).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Recorded by {getRecorderName(selectedSale.recorded_by)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    setReceiptSaleId(selectedSale.id);
                  }}
                >
                  <Printer className="h-3 w-3 mr-1" />
                  Receipt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/sales?highlight=${selectedSale.id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full
                </Button>
                {!selectedSale.is_fully_returned && selectedSale.outstanding_amount > 0 && (
                  <Button
                    size="sm"
                    className="text-xs col-span-2"
                    onClick={() => {
                      setShowDetailModal(false);
                      onNavigate(`/sale-returns?sale_id=${selectedSale.id}`);
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Process Return
                  </Button>
                )}
                {canCancelSales && !selectedSale.is_fully_returned && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs col-span-2 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => {
                      setShowDetailModal(false);
                      setShowCancelDialog(true);
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Cancel Sale
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(v) => {
        if (!v) { setShowCancelDialog(false); setCancelRestockTarget("agent"); setCancelSelectedAgentId(""); }
      }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Cancel Sale
            </DialogTitle>
            <DialogDescription>
              {selectedSale?.display_id} — This cannot be undone
            </DialogDescription>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                <p className="font-semibold">The sale will be voided and outstanding reversed.</p>
              </div>

              <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{fmtINR(selectedSale.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="font-semibold text-red-600">{fmtINR(selectedSale.outstanding_amount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Where should the stock go?</Label>

                <div
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50"
                  onClick={() => setCancelRestockTarget("agent")}
                >
                  <input type="radio" checked={cancelRestockTarget === "agent"} readOnly className="accent-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Return to an agent</p>
                    <p className="text-xs text-muted-foreground">Stock restored to the selected agent's holding</p>
                  </div>
                </div>

                {cancelRestockTarget === "agent" && (
                  <Select value={cancelSelectedAgentId} onValueChange={setCancelSelectedAgentId}>
                    <SelectTrigger className="ml-7">
                      <SelectValue placeholder="Select agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agentProfiles.map((ap: any) => (
                        <SelectItem key={ap.user_id} value={ap.user_id}>
                          {ap.full_name || ap.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50"
                  onClick={() => { setCancelRestockTarget("warehouse"); setCancelSelectedAgentId(""); }}
                >
                  <input type="radio" checked={cancelRestockTarget === "warehouse"} readOnly className="accent-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Return to warehouse</p>
                    <p className="text-xs text-muted-foreground">Stock restored to warehouse product stock</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => { setShowCancelDialog(false); setCancelRestockTarget("agent"); setCancelSelectedAgentId(""); }}>
                  Keep Sale
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isCancellingSale || (cancelRestockTarget === "agent" && !cancelSelectedAgentId)}
                  onClick={async () => {
                    if (cancelRestockTarget === "agent" && !cancelSelectedAgentId) {
                      toast.error("Please select an agent");
                      return;
                    }
                    setIsCancellingSale(true);
                    try {
                      const { error } = await (supabase as any).rpc("admin_cancel_sale", {
                        p_sale_id: selectedSale.id,
                        p_restock_user_id: cancelRestockTarget === "warehouse" ? null : cancelSelectedAgentId,
                      });
                      if (error) throw error;
                      toast.success(`Sale cancelled. Stock restored to ${cancelRestockTarget === "warehouse" ? "warehouse" : "agent"}.`);
                      const cancelledStoreId = selectedSale?.store_id;
                      setShowCancelDialog(false);
                      setCancelRestockTarget("agent");
                      setCancelSelectedAgentId("");
                      afterSaleCancelled(qc, { isMobile: true, storeId: cancelledStoreId });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to cancel sale");
                    } finally {
                      setIsCancellingSale(false);
                    }
                  }}
                >
                  {isCancellingSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm Cancellation
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog open={!!editingSaleId} onOpenChange={(v) => { if (!v) { setEditingSaleId(null); setEditCash(""); setEditUpi(""); setEditingItems([]); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Pencil className="h-5 w-5" />
              Edit Sale
            </DialogTitle>
            <DialogDescription>
              {editingSale?.display_id}
            </DialogDescription>
          </DialogHeader>
          {editingSale && (
            <div className="space-y-4 py-2">
              <div className="text-sm text-muted-foreground">
                Adjust items and payment amounts below.
              </div>

              {/* Edit Items */}
              <Label>Items</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {editingItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border flex items-center justify-center text-xs hover:bg-muted"
                        onClick={() => {
                          const next = [...editingItems];
                          next[idx] = { ...next[idx], quantity: Math.max(0, (next[idx].quantity || 0) - 1) };
                          setEditingItems(next);
                        }}
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border flex items-center justify-center text-xs hover:bg-muted"
                        onClick={() => {
                          const next = [...editingItems];
                          next[idx] = { ...next[idx], quantity: (next[idx].quantity || 0) + 1 };
                          setEditingItems(next);
                        }}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-xs font-medium w-16 text-right">{fmtINR(item.quantity * item.unit_price)}</span>
                  </div>
                ))}
              </div>

              {/* Payment Edit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cash Amount</Label>
                  <Input
                    type="number"
                    value={editCash}
                    onChange={(e) => setEditCash(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>UPI Amount</Label>
                  <Input
                    type="number"
                    value={editUpi}
                    onChange={(e) => setEditUpi(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-between text-sm rounded-lg bg-muted p-3">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{fmtINR(editingItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0))}</span>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleEditSale}
                disabled={submittingEdit}
              >
                {submittingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <SaleReturnDialog
        open={!!returnSale}
        onOpenChange={(v) => { if (!v) setReturnSale(null); }}
        sale={returnSale}
        onSuccess={() => {
          setReturnSale(null);
          qc.invalidateQueries({ queryKey: ["admin-sales"] });
        }}
      />

      {/* Invoice Dialog */}
      <InvoiceDialog
        open={!!invoiceSale}
        onOpenChange={(v) => { if (!v) setInvoiceSale(null); }}
        sale={invoiceSale}
      />

      <SaleReceipt
        saleId={receiptSaleId || ""}
        open={!!receiptSaleId}
        onClose={() => setReceiptSaleId(null)}
      />
    </div>
  );
}
