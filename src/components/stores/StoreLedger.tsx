import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Package, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LedgerEntry = {
  id: string;
  type: "sale" | "payment" | "correction" | "return";
  date: string;
  display_id: string;
  description: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  outstanding: number; // new_outstanding = running balance
  notes: string | null;
  recorded_by: string;
  raw: any;
};

interface StoreLedgerProps {
  sales: any[];
  transactions: any[];
  paymentReturns?: any[];
  balanceAdjustments?: any[];
  openingBalance: number;
  storeCreatedAt: string;
  profileMap: Map<string, { user_id: string; full_name: string; avatar_url: string | null }>;
}

export function StoreLedger({ sales, transactions, paymentReturns = [], balanceAdjustments = [], openingBalance, storeCreatedAt, profileMap }: StoreLedgerProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];

    const returnByTxnId = new Map<string, any>();
    for (const r of paymentReturns) {
      returnByTxnId.set(r.original_transaction_id, r);
    }

    // Filter out cancelled/returned entries
    const activeSales = sales.filter((s: any) => !s.deleted_at);
    const activeTransactions = transactions.filter((t: any) => !t.deleted_at);

    for (const s of activeSales) {
      entries.push({
        id: s.id,
        type: "sale",
        date: s.created_at,
        display_id: s.display_id,
        description: `Sale #${s.display_id}`,
        total_amount: Number(s.total_amount),
        cash_amount: Number(s.cash_amount),
        upi_amount: Number(s.upi_amount),
        outstanding: Number(s.new_outstanding), // fallback, will be recomputed
        notes: s.notes,
        recorded_by: s.recorded_by,
        raw: s,
      });
    }

    for (const t of activeTransactions) {
      const paymentMethod = Number(t.cash_amount) > 0 && Number(t.upi_amount) > 0
        ? "Cash+UPI"
        : Number(t.upi_amount) > 0 ? "UPI" : "Cash";
      const ret = returnByTxnId.get(t.id);
      const isReturned = t.is_fully_returned;
      entries.push({
        id: t.id,
        type: "payment",
        date: t.created_at,
        display_id: t.display_id,
        description: `Payment (${paymentMethod}) #${t.display_id}`,
        total_amount: Number(t.total_amount),
        cash_amount: Number(t.cash_amount),
        upi_amount: Number(t.upi_amount),
        outstanding: isReturned ? Number(t.old_outstanding) : Number(t.new_outstanding),
        notes: isReturned ? (ret?.reason === "full_return" ? "Full return" : ret?.reason === "duplicate_payment" ? "Duplicate payment" : ret?.reason === "wrong_amount" ? "Wrong amount" : ret?.reason?.replace(/_/g, " ") || t.notes) : t.notes,
        recorded_by: t.recorded_by,
        raw: { ...t, returnInfo: ret || null },
      });
    }

    for (const adj of balanceAdjustments) {
      entries.push({
        id: adj.id,
        type: "correction",
        date: adj.created_at,
        display_id: "",
        description: `Balance Adjustment: ₹${Number(adj.old_outstanding).toLocaleString()} → ₹${Number(adj.new_outstanding).toLocaleString()}`,
        total_amount: Number(adj.adjustment_amount),
        cash_amount: 0,
        upi_amount: 0,
        outstanding: Number(adj.new_outstanding),
        notes: adj.reason,
        recorded_by: adj.adjusted_by,
        raw: adj,
      });
    }

    // Sort OLDEST first for running balance calculation
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance from opening balance forward (like a bank statement)
    let runningBalance = openingBalance;
    for (const entry of entries) {
      if (entry.type === "sale") {
        // Sale adds outstanding (debit to customer, credit to us = outstanding increases)
        // Skip returned sales - they are reversed by the return transaction
        if (entry.raw?.is_fully_returned) {
          continue;
        }
        runningBalance += entry.total_amount - entry.cash_amount - entry.upi_amount;
      } else if (entry.type === "payment") {
        // Payment reduces outstanding (credit from customer)
        if (!entry.raw?.is_fully_returned) {
          runningBalance -= entry.total_amount;
        }
      } else if (entry.type === "correction" && entry.id !== "__opening_balance__") {
        // Balance adjustment directly sets the balance
        runningBalance = entry.outstanding;
      }
      entry.outstanding = runningBalance;
    }

    // Add opening balance as the very first (oldest) entry
    entries.unshift({
      id: "__opening_balance__",
      type: "correction" as const,
      date: storeCreatedAt,
      display_id: "",
      description: "Opening Balance",
      total_amount: openingBalance,
      cash_amount: 0,
      upi_amount: 0,
      outstanding: openingBalance,
      notes: null,
      recorded_by: "",
      raw: null,
    });

    // Now sort newest first for display
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return entries;
  }, [sales, transactions, paymentReturns, balanceAdjustments, openingBalance]);

  const selectedEntry = ledgerEntries.find((e) => e.id === selectedEntryId);
  const isSaleSelected = selectedEntry?.type === "sale";

  const { data: saleItems, isLoading: loadingSaleItems } = useQuery({
    queryKey: ["sale-items-detail", selectedEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*, products(name, sku)")
        .eq("sale_id", selectedEntryId!);
      return data || [];
    },
    enabled: !!selectedEntryId && isSaleSelected,
  });

  const getRecorder = (uid: string) => profileMap.get(uid);

  const columns = [
    {
      header: "Date",
      accessor: (row: LedgerEntry) => row.date ? formatDate(row.date) : "—",
      className: "text-muted-foreground text-xs",
    },
    {
      header: "Description",
      accessor: (row: LedgerEntry) => {
        if (row.id === "__opening_balance__") {
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm text-muted-foreground">Opening Balance</p>
                <p className="text-3xs text-muted-foreground">Admin</p>
              </div>
            </div>
          );
        }
        const isSaleReturned = row.type === "sale" && row.raw?.is_fully_returned;
        const isPaymentReturned = row.type === "payment" && row.raw?.is_fully_returned;
        return (
          <div>
            <p className={`font-medium text-sm ${isSaleReturned || isPaymentReturned ? "line-through text-muted-foreground" : row.type === "return" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {row.description}
              {(isSaleReturned || isPaymentReturned) && (
                <Badge variant="outline" className="ml-2 text-4xs border-amber-300 text-amber-600 bg-amber-50 rounded px-1 py-0">Returned</Badge>
              )}
            </p>
            <p className="text-3xs text-muted-foreground uppercase">{row.type === "sale" ? "SALE" : row.type === "payment" ? "PAYMENT" : row.type === "return" ? "RETURN" : "ADJUSTMENT"}</p>
            {row.notes && (
              <p className="text-3xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <span className="w-0.5 h-3 bg-primary/40 rounded-full inline-block" />
                <span className="italic">{row.notes}</span>
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Debit (-)",
      accessor: (row: LedgerEntry) =>
        row.type === "sale" ? (
          <span className={`font-medium ${row.raw?.is_fully_returned ? "line-through text-muted-foreground opacity-50" : "text-destructive"}`}>₹{row.total_amount.toLocaleString()}</span>
        ) : row.id === "__opening_balance__" && row.total_amount > 0 ? (
          <span className="text-destructive font-medium">₹{row.total_amount.toLocaleString()}</span>
        ) : row.type === "correction" && row.id !== "__opening_balance__" && row.total_amount > 0 ? (
          <span className="text-destructive font-medium">₹{row.total_amount.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Credit (+)",
      accessor: (row: LedgerEntry) => {
        if (row.id === "__opening_balance__" && row.total_amount < 0) {
          return <span className="text-success font-medium">₹{Math.abs(row.total_amount).toLocaleString()}</span>;
        }
        if (row.id !== "__opening_balance__" && row.type === "payment") {
          if (row.raw?.is_fully_returned) {
            return <span className="text-muted-foreground line-through">₹{row.total_amount.toLocaleString()}</span>;
          }
          return <span className="text-success font-medium">₹{row.total_amount.toLocaleString()}</span>;
        }
        if (row.type === "return") {
          return <span className="text-success font-semibold">₹{row.total_amount.toLocaleString()}</span>;
        }
        if (row.type === "sale" && !row.raw?.is_fully_returned && (row.cash_amount + row.upi_amount) > 0) {
          return <span className="text-success font-medium">₹{(row.cash_amount + row.upi_amount).toLocaleString()}</span>;
        }
        if (row.type === "correction" && row.id !== "__opening_balance__" && row.total_amount < 0) {
          return <span className="text-success font-medium">₹{Math.abs(row.total_amount).toLocaleString()}</span>;
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      header: "Balance",
      accessor: (row: LedgerEntry) => (
        <span className={row.outstanding > 0 ? "text-destructive font-semibold" : row.outstanding < 0 ? "text-success font-semibold" : "text-muted-foreground font-semibold"}>
          {row.outstanding < 0 ? "-" : ""}₹{Math.abs(row.outstanding).toLocaleString()}
        </span>
      ),
    },
  ];

  const renderMobileCard = (row: LedgerEntry) => {
    const p = getRecorder(row.recorded_by);

    if (row.id === "__opening_balance__") {
      const isCredit = row.total_amount < 0;
      const displayAmount = Math.abs(row.total_amount);
      return (
        <div className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <Badge variant={isCredit ? "secondary" : "destructive"} className="text-2xs h-5">
              {isCredit ? "CREDIT" : "DEBIT"}
            </Badge>
            <span className="text-3xs text-muted-foreground">
              {formatDate(row.date)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-medium text-sm text-muted-foreground">Opening Balance</span>
            <span className={`text-sm font-bold ${isCredit ? "text-success" : "text-destructive"}`}>
              {isCredit ? "+" : "-"}₹{displayAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-3xs">
            <span className={row.outstanding > 0 ? "text-destructive" : row.outstanding < 0 ? "text-success" : "text-muted-foreground"}>
              Bal: {row.outstanding < 0 ? "-" : ""}₹{Math.abs(row.outstanding).toLocaleString()}
            </span>
            <span className="text-muted-foreground">Admin</span>
          </div>
        </div>
      );
    }

    if (row.type === "return") {
      return (
        <div
          className="rounded-xl border bg-card px-3 py-2.5 shadow-sm border-dashed border-red-200 dark:border-red-900/50 bg-red-50/5 dark:bg-red-950/5 cursor-pointer"
          onClick={() => setSelectedEntryId(row.id)}
        >
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-2xs h-5 border-amber-300 text-amber-600 bg-amber-50 rounded px-1.5 py-0">
              RETURN
            </Badge>
            <span className="text-3xs text-muted-foreground">
              {formatDate(row.date)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-mono text-xs text-muted-foreground">{row.display_id}</span>
            <span className="text-sm font-bold text-success">+₹{row.total_amount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-3xs">
            <span className={row.outstanding > 0 ? "text-destructive" : row.outstanding < 0 ? "text-success" : "text-muted-foreground"}>
              Bal: {row.outstanding < 0 ? "-" : ""}₹{Math.abs(row.outstanding).toLocaleString()}
            </span>
            {p && <span className="text-muted-foreground">{p.full_name}</span>}
          </div>
        </div>
      );
    }

    const isSaleReturned = row.type === "sale" && row.raw?.is_fully_returned;
    const isPaymentReturned = row.type === "payment" && row.raw?.is_fully_returned;
    const isReturned = isSaleReturned || isPaymentReturned;
    const rowTypeDisplay = isReturned ? "RETURNED" : row.type === "sale" ? "SALE" : row.type === "correction" ? "ADJUSTMENT" : "PAYMENT";

    return (
      <div
        className={`rounded-xl border bg-card px-3 py-2.5 shadow-sm cursor-pointer ${isReturned ? "opacity-60 bg-slate-50 dark:bg-slate-900/40 border-dashed border-red-200 dark:border-red-900/40" : ""}`}
        onClick={() => setSelectedEntryId(row.id)}
      >
        <div className="flex items-center justify-between">
          {isReturned ? (
            <Badge className="text-2xs h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded px-1.5 py-0">
              RETURNED
            </Badge>
          ) : (
            <Badge variant={row.type === "sale" ? "destructive" : row.type === "correction" ? "outline" : "secondary"} className="text-2xs h-5">
              {rowTypeDisplay}
            </Badge>
          )}
          <span className="text-3xs text-muted-foreground">
            {formatDate(row.date)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`font-mono text-xs text-muted-foreground ${isReturned ? "line-through text-slate-400 dark:text-slate-500" : ""}`}>{row.display_id}</span>
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-sm font-bold ${isReturned ? "line-through text-slate-400 dark:text-slate-500" : row.type === "payment" ? "text-success" : "text-destructive"}`}>
              {row.type === "payment" ? "+" : "-"}₹{row.total_amount.toLocaleString()}
            </span>
            {!isReturned && row.type === "sale" && (row.cash_amount + row.upi_amount) > 0 && (
              <span className="text-xs font-medium text-success">+₹{(row.cash_amount + row.upi_amount).toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 text-3xs">
          <span className={row.outstanding > 0 ? "text-destructive" : row.outstanding < 0 ? "text-success" : "text-muted-foreground"}>
            Bal: {row.outstanding < 0 ? "-" : ""}₹{Math.abs(row.outstanding).toLocaleString()}
          </span>
          {p && <span className="text-muted-foreground">{p.full_name}</span>}
        </div>
      </div>
    );
  };

  return (
    <>
      {ledgerEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          No ledger entries yet
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={ledgerEntries}
            searchKey="display_id"
            searchPlaceholder="Search by ID..."
            onRowClick={(row: any) => setSelectedEntryId(row.id)}
            renderMobileCard={renderMobileCard}
          />
        </>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={!!selectedEntryId} onOpenChange={(v) => { if (!v) setSelectedEntryId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.type === "sale" ? "Sale Details" : selectedEntry?.type === "payment" ? "Payment Details" : selectedEntry?.type === "return" ? "Return Details" : "Entry Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{selectedEntry.display_id}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(selectedEntry.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-bold">₹{selectedEntry.total_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash</span>
                  <span>₹{selectedEntry.cash_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>UPI</span>
                  <span>₹{selectedEntry.upi_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Balance After</span>
                  <span className={selectedEntry.outstanding < 0 ? "text-destructive" : ""}>
                    ₹{Math.abs(selectedEntry.outstanding).toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedEntry.type === "payment" && selectedEntry.raw?.is_fully_returned && selectedEntry.raw?.returnInfo && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-amber-500 rounded-full inline-block" />
                    Return Details
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">Return ID</span>
                    <span className="font-mono font-medium text-right">{selectedEntry.raw.returnInfo.display_id}</span>
                    <span className="text-muted-foreground">Return Amount</span>
                    <span className="font-medium text-right text-success">+₹{Number(selectedEntry.raw.returnInfo.return_amount).toLocaleString()}</span>
                    <span className="text-muted-foreground">Reason</span>
                    <span className="font-medium text-right capitalize">{selectedEntry.raw.returnInfo.reason?.replace(/_/g, " ") || "—"}</span>
                    <span className="text-muted-foreground">Return Date</span>
                    <span className="font-medium text-right">{new Date(selectedEntry.raw.returnInfo.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                </div>
              )}

              {selectedEntry.notes && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm italic">{selectedEntry.notes}</p>
                </div>
              )}

              {/* Sale items */}
              {isSaleSelected && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-muted-foreground" /> Items
                  </p>
                  {loadingSaleItems ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : saleItems && saleItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {saleItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                          <div>
                            <p className="font-medium">{item.products?.name || "—"}</p>
                            <p className="text-3xs text-muted-foreground">{item.products?.sku} · Qty: {Number(item.quantity)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{Number(item.total_price).toLocaleString()}</p>
                            <p className="text-3xs text-muted-foreground">@ ₹{Number(item.unit_price).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No items recorded</p>
                  )}
                </div>
              )}

              {(() => {
                const p = getRecorder(selectedEntry.recorded_by);
                return p ? (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={p?.avatar_url || undefined} />
                      <AvatarFallback className="text-4xs bg-primary/10 text-primary">
                        {(p?.full_name || "?").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">Recorded by {p?.full_name || "—"}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
