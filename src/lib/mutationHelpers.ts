import { QueryClient } from "@tanstack/react-query";
import { broadcastMutation } from "@/hooks/useRealtimeSync";

const FORCE = { refetchType: 'all' as const };

function invalidateAll(qc: QueryClient, key: string[]) {
  qc.invalidateQueries({ queryKey: key, exact: false, refetchType: "all" });
  // Always aggressively refetch so every screen shows the latest data immediately.
  qc.refetchQueries({ queryKey: key, exact: false, type: "all" });
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
    // Background invalidation — fire and forget (keeps UI responsive)
    invalidateAll(qc, ["store-outstanding", options.storeId]);
    invalidateAll(qc, ["store-sales-balance", options.storeId]);
    invalidateAll(qc, ["store-txn-balance", options.storeId]);
    invalidateAll(qc, ["store-adjustments-balance", options.storeId]);
  }
  invalidateAll(qc, ["staff-stock"]);
  invalidateAll(qc, ["product-stock"]);
  invalidateAll(qc, ["stock-movements"]);
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["mobile-pending-orders-for-store"]);
  invalidateAll(qc, ["agent-stock"]);
  invalidateAll(qc, ["agent-stock-holdings"]);
  invalidateAll(qc, ["agent-stock-requests"]);
  invalidateAll(qc, ["agent-stock-history"]);
  invalidateAll(qc, ["agent-dashboard"]);
  invalidateAll(qc, ["stock-summary"]);
  invalidateAll(qc, ["stock-summary-products"]);
  invalidateAll(qc, ["stock-summary-stock"]);
  invalidateAll(qc, ["stock-summary-warehouses"]);
  invalidateAll(qc, ["warehouse-stock"]);
  invalidateAll(qc, ["staff-stock-by-warehouse"]);
  invalidateAll(qc, ["inventory"]);
  invalidateAll(qc, ["inventory-pending-returns"]);
  invalidateAll(qc, ["inventory-timeline-sales"]);
  invalidateAll(qc, ["inventory-timeline-purchases"]);
  invalidateAll(qc, ["inventory-timeline-sale-returns"]);
  invalidateAll(qc, ["inventory-timeline-purchase-returns"]);
  invalidateAll(qc, ["stock-transfers"]);
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
    invalidateAll(qc, ["mobile-agent-stock-holdings"]);
    invalidateAll(qc, ["mobile-products-for-sale"]);
    invalidateAll(qc, ["mobile-products"]);
    invalidateAll(qc, ["mobile-inventory"]);
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-history-sales-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-sales"]);
    invalidateAll(qc, ["mobile-agent-pending-orders"]);
    invalidateAll(qc, ["operator-stock"]);
  }
  if (options?.storeId) {
    invalidateAll(qc, ["sale-items-for-store", options.storeId]);
  }
  // Inform every other tab / window that sales changed
  broadcastMutation("sales", { storeId: options?.storeId, isMobile: options?.isMobile });
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
    // Background invalidation — fire and forget (keeps UI responsive)
    invalidateAll(qc, ["store-outstanding", options.storeId]);
    invalidateAll(qc, ["store-sales-balance", options.storeId]);
    invalidateAll(qc, ["store-txn-balance", options.storeId]);
    invalidateAll(qc, ["store-adjustments-balance", options.storeId]);
  }
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-agent-tx-today"]);
    invalidateAll(qc, ["mobile-transactions"]);
    invalidateAll(qc, ["mobile-history-transactions-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-transactions"]);
  }
  broadcastMutation("transactions", { storeId: options?.storeId, isMobile: options?.isMobile });
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
  }
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["pending-orders-for-store"]);
  invalidateAll(qc, ["staff-stock"]);
  invalidateAll(qc, ["product-stock"]);
  invalidateAll(qc, ["stock-movements"]);
  invalidateAll(qc, ["agent-stock-holdings"]);
  invalidateAll(qc, ["warehouse-stock"]);
  invalidateAll(qc, ["inventory-pending-returns"]);
  invalidateAll(qc, ["inventory-timeline-sales"]);
  invalidateAll(qc, ["inventory-timeline-purchases"]);
  invalidateAll(qc, ["inventory-timeline-sale-returns"]);
  invalidateAll(qc, ["inventory-timeline-purchase-returns"]);
  invalidateAll(qc, ["balance-adjustments"]);
  invalidateAll(qc, ["inventory"]);
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
    invalidateAll(qc, ["mobile-agent-stock-holdings"]);
    invalidateAll(qc, ["mobile-products-for-sale"]);
    invalidateAll(qc, ["mobile-inventory"]);
    invalidateAll(qc, ["mobile-agent-pending-orders"]);
  }
  if (options?.saleId) {
    invalidateAll(qc, ["sale-return-detail", options.saleId]);
  }
  broadcastMutation("sale_returns", { saleId: options?.saleId, storeId: options?.storeId, isMobile: options?.isMobile });
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
  }
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["sale-items"]);
  invalidateAll(qc, ["staff-stock"]);
  invalidateAll(qc, ["product-stock"]);
  invalidateAll(qc, ["stock-movements"]);
  invalidateAll(qc, ["agent-stock"]);
  invalidateAll(qc, ["agent-stock-holdings"]);
  invalidateAll(qc, ["warehouse-stock"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["analytics"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-history-sales-timeline"]);
    invalidateAll(qc, ["mobile-history-balance-sales"]);
    invalidateAll(qc, ["mobile-agent-sales-today"]);
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"]);
    invalidateAll(qc, ["mobile-products-for-sale"]);
    invalidateAll(qc, ["mobile-inventory"]);
  }
  broadcastMutation("sales", { storeId: options?.storeId, isMobile: options?.isMobile, action: "edit" });
}

export function afterSaleCancelled(qc: QueryClient, options?: { isMobile?: boolean; storeId?: string }) {
  // Do NOT force an eager refetch on sales — it can hit a stale read-replica
  // and overwrite optimistic updates before the write has replicated.
  // The useRealtimeSync hook already subscribes to DB changes and will safely
  // invalidate / mark stale so active observers refetch on their next tick.
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
  }
  invalidateAll(qc, ["orders"]);
  invalidateAll(qc, ["staff-stock"]);
  invalidateAll(qc, ["product-stock"]);
  invalidateAll(qc, ["stock-movements"]);
  invalidateAll(qc, ["agent-stock"]);
  invalidateAll(qc, ["agent-stock-holdings"]);
  invalidateAll(qc, ["analytics"]);
  invalidateAll(qc, ["super-admin-dashboard-stats"]);
  invalidateAll(qc, ["manager-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-sales"]);
    invalidateAll(qc, ["mobile-recent-activity"]);
    invalidateAll(qc, ["mobile-agent-stock-holdings"]);
    invalidateAll(qc, ["mobile-products-for-sale"]);
    invalidateAll(qc, ["mobile-inventory"]);
  }
  broadcastMutation("sales", { storeId: options?.storeId, isMobile: options?.isMobile, action: "cancel" });
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
  broadcastMutation("payment_returns", { isMobile: options?.isMobile });
}

