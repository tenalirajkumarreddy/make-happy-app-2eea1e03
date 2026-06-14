import { QueryClient } from "@tanstack/react-query";

const FORCE = { refetchType: 'all' as const };

function invalidateAll(qc: QueryClient, key: string[], force?: boolean) {
  qc.invalidateQueries({ queryKey: key, ...(force ? FORCE : undefined) });
}

export function afterSaleSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["staff-stock"], true);
  invalidateAll(qc, ["product-stock"], true);
  invalidateAll(qc, ["stock-movements"], true);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["mobile-pending-orders-for-store"]);
  invalidateAll(qc, ["agent-stock"], true);
  invalidateAll(qc, ["agent-stock-holdings"], true);
  invalidateAll(qc, ["agent-stock-requests"], true);
  invalidateAll(qc, ["agent-stock-history"], true);
  invalidateAll(qc, ["agent-dashboard"]);
  invalidateAll(qc, ["stock-summary"]);
  invalidateAll(qc, ["stock-summary-products"]);
  invalidateAll(qc, ["stock-summary-stock"]);
  invalidateAll(qc, ["stock-summary-warehouses"]);
  invalidateAll(qc, ["warehouse-stock"], true);
  invalidateAll(qc, ["staff-stock-by-warehouse"]);
  invalidateAll(qc, ["inventory"], true);
  invalidateAll(qc, ["inventory-pending-returns"]);
  invalidateAll(qc, ["inventory-timeline-sales"]);
  invalidateAll(qc, ["inventory-timeline-purchases"]);
  invalidateAll(qc, ["inventory-timeline-sale-returns"]);
  invalidateAll(qc, ["inventory-timeline-purchase-returns"]);
  invalidateAll(qc, ["stock-transfers"], true);
  invalidateAll(qc, ["store-pricing"]);
  invalidateAll(qc, ["store-type-pricing"]);
  invalidateAll(qc, ["store_type_products"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["marketer-dashboard"]);
  invalidateAll(qc, ["pos-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  invalidateAll(qc, ["analytics"]);
  invalidateAll(qc, ["daily-report"]);
  invalidateAll(qc, ["daybook-sales"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-agent-sales-today"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"], true);
    invalidateAll(qc, ["mobile-products-for-sale"], true);
    invalidateAll(qc, ["mobile-products"]);
    invalidateAll(qc, ["mobile-inventory"], true);
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-history-sales-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-sales"]);
    invalidateAll(qc, ["mobile-agent-pending-orders"]);
    invalidateAll(qc, ["operator-stock"], true);
  }
  if (options?.storeId) {
    invalidateAll(qc, ["sale-items-for-store", options.storeId]);
  }
}

export function afterTransactionSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  invalidateAll(qc, ["transactions"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["stores-for-txn"]);
  invalidateAll(qc, ["stores-for-sale"]);
  invalidateAll(qc, ["store"]);
  invalidateAll(qc, ["customer-stores"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["customer-balances"]);
  invalidateAll(qc, ["customer-transactions"]);
  invalidateAll(qc, ["store-transactions"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["marketer-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  invalidateAll(qc, ["daybook-transactions"]);
  invalidateAll(qc, ["analytics"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-agent-tx-today"]);
    invalidateAll(qc, ["mobile-transactions"]);
    invalidateAll(qc, ["mobile-history-transactions-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-transactions"]);
  }
}

export function afterSaleReturned(qc: QueryClient, options?: { isMobile?: boolean; saleId?: string }) {
  invalidateAll(qc, ["sale-returns"]);
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["staff-stock"], true);
  invalidateAll(qc, ["product-stock"], true);
  invalidateAll(qc, ["stock-movements"], true);
  invalidateAll(qc, ["agent-stock-holdings"], true);
  invalidateAll(qc, ["warehouse-stock"], true);
  invalidateAll(qc, ["inventory-pending-returns"]);
  invalidateAll(qc, ["inventory-timeline-sales"]);
  invalidateAll(qc, ["inventory-timeline-purchases"]);
  invalidateAll(qc, ["inventory-timeline-sale-returns"]);
  invalidateAll(qc, ["inventory-timeline-purchase-returns"]);
  invalidateAll(qc, ["balance-adjustments"]);
  invalidateAll(qc, ["inventory"], true);
  invalidateAll(qc, ["stock-summary-products"]);
  invalidateAll(qc, ["stock-summary-stock"]);
  invalidateAll(qc, ["stock-summary-warehouses"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  invalidateAll(qc, ["analytics"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-history-sales-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-sales"]);
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"], true);
    invalidateAll(qc, ["mobile-products-for-sale"], true);
    invalidateAll(qc, ["mobile-inventory"], true);
    invalidateAll(qc, ["mobile-agent-pending-orders"]);
  }
  if (options?.saleId) {
    invalidateAll(qc, ["sale-return-detail", options.saleId]);
  }
}

export function afterSaleEdited(qc: QueryClient, options?: { isMobile?: boolean }) {
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["sale-items"]);
  invalidateAll(qc, ["staff-stock"], true);
  invalidateAll(qc, ["product-stock"], true);
  invalidateAll(qc, ["stock-movements"], true);
  invalidateAll(qc, ["agent-stock"], true);
  invalidateAll(qc, ["agent-stock-holdings"], true);
  invalidateAll(qc, ["warehouse-stock"], true);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["analytics"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-history-sales-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-sales"]);
    invalidateAll(qc, ["mobile-agent-sales-today"]);
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"], true);
    invalidateAll(qc, ["mobile-products-for-sale"], true);
    invalidateAll(qc, ["mobile-inventory"], true);
  }
}

export function afterSaleCancelled(qc: QueryClient, options?: { isMobile?: boolean }) {
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["staff-stock"], true);
  invalidateAll(qc, ["product-stock"], true);
  invalidateAll(qc, ["stock-movements"], true);
  invalidateAll(qc, ["agent-stock"], true);
  invalidateAll(qc, ["agent-stock-holdings"], true);
  invalidateAll(qc, ["analytics"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-recent-activity"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"], true);
    invalidateAll(qc, ["mobile-products-for-sale"], true);
    invalidateAll(qc, ["mobile-inventory"], true);
  }
}

export function afterPaymentReturned(qc: QueryClient, options?: { isMobile?: boolean }) {
  invalidateAll(qc, ["transactions"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["customer-balances"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["analytics"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-transactions"]);
    invalidateAll(qc, ["mobile-recent-activity"]);
    invalidateAll(qc, ["mobile-agent-tx-today"]);
  }
}
