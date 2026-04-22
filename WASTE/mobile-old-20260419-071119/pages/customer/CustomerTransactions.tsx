import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  selectedStoreId: string | null;
}

interface CustomerRow {
  id: string;
}

interface StoreOutstandingRow {
  id: string;
  outstanding: number;
}

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
  stores: { name: string } | null;
}

interface TransactionLedgerRow {
  id: string;
  created_at: string;
  display_id: string;
  total_amount: number;
  old_outstanding: number;
  new_outstanding: number;
  store_id: string;
  stores: { name: string } | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  displayId: string;
  type: "delivery" | "payment";
  storeName: string;
  saleAmount: number;
  paidAmount: number;
  oldOutstanding: number;
  newOutstanding: number;
  storeId: string;
}

export function CustomerTransactions({ selectedStoreId }: Props) {
  const { user } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-ledger-self", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-ledger-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, outstanding")
        .eq("customer_id", customer!.id);
      if (error) throw error;
      return (data as StoreOutstandingRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: sales } = useQuery({
    queryKey: ["mobile-customer-ledger-sales", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at, display_id, total_amount, cash_amount, upi_amount, old_outstanding, new_outstanding, store_id, stores(name)")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SaleLedgerRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["mobile-customer-ledger-payments", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, created_at, display_id, total_amount, old_outstanding, new_outstanding, store_id, stores(name)")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as TransactionLedgerRow[]) || [];
    },
    enabled: !!customer,
  });

  const ledger = useMemo(() => {
    const entries: LedgerEntry[] = [
      ...(sales || []).map((sale) => ({
        id: sale.id,
        date: sale.created_at,
        displayId: sale.display_id,
        type: "delivery" as const,
        storeName: sale.stores?.name || "Store",
        saleAmount: Number(sale.total_amount || 0),
        paidAmount: Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0),
        oldOutstanding: Number(sale.old_outstanding || 0),
        newOutstanding: Number(sale.new_outstanding || 0),
        storeId: sale.store_id,
      })),
      ...(transactions || []).map((transaction) => ({
        id: transaction.id,
        date: transaction.created_at,
        displayId: transaction.display_id,
        type: "payment" as const,
        storeName: transaction.stores?.name || "Store",
        saleAmount: 0,
        paidAmount: Number(transaction.total_amount || 0),
        oldOutstanding: Number(transaction.old_outstanding || 0),
        newOutstanding: Number(transaction.new_outstanding || 0),
        storeId: transaction.store_id,
      })),
    ];

    const filtered = selectedStoreId ? entries.filter((entry) => entry.storeId === selectedStoreId) : entries;
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, selectedStoreId, transactions]);

  const totalOutstanding = useMemo(() => {
    if (!stores) return 0;
    return stores.reduce((sum, store) => sum + Number(store.outstanding || 0), 0);
  }, [stores]);

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Outstanding" value={`₹${totalOutstanding.toLocaleString("en-IN")}`} />
        <SummaryCard label="Deliveries" value={String((sales || []).length)} />
        <SummaryCard label="Payments" value={String((transactions || []).length)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : ledger.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-muted-foreground">
          No transaction history found.
        </div>
      ) : (
        <div className="space-y-2">
          {ledger.map((entry) => (
            <div key={`${entry.type}-${entry.id}`} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{entry.displayId}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{entry.storeName}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${entry.type === "delivery" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {entry.type === "delivery" ? "Delivery" : "Payment"}
                </span>
              </div>

              <div className="mt-2 text-[11px] text-slate-500 space-y-1">
                <div className="flex items-center justify-between"><span>Sale Amount</span><span>{entry.saleAmount > 0 ? `₹${entry.saleAmount.toLocaleString("en-IN")}` : "—"}</span></div>
                <div className="flex items-center justify-between"><span>Paid</span><span>₹{entry.paidAmount.toLocaleString("en-IN")}</span></div>
                <div className="flex items-center justify-between"><span>Old Balance</span><span>₹{entry.oldOutstanding.toLocaleString("en-IN")}</span></div>
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-200"><span>New Balance</span><span>₹{entry.newOutstanding.toLocaleString("en-IN")}</span></div>
                <div className="flex items-center justify-between"><span>Date</span><span>{new Date(entry.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1">
        <Wallet className="h-3.5 w-3.5 text-slate-400" />
        <span>{value}</span>
      </p>
    </div>
  );
}