export function afterHandoverChanged(qc: QueryClient, options?: { isMobile?: boolean; userId?: string }) {
  invalidateAll(qc, ["handovers"]);
  invalidateAll(qc, ["agent-cash-holding"]);
  invalidateAll(qc, ["user-holding-balance"]);
  invalidateAll(qc, ["all-staff-balances"]);
  invalidateAll(qc, ["user-sales-totals"]);
  invalidateAll(qc, ["user-transaction-totals"]);
  invalidateAll(qc, ["user-daily-balance"]);
  invalidateAll(qc, ["finalizer-account"]);
  invalidateAll(qc, ["finalizer-holdings"]);
  invalidateAll(qc, ["income-entries"]);
  invalidateAll(qc, ["stores"]);
  invalidateAll(qc, ["agent-dashboard"]);
  invalidateAll(qc, ["mobile-admin-dashboard"]);
  if (options?.userId) {
    invalidateAll(qc, ["user-handover-history", options.userId]);
    invalidateAll(qc, ["user-cash-summary", options.userId]);
  }
  if (options?.isMobile) {
    invalidateAll(qc, ["mobile-agent-tx-today"]);
    invalidateAll(qc, ["mobile-agent-sales-today"]);
  }
  broadcastMutation("handovers", { userId: options?.userId, isMobile: options?.isMobile });
}
