import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Computes the live (computed) outstanding balance for a store
 * by processing sales, transactions, and adjustments from the DB.
 *
 * This matches the calculation in StoreLedger but returns a single number
 * so the StatCard / profile card always shows the true outstanding.
 */
export function useLiveStoreBalance(storeId: string | undefined) {
  const { data: store } = useQuery({
    queryKey: ["store-opening-balance", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data } = await supabase
        .from("stores")
        .select("opening_balance")
        .eq("id", storeId)
        .single();
      return data;
    },
    enabled: !!storeId,
    staleTime: 0,
  });

  const { data: salesData } = useQuery({
    queryKey: ["store-sales-balance", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount, status, is_fully_returned, created_at")
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!storeId,
    staleTime: 0,
  });

  const { data: txnData } = useQuery({
    queryKey: ["store-txn-balance", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("total_amount, is_fully_returned, created_at")
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!storeId,
    staleTime: 0,
  });

  const { data: adjustmentData } = useQuery({
    queryKey: ["store-adjustments-balance", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data } = await supabase
        .from("balance_adjustments")
        .select("adjustment_amount, new_outstanding, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!storeId,
    staleTime: 0,
  });

  const liveOutstanding = useMemo(() => {
    let balance = Number(store?.opening_balance || 0);

    // Sales: add outstanding portion (respect cancelled/returned)
    for (const s of salesData || []) {
      if (s.status === "cancelled" || s.is_fully_returned) continue;
      balance += Math.max(
        0,
        Number(s.total_amount || 0) - Number(s.cash_amount || 0) - Number(s.upi_amount || 0)
      );
    }

    // Transactions: subtract payment (respect returned)
    for (const t of txnData || []) {
      if (t.is_fully_returned) continue;
      balance -= Math.abs(Number(t.total_amount || 0));
    }

    // Balance adjustments directly set the balance
    for (const a of adjustmentData || []) {
      if (a.new_outstanding !== undefined && a.new_outstanding !== null) {
        balance = Number(a.new_outstanding);
      }
    }

    return balance;
  }, [salesData, txnData, adjustmentData, store?.opening_balance]);

  return liveOutstanding;
}
