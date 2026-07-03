import { QueryClient } from "@tanstack/react-query";

const FORCE = { refetchType: 'all' as const };

function invalidateAll(qc: QueryClient, key: string[], force?: boolean) {
  qc.invalidateQueries({ queryKey: key, exact: false, ...(force ? FORCE : undefined) });
}

export function afterSaleSaved(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string; saleData?: any }) {
  // Optimistically add the sale to the cache before invalidation triggers a refetch
  if (options?.saleData) {
    const saleKey = ["sales"];
    const current = qc.getQueryData<any[]>(saleKey);
    if (current && Array.isArray(current)) {
      qc.setQueryData(saleKey, [options.saleData, ...current]);
    }
    if (options.storeId) {
      const storeSaleKey = ["store-sales", options.storeId];
      const storeCurrent = qc.getQueryData<any[]>(storeSaleKey);
      if (storeCurrent && Array.isArray(storeCurrent)) {
        qc.setQueryData(storeSaleKey, [options.saleData, ...storeCurrent]);
      }
    }
  }
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["stores-for-sale"]);
  invalidateAll(qc, ["stores-for-txn"]);
  if (options?.storeId) {
    invalidateAll(qc, ["store", options.storeId]);
    invalidateAll(qc, ["store-sales", options.storeId]);
    invalidateAll(qc, ["store-transactions", options.storeId]);
    invalidateAll(qc, ["store-orders", options.storeId]);
    invalidateAll(qc, ["store-visits", options.storeId]);
    invalidateAll(qc, ["balance-adjustments", options.storeId]);
    invalidateAll(qc, ["store-payment-returns", options.storeId]);
    invalidateAll(qc, ["store-qr-codes", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-sales", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-transactions", options.storeId]);
  }
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
  if (options?.storeId) {
    invalidateAll(qc, ["store", options.storeId]);
    invalidateAll(qc, ["store-sales", options.storeId]);
    invalidateAll(qc, ["store-transactions", options.storeId]);
    invalidateAll(qc, ["store-orders", options.storeId]);
    invalidateAll(qc, ["store-visits", options.storeId]);
    invalidateAll(qc, ["balance-adjustments", options.storeId]);
    invalidateAll(qc, ["store-payment-returns", options.storeId]);
    invalidateAll(qc, ["store-qr-codes", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-sales", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-transactions", options.storeId]);
  }
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-agent-tx-today"]);
    invalidateAll(qc, ["mobile-transactions"]);
    invalidateAll(qc, ["mobile-history-transactions-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-transactions"]);
  }
}

export function afterSaleReturned(qc: QueryClient, options?: { isMobile?: boolean; saleId?: string; storeId?: string; returnData?: any }) {
  // Optimistically update the sale's outstanding and return status in the cache
  if (options?.saleId) {
    const updateSaleInCache = (oldData: any[] | undefined) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((sale: any) => {
        if (sale.id === options.saleId) {
          return { ...sale, outstanding_amount: 0, is_fully_returned: true };
        }
        return sale;
      });
    };
    const salesKey = ["sales"];
    const currentSales = qc.getQueryData<any[]>(salesKey);
    if (currentSales) qc.setQueryData(salesKey, updateSaleInCache(currentSales));
    if (options.storeId) {
      const storeSalesKey = ["store-sales", options.storeId];
      const storeCurrent = qc.getQueryData<any[]>(storeSalesKey);
      if (storeCurrent) qc.setQueryData(storeSalesKey, updateSaleInCache(storeCurrent));
    }
  }
  invalidateAll(qc, ["sale-returns"]);
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["stores-for-sale"]);
  invalidateAll(qc, ["stores-for-txn"]);
  if (options?.storeId) {
    invalidateAll(qc, ["store", options.storeId]);
    invalidateAll(qc, ["store-sales", options.storeId]);
    invalidateAll(qc, ["store-transactions", options.storeId]);
    invalidateAll(qc, ["store-orders", options.storeId]);
    invalidateAll(qc, ["store-visits", options.storeId]);
    invalidateAll(qc, ["balance-adjustments", options.storeId]);
    invalidateAll(qc, ["store-payment-returns", options.storeId]);
    invalidateAll(qc, ["store-qr-codes", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-sales", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-transactions", options.storeId]);
  }
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

export function afterSaleEdited(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["stores-for-sale"]);
  invalidateAll(qc, ["stores-for-txn"]);
  if (options?.storeId) {
    invalidateAll(qc, ["store", options.storeId]);
    invalidateAll(qc, ["store-sales", options.storeId]);
    invalidateAll(qc, ["store-transactions", options.storeId]);
    invalidateAll(qc, ["store-orders", options.storeId]);
    invalidateAll(qc, ["store-visits", options.storeId]);
    invalidateAll(qc, ["balance-adjustments", options.storeId]);
    invalidateAll(qc, ["store-payment-returns", options.storeId]);
    invalidateAll(qc, ["store-qr-codes", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-sales", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-transactions", options.storeId]);
  }
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

export function afterSaleCancelled(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  // Do NOT force an eager refetch on sales — it can hit a stale read-replica
  // and overwrite optimistic updates before the write has replicated.
  // The useRealtimeSync hook already subscribes to DB changes and will safely
  // invalidate / mark stale so active observers refetch on their next tick.
  invalidateAll(qc, ["sales"]);
  invalidateAll(qc, ["stores"], true);
  invalidateAll(qc, ["stores-for-sale"], true);
  invalidateAll(qc, ["stores-for-txn"], true);
  if (options?.storeId) {
    invalidateAll(qc, ["store", options.storeId]);
    invalidateAll(qc, ["store-sales", options.storeId]);
    invalidateAll(qc, ["store-transactions", options.storeId]);
    invalidateAll(qc, ["store-orders", options.storeId]);
    invalidateAll(qc, ["store-visits", options.storeId]);
    invalidateAll(qc, ["balance-adjustments", options.storeId]);
    invalidateAll(qc, ["store-payment-returns", options.storeId]);
    invalidateAll(qc, ["store-qr-codes", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-sales", options.storeId]);
    invalidateAll(qc, ["mobile-store-ledger-transactions", options.storeId]);
  }
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
    invalidateAll(qc, ["mobile-store-ledger-sales"]);
    invalidateAll(qc, ["mobile-store-ledger-transactions"]);
  }
}
