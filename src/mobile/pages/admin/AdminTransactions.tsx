import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, CreditCard, Receipt, Calendar, Filter } from "lucide-react";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmtINR } from "@/lib/utils";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";

interface Transaction {
  id: string;
  display_id: string;
  store_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  old_outstanding: number;
  new_outstanding: number;
  is_fully_returned: boolean;
  created_at: string;
  recorded_by: string;
  stores?: { name: string; display_id: string };
}

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export function AdminTransactions({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();

  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [page, setPage] = useState(1);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [receiptTxnId, setReceiptTxnId] = useState<string | null>(null);

  const getDateRange = useCallback((filter: string) => {
    const now = new Date();
    if (filter === "today") return { from: format(now, "yyyy-MM-dd") + "T00:00:00", to: format(now, "yyyy-MM-dd") + "T23:59:59" };
    if (filter === "week") return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") + "T00:00:00", to: null };
    if (filter === "month") return { from: format(startOfMonth(now), "yyyy-MM-dd") + "T00:00:00", to: null };
    return { from: null, to: null };
  }, []);

  const PAGE_SIZE = 20;

  // Fetch transactions
  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ["mobile-transactions", currentWarehouse?.id, paymentFilter, dateFilter, customDateFrom, customDateTo, storeFilter, customerFilter, agentFilter, page],
    queryFn: async () => {
      const range = getDateRange(dateFilter);
      const from = 0;
      const to = page * PAGE_SIZE - 1;
      let query = supabase
        .from("transactions")
        .select("*, stores(id, name, display_id)", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (currentWarehouse?.id) query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      if (paymentFilter === "cash") query = query.gt("cash_amount", 0).eq("upi_amount", 0);
      if (paymentFilter === "upi") query = query.gt("upi_amount", 0).eq("cash_amount", 0);
      if (dateFilter === "custom" && customDateFrom) query = query.gte("created_at", `${customDateFrom}T00:00:00`);
      if (dateFilter === "custom" && customDateTo) query = query.lte("created_at", `${customDateTo}T23:59:59`);
      if (range.from && dateFilter !== "custom") query = query.gte("created_at", range.from);
      if (range.to && dateFilter !== "custom") query = query.lte("created_at", range.to);
      if (storeFilter !== "all") query = query.eq("store_id", storeFilter);
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (agentFilter !== "all") query = query.eq("recorded_by", agentFilter);

      const { data, error, count } = await query;
      if (error) throw error;
      return { transactions: (data || []) as Transaction[], total: count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Filter options
  const { data: stores = [] } = useQuery({
    queryKey: ["mobile-txn-stores", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name").order("name").limit(100);
      return data || [];
    },
    enabled: !!currentWarehouse,
    staleTime: 5 * 60 * 1000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["mobile-txn-customers", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name").limit(100);
      return data || [];
    },
    enabled: !!currentWarehouse,
    staleTime: 5 * 60 * 1000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["mobile-txn-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").order("full_name").limit(100);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const allTxns = transactions?.transactions || [];
  const totalTxns = transactions?.total || 0;
  const hasMore = allTxns.length < totalTxns;

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh: async () => { setPage(1); await refetch(); },
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [paymentFilter, dateFilter, customDateFrom, customDateTo, storeFilter, customerFilter, agentFilter]);

  // Fetch profiles
  const { data: profileMap = {} } = useQuery({
    queryKey: ["mobile-profiles-txn"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, Profile> = {};
      (data || []).forEach((p: Profile) => {
        map[p.user_id] = p;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Filter by search
  const filteredTxns = useMemo(() => {
    return allTxns.filter((txn) =>
      txn.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.stores?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allTxns, searchTerm]);

  const loadMore = () => setPage((p) => p + 1);

  const getRecorderName = (userId: string) => {
    return profileMap[userId]?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    return profileMap[userId]?.avatar_url || null;
  };

  // fmtINR from @/lib/utils handles ₹ formatting

  return (
    <div className="pb-6">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Transactions</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">Payment records</p>
          </div>
          <Button size="sm" className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl" onClick={() => onNavigate("/transactions")}>
            <Plus className="h-4 w-4" /> Record
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 -mt-3 space-y-2 mb-3">
        <Input placeholder="Search payment ID or store..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />

        {/* Payment Filter */}
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
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
            {agents.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {(paymentFilter !== "all" || dateFilter !== "all" || storeFilter !== "all" || customerFilter !== "all" || agentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground"
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

        {/* Transactions List */}
        {isLoading ? (
          <CardSkeletonList count={4} />
        ) : filteredTxns.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No transactions found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {paymentFilter !== "all" || storeFilter !== "all" || customerFilter !== "all" || agentFilter !== "all"
              ? "Try adjusting your filters above"
              : "No payments match your current criteria"}
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredTxns.map((txn) => {
            const isReturned = txn.is_fully_returned;
            return (
            <div
              key={txn.id}
              className={`rounded-2xl border shadow-sm overflow-hidden ${
                isReturned
                  ? "border-dashed border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10 opacity-70"
                  : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800"
              }`}
            >
              {/* Card Content */}
              <div
                onClick={() => {
                  setSelectedTxn(txn);
                  setShowDetailModal(true);
                }}
                className="p-3 active:bg-muted transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-mono font-semibold ${isReturned ? "line-through text-muted-foreground" : "text-primary"}`}>{txn.display_id}</p>
                      {isReturned && (
                        <Badge variant="outline" className="text-xs h-4 border-amber-300 text-amber-600 bg-amber-50 rounded px-1 py-0">Returned</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {txn.stores?.name || "Unknown Store"}
                    </p>
                  </div>
                  <p className={`text-sm font-bold tabular-nums ${isReturned ? "line-through text-muted-foreground" : "text-primary"}`}>{fmtINR(txn.total_amount)}</p>
                </div>

                {/* Payment Badges */}
                <div className="flex items-center gap-1.5 mb-2">
                  {txn.cash_amount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      Cash {fmtINR(txn.cash_amount)}
                    </span>
                  )}
                  {txn.upi_amount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      UPI {fmtINR(txn.upi_amount)}
                    </span>
                  )}
                </div>

                {/* Balance Change Indicator */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    txn.new_outstanding > txn.old_outstanding 
                      ? "bg-red-100 text-red-700" 
                      : txn.new_outstanding < txn.old_outstanding 
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                  }`}>
                    Balance: {fmtINR(txn.old_outstanding)} → {fmtINR(txn.new_outstanding)}
                  </span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={getRecorderAvatar(txn.recorded_by) || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10">
                        {getRecorderName(txn.recorded_by).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                      {getRecorderName(txn.recorded_by)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(txn.created_at), "dd MMM, hh:mm a")}
                  </span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex border-t border-border/50">
                <button
                  onClick={() => { setSelectedTxn(txn); setShowDetailModal(true); }}
                  className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">View</span>
                </button>
                <button
                  onClick={() => setReceiptTxnId(txn.id)}
                  className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                >
                  <Receipt className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Receipt</span>
                </button>
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
                `Load More (${allTxns.length} of ${totalTxns})`
              )}
            </Button>
          </div>
        )}
      </div>{/* end pull-to-refresh wrapper */}

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Payment Details</DialogTitle>
          </DialogHeader>

          {selectedTxn && (
            <div className="space-y-4">
              {/* Transaction Info */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Payment ID</span>
                  <span className="font-mono text-sm font-semibold">{selectedTxn.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedTxn.stores?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedTxn.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-xs text-muted-foreground">Amount Paid</span>
                  <span className="font-bold text-primary">{fmtINR(selectedTxn.total_amount)}</span>
                </div>
                {selectedTxn.cash_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700">Cash</span>
                    <span className="text-sm">{fmtINR(selectedTxn.cash_amount)}</span>
                  </div>
                )}
                {selectedTxn.upi_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-purple-700">UPI</span>
                    <span className="text-sm">{fmtINR(selectedTxn.upi_amount)}</span>
                  </div>
                )}
              </div>

              {/* Balance Summary */}
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Outstanding Balance</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Previous Balance</span>
                  <span className="tabular-nums">{fmtINR(selectedTxn.old_outstanding)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="tabular-nums text-green-700">-{fmtINR(selectedTxn.total_amount)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t">
                  <span className="font-medium text-sm">New Balance</span>
                  <span className={`font-semibold tabular-nums ${selectedTxn.new_outstanding > 0 ? "text-red-700" : "text-green-600"}`}>
                    {fmtINR(selectedTxn.new_outstanding)}
                  </span>
                </div>
              </div>

              {/* Recorder Info */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={getRecorderAvatar(selectedTxn.recorded_by) || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10">
                    {getRecorderName(selectedTxn.recorded_by).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Recorded by {getRecorderName(selectedTxn.recorded_by)}
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
                    onNavigate(`/transactions?highlight=${selectedTxn.id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    setReceiptTxnId(selectedTxn.id);
                  }}
                >
                  <Receipt className="h-3 w-3 mr-1" />
                  Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <TransactionReceipt
        transactionId={receiptTxnId || ""}
        open={!!receiptTxnId}
        onClose={() => setReceiptTxnId(null)}
      />
    </div>
  );
}
