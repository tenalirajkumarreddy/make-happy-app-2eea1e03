import { useCallback } from "react";
import { useQueryClient, QueryClient } from "@tanstack/react-query";

/**
 * Reusable helper to force an eager refetch after any mutation.
 *
 * Usage inside a component:
 *   const invalidate = useInvalidate();
 *   const mutation = useMutation({
 *     mutationFn: ...,
 *     onSettled: () => {
 *       invalidate(["sales"], ["stores"], ["dashboard-stats"]);
 *     },
 *   });
 *
 * Or call it imperatively from a custom hook by passing the qc directly:
 *   invalidateQueries(qc, ["sales"], ["stores"]);
 */

export type QueryKey = string | number | null | undefined;

export function invalidateQueries(qc: QueryClient, ...keys: (QueryKey[] | QueryKey[][])[]) {
  keys.forEach((k) => {
    const keyArray = Array.isArray(k[0]) ? (k as QueryKey[][]) : ([k] as QueryKey[][]);
    keyArray.forEach((singleKey) => {
      if (!singleKey || singleKey.length === 0) return;
      // exact:false → all queries whose key *starts with* this prefix
      // refetchType:"all" → both active and inactive observers refetch
      qc.invalidateQueries({ queryKey: singleKey, exact: false, refetchType: "all" });
    });
  });
}

/**
 * React hook wrapper. Returns a memoised invalidate function.
 */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...keys: (QueryKey[] | QueryKey[][])[]) => invalidateQueries(qc, ...keys),
    [qc]
  );
}

/**
 * Convenience: invalidate every dashboard + mobile home key.
 * Call after any mutation that could change counts (sale, txn, handover, etc.).
 */
export function invalidateAllDashboards(qc: QueryClient) {
  const DASHBOARD_KEYS = [
    ["super-admin-dashboard-stats"],
    ["manager-dashboard"],
    ["agent-dashboard"],
    ["customer-dashboard"],
    ["pos-dashboard"],
    ["marketer-dashboard"],
    ["operator-dashboard"],
    ["mobile-agent-sales-today"],
    ["mobile-agent-tx-today"],
    ["mobile-sales"],
    ["mobile-transactions"],
    ["mobile-history-sales-timeline"],
    ["mobile-history-transactions-timeline"],
    ["mobile-history-balance-sales"],
    ["mobile-history-balance-transactions"],
  ];
  DASHBOARD_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: k, exact: false, refetchType: "all" }));
}

/**
 * Invalidate the full data graph for a single store.
 */
export function invalidateStoreGraph(qc: QueryClient, storeId?: string) {
  if (storeId) {
    invalidateQueries(qc, ["store", storeId], ["store-sales", storeId], ["store-transactions", storeId], ["store-orders", storeId], ["store-visits", storeId], ["balance-adjustments", storeId], ["store-payment-returns", storeId], ["store-qr-codes", storeId]);
  }
  invalidateQueries(qc, ["stores"], ["stores-for-sale"], ["stores-for-txn"], ["customer-stores"]);
}
