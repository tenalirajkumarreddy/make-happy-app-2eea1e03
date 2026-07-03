import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingCart, Wallet, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface SaleLedgerRow {
  id: string;
  created_at: string;
  display_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  old_outstanding: number;
  new_outstanding: number;
  store_id: string;
  deleted_at: string | null;
  is_fully_returned: boolean;
}

interface TransactionLedgerRow {
  id: string;
  created_at: string;
  display_id: string;
  total_amount: number;
  old_outstanding: number;
  new_outstanding: number;
  store_id: string;
  deleted_at: string | null;
  is_fully_returned: boolean;
}

interface LedgerEntry {
  id: string;
  date: string;
  displayId: string;
  type: "sale" | "payment";
  amount: number;
  oldOutstanding: number;
  newOutstanding: number;
  isFullyReturned: boolean;
  isDeleted: boolean;
}

interface StoreLedgerProps {
  storeId: string;
}

export function StoreLedger({ storeId }: StoreLedgerProps) {
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["mobile-store-ledger-sales", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at, display_id, total_amount, old_outstanding, new_outstanding, store_id, deleted_at, is_fully_returned")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as SaleLedgerRow[]) || [];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["mobile-store-ledger-transactions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, created_at, display_id, total_amount, old_outstanding, new_outstanding, store_id, deleted_at, is_fully_returned")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as TransactionLedgerRow[]) || [];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const ledger = useMemo(() => {
    const entries: LedgerEntry[] = [
      ...(sales || []).map((sale) => ({
        id: `sale-${sale.id}`,
        date: sale.created_at,
        displayId: sale.display_id,
        type: "sale" as const,
        amount: Number(sale.total_amount || 0),
        oldOutstanding: Number(sale.old_outstanding || 0),
        newOutstanding: Number(sale.new_outstanding || 0),
        isFullyReturned: sale.is_fully_returned,
        isDeleted: !!sale.deleted_at,
      })),
      ...(transactions || []).map((transaction) => ({
        id: `txn-${transaction.id}`,
        date: transaction.created_at,
        displayId: transaction.display_id,
        type: "payment" as const,
        amount: Number(transaction.total_amount || 0),
        oldOutstanding: Number(transaction.old_outstanding || 0),
        newOutstanding: Number(transaction.new_outstanding || 0),
        isFullyReturned: transaction.is_fully_returned,
        isDeleted: !!transaction.deleted_at,
      })),
    ];

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, transactions]);

  const isLoading = salesLoading || transactionsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (ledger.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center">
        <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No transaction history</p>
        <p className="text-xs text-slate-400 mt-1">Sales and payments will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ledger.map((entry) => {
        const isVoided = entry.isDeleted || entry.isFullyReturned;
        const statusLabel = entry.isDeleted
          ? "Cancelled"
          : entry.isFullyReturned
          ? "Returned"
          : null;
        const badgeClass = entry.isDeleted
          ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";

        return (
          <div
            key={entry.id}
            className={cn(
              "rounded-xl border p-3 shadow-sm",
              isVoided
                ? "opacity-60 bg-slate-50 dark:bg-slate-900/40 border-dashed border-slate-200 dark:border-slate-700"
                : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    isVoided
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                      : entry.type === "sale"
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  )}
                >
                  {entry.type === "sale" ? (
                    <ShoppingCart className="h-4 w-4" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={cn(
                        "text-sm font-bold truncate",
                        isVoided
                          ? "line-through text-slate-400 dark:text-slate-500"
                          : "text-slate-900 dark:text-white"
                      )}
                    >
                      {entry.displayId}
                    </p>
                    {statusLabel && (
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
                          badgeClass
                        )}
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(entry.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "text-sm font-bold",
                    isVoided
                      ? "line-through text-slate-400 dark:text-slate-500"
                      : entry.type === "sale"
                      ? "text-slate-900 dark:text-white"
                      : "text-emerald-600"
                  )}
                >
                  {entry.type === "sale" ? "+" : "-"}₹{entry.amount.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bal: ₹{entry.newOutstanding.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
