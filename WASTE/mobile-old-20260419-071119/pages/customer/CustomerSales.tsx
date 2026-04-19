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
  line_total: number;
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
  stores: { name: string } | null;
  sale_items: SaleItemRow[];
}

export function CustomerSales({ selectedStoreId }: Props) {
  const { user } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-sales-self", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["mobile-customer-sales", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, display_id, created_at, total_amount, cash_amount, upi_amount, outstanding_amount, store_id, stores(name), sale_items(id, quantity, unit_price, line_total, products(name, unit))")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SaleRow[]) || [];
    },
    enabled: !!customer,
  });

  const filteredSales = useMemo(() => {
    if (!selectedStoreId) return sales || [];
    return (sales || []).filter((sale) => sale.store_id === selectedStoreId);
  }, [sales, selectedStoreId]);

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
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
          <div key={sale.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{sale.display_id}</p>
                <p className="text-xs text-slate-500 mt-0.5">{sale.stores?.name || "Store"}</p>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">₹{Number(sale.total_amount).toLocaleString("en-IN")}</p>
            </div>

            <div className="mt-2 space-y-1">
              {(sale.sale_items || []).map((item) => (
                <div key={item.id} className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                  <span className="truncate">{item.products?.name || "Item"} × {item.quantity}</span>
                  <span>₹{Number(item.line_total).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center justify-between"><span>Paid</span><span>₹{(Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0)).toLocaleString("en-IN")}</span></div>
              <div className="flex items-center justify-between"><span>Outstanding</span><span className="font-semibold text-amber-600">₹{Number(sale.outstanding_amount || 0).toLocaleString("en-IN")}</span></div>
              <div className="flex items-center justify-between"><span>Date</span><span>{new Date(sale.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
