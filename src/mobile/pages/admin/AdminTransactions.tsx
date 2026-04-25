import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, CreditCard, ChevronRight, Receipt, FileText } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Transaction {
  id: string;
  display_id: string;
  store_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  old_outstanding: number;
  new_outstanding: number;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch transactions
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["mobile-transactions", currentWarehouse?.id, paymentFilter],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*, stores(name, display_id)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      if (paymentFilter === "cash") query = query.gt("cash_amount", 0);
      if (paymentFilter === "upi") query = query.gt("upi_amount", 0);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Transaction[];
    },
  });

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
  });

  // Filter by search
  const filteredTxns = useMemo(() => {
    return (transactions || []).filter((txn) =>
      txn.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.stores?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  const getRecorderName = (userId: string) => {
    return profileMap[userId]?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    return profileMap[userId]?.avatar_url || null;
  };

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  };

  return (
    <div className="pb-6 space-y-4">
      {/* Header */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Transactions</h2>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onNavigate("/transactions")}
          >
            <Plus className="h-4 w-4" />
            Record
          </Button>
        </div>

        {/* Search & Filter */}
        <Input
          placeholder="Search payment ID or store..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-sm h-9"
        />

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredTxns.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No transactions found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredTxns.map((txn) => (
            <div
              key={txn.id}
              className="rounded-lg border bg-card overflow-hidden"
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
                    <p className="text-sm font-mono font-semibold text-primary">{txn.display_id}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {txn.stores?.name || "Unknown Store"}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-primary">{formatAmount(txn.total_amount)}</p>
                </div>

                {/* Payment Badges */}
                <div className="flex items-center gap-1.5 mb-2">
                  {txn.cash_amount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      Cash {formatAmount(txn.cash_amount)}
                    </span>
                  )}
                  {txn.upi_amount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      UPI {formatAmount(txn.upi_amount)}
                    </span>
                  )}
                </div>

                {/* Balance Change Indicator */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    txn.new_outstanding > txn.old_outstanding 
                      ? "bg-red-100 text-red-700" 
                      : txn.new_outstanding < txn.old_outstanding 
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                  }`}>
                    Balance: {formatAmount(txn.old_outstanding)} → {formatAmount(txn.new_outstanding)}
                  </span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={getRecorderAvatar(txn.recorded_by) || undefined} />
                      <AvatarFallback className="text-[9px] bg-primary/10">
                        {getRecorderName(txn.recorded_by).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
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
                  onClick={() => onNavigate(`/transactions?highlight=${txn.id}`)}
                  className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
                <button
                  onClick={() => onNavigate(`/transactions?receipt=${txn.id}`)}
                  className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                  <span className="font-bold text-primary">{formatAmount(selectedTxn.total_amount)}</span>
                </div>
                {selectedTxn.cash_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700">Cash</span>
                    <span className="text-sm">{formatAmount(selectedTxn.cash_amount)}</span>
                  </div>
                )}
                {selectedTxn.upi_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-purple-700">UPI</span>
                    <span className="text-sm">{formatAmount(selectedTxn.upi_amount)}</span>
                  </div>
                )}
              </div>

              {/* Balance Summary */}
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Outstanding Balance</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Previous Balance</span>
                  <span className="tabular-nums">{formatAmount(selectedTxn.old_outstanding)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="tabular-nums text-green-700">-{formatAmount(selectedTxn.total_amount)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t">
                  <span className="font-medium text-sm">New Balance</span>
                  <span className={`font-semibold tabular-nums ${selectedTxn.new_outstanding > 0 ? "text-red-700" : "text-green-600"}`}>
                    {formatAmount(selectedTxn.new_outstanding)}
                  </span>
                </div>
              </div>

              {/* Recorder Info */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={getRecorderAvatar(selectedTxn.recorded_by) || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary/10">
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
                    onNavigate(`/transactions?receipt=${selectedTxn.id}`);
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
    </div>
  );
}
