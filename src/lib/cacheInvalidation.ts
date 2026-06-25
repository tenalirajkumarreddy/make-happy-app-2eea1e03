import { QueryClient } from "@tanstack/react-query";

/**
 * Immediately invalidate and refetch all matching query keys.
 * Use when you need 100% certainty the observer will show fresh data.
 */
export function invalidateAllKeys(qc: QueryClient, keys: string[][]) {
  keys.forEach((key) => {
    qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  });
}

/** Domain-specific invalidation helpers for offline queue sync */
export function afterOfflineSaleSync(qc: QueryClient) {
  invalidateAllKeys(qc, [
    ["sales"],
    ["dashboard-stats"],
    ["agent-dashboard-stats"],
    ["manager-dashboard"],
    ["agent-dashboard"],
    ["customer-dashboard"],
    ["pos-dashboard"],
    ["marketer-dashboard"],
    ["operator-dashboard"],
    ["stores"],
    ["customers"],
    ["orders"],
    ["inventory"],
    ["mobile-agent-sales-today"],
    ["mobile-sales"],
    ["mobile-history-sales-timeline"],
    ["mobile-history-balance-sales"],
    ["mobile-agent-pending-orders"],
    ["daybook-sales"],
    ["sales-report"],
    ["analytics"],
    ["daily-report"],
    ["stock-summary"],
  ]);
}

export function afterOfflineTransactionSync(qc: QueryClient) {
  invalidateAllKeys(qc, [
    ["transactions"],
    ["customer-transactions"],
    ["store-transactions"],
    ["dashboard-stats"],
    ["agent-dashboard-stats"],
    ["manager-dashboard"],
    ["agent-dashboard"],
    ["customer-dashboard"],
    ["pos-dashboard"],
    ["marketer-dashboard"],
    ["operator-dashboard"],
    ["stores"],
    ["customers"],
    ["customer-balances"],
    ["orders"],
    ["mobile-agent-tx-today"],
    ["mobile-transactions"],
    ["mobile-history-transactions-timeline"],
    ["mobile-history-balance-transactions"],
    ["daybook-transactions"],
    ["analytics"],
    ["daily-report"],
  ]);
}
