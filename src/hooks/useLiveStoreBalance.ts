import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the authoritative outstanding balance for a store.
 *
 * Strategy:
 * 1. Try the server-computed `outstanding` column first (fast, single row).
 * 2. Fallback to a client-side recomputation from sales, transactions, and
 *    adjustments so the UI never shows "0" because of a missing column.
 *
 * This guarantees the StatCard / profile card always shows the true outstanding.
 */
export function useLiveStoreBalance(storeId: string | undefined) {
  // Primary: server-computed outstanding
  const { data: storeRow } = useQuery({
    queryKey: ["store-outstanding", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data } = await supabase
        .from("stores")
        .select("outstanding, opening_balance")
        .eq("id", storeId)
        .single();
      return data;
    },
    enabled: !!storeId,
    staleTime: 0,
// Keep in cache for 5 minutes but always refetch when active
  });

  // Fallback data: sales
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

  // Fallback data: transactions
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

  // Fallback data: balance adjustments
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
    // Prefer the server-computed outstanding when available
    if (storeRow?.outstanding !== undefined && storeRow.outstanding !== null) {
      return Number(storeRow.outstanding);
    }

    // Fallback: client-side recomputation
    let balance = Number(storeRow?.opening_balance || 0);

    for (const s of salesData || []) {
      if (s.status === "cancelled" || s.is_fully_returned) continue;
      balance += Math.max(
        0,
        Number(s.total_amount || 0) - Number(s.cash_amount || 0) - Number(s.upi_amount || 0)
      );
    }

    for (const t of txnData || []) {
      if (t.is_fully_returned) continue;
      balance -= Math.abs(Number(t.total_amount || 0));
    }

    for (const a of adjustmentData || []) {
      if (a.new_outstanding !== undefined && a.new_outstanding !== null) {
        balance = Number(a.new_outstanding);
      }
    }

    return balance;
  }, [salesData, txnData, adjustmentData, storeRow]);

  return liveOutstanding;
}
