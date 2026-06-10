import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  selectedStoreId: string | null;
}

interface CustomerRow {
  id: string;
}

interface SaleItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products: { name: string; unit: string | null } | null;
}

interface SaleRow {
  id: string;
  display_id: string;
  created_at: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  outstanding_amount: number;
  store_id: string;
  is_fully_returned?: boolean;
  stores: { name: string } | null;
  sale_items: SaleItemRow[];
}

export function CustomerSales({ selectedStoreId }: Props) {
  const { user, profile } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-sales-self", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id")) as CustomerRow | null,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["mobile-customer-sales", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, display_id, created_at, total_amount, cash_amount, upi_amount, outstanding_amount, store_id, is_fully_returned, stores(name), sale_items(id, quantity, unit_price, total_price, products(name, unit))")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SaleRow[]) || [];
    },
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
  });

  const filteredSales = useMemo(() => {
    if (!selectedStoreId) return sales || [];
    return (sales || []).filter((sale) => sale.store_id === selectedStoreId);
  }, [sales, selectedStoreId]);

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">My Purchases</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{(profile?.full_name ?? customer?.name ?? "Customer").split(" ")[0]} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-muted-foreground">
          No sales found for selected store.
        </div>
      ) : (
        filteredSales.map((sale) => (
          <div key={sale.id} className={`rounded-2xl bg-white dark:bg-slate-800 border p-3 shadow-sm ${sale.is_fully_returned ? "opacity-70 bg-slate-50 dark:bg-slate-900/40 border-dashed border-red-200 dark:border-red-900/40" : "border-slate-100 dark:border-slate-700"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`text-sm font-bold font-mono ${sale.is_fully_returned ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>{sale.display_id}</p>
                  {sale.is_fully_returned && (
                    <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0">
                      Returned
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{sale.stores?.name || "Store"}</p>
              </div>
              <p className={`text-sm font-bold ${sale.is_fully_returned ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>₹{Number(sale.total_amount).toLocaleString("en-IN")}</p>
            </div>

            <div className="mt-2 space-y-1">
              {(sale.sale_items || []).map((item) => (
                <div key={item.id} className={`text-xs flex items-center justify-between gap-2 ${sale.is_fully_returned ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"}`}>
                  <span className="truncate">{item.products?.name || "Item"} × {item.quantity}</span>
                  <span>₹{Number(item.total_price).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 space-y-1">
              <div className="flex items-center justify-between"><span>Paid</span><span className={sale.is_fully_returned ? "line-through" : ""}>₹{(Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0)).toLocaleString("en-IN")}</span></div>
              <div className="flex items-center justify-between"><span>Outstanding</span><span className={`font-semibold ${sale.is_fully_returned ? "line-through text-slate-400" : "text-amber-600"}`}>₹{Number(sale.outstanding_amount || 0).toLocaleString("en-IN")}</span></div>
              <div className="flex items-center justify-between"><span>Date</span><span>{new Date(sale.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
            </div>
          </div>
        ))
      )}
      </div>
    </div>
  );
}
