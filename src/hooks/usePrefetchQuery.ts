import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

// Route to query key mapping for prefetching
const ROUTE_QUERY_KEYS: Record<string, string[]> = {
  "/": ["super-admin-dashboard-stats", "manager-dashboard"],
  "/dashboard": ["super-admin-dashboard-stats", "manager-dashboard"],
  "/sales": ["sales", "my-sales"],
  "/sale-returns": ["sale-returns"],
  "/transactions": ["transactions"],
  "/orders": ["orders", "my-orders"],
  "/handovers": ["handovers"],
  "/customers": ["customers", "customers-list"],
  "/stores": ["stores", "my-stores"],
  "/store-types": ["store-types"],
  "/routes": ["routes", "routes-list"],
  "/inventory": ["inventory", "product-stock"],
  "/inventory/raw-materials": ["raw-materials"],
  "/inventory/boms": ["boms"],
  "/production": ["production_log"],
  "/vendors": ["vendors"],
  "/purchases": ["purchases"],
  "/vendor-payments": ["vendor-payments"],
  "/reports": ["dashboard-stats"],
  "/analytics": ["analytics-enhanced"],
  "/staff": ["staff-directory"],
  "/hr/staff": ["workers"],
  "/hr/payroll": ["payrolls"],
  "/attendance": ["attendance-records"],
  "/invoices": ["invoices"],
  "/expenses": ["expenses"],
  "/settings": ["company-settings"],
  "/admin": ["staff-directory", "company-settings"],
  "/stock-transfers": ["stock-transfers"],
  "/activity": ["activity-logs"],
};

export function usePrefetchOnHover() {
  const qc = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetchRoute = useCallback(
    (pathname: string) => {
      if (prefetchedRef.current.has(pathname)) return;

      const queryKeys = ROUTE_QUERY_KEYS[pathname];
      if (!queryKeys?.length) return;

      queryKeys.forEach((key) => {
        qc.prefetchQuery({
          queryKey: [key],
          staleTime: 0,
        });
      });

      prefetchedRef.current.add(pathname);
    },
    [qc]
  );

  const getPrefetchHandlers = useCallback(
    (pathname: string) => ({
      onMouseEnter: () => prefetchRoute(pathname),
      onFocus: () => prefetchRoute(pathname),
    }),
    [prefetchRoute]
  );

  return { prefetchRoute, getPrefetchHandlers };
}

// Hook for BottomNav tabs
export function useTabPrefetch() {
  const qc = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const TAB_QUERY_KEYS: Record<string, string[]> = {
    home: ["agent-dashboard-stats", "mobile-agent-sales-today", "mobile-agent-tx-today"],
    routes: ["routes", "mobile-agent-routes", "mobile-active-session"],
    scan: ["stores", "products"],
    customers: ["stores", "customers", "mobile-marketer-stores"],
    history: ["mobile-history-sales-timeline", "mobile-history-transactions-timeline"],
    orders: ["mobile-agent-all-orders", "mobile-marketer-orders", "mobile-customer-orders"],
    record: ["stores", "products", "store-pricing"],
    sales: ["mobile-agent-sales-today", "mobile-customer-sales"],
    transactions: ["mobile-agent-tx-today", "mobile-customer-ledger-self"],
    products: ["mobile-products-for-sale", "products"],
    profile: ["profiles"],
  };

  const prefetchTab = useCallback(
    (tab: string) => {
      if (prefetchedRef.current.has(tab)) return;

      const queryKeys = TAB_QUERY_KEYS[tab];
      if (!queryKeys?.length) return;

      queryKeys.forEach((key) => {
        qc.prefetchQuery({
          queryKey: [key],
          staleTime: 0,
        });
      });

      prefetchedRef.current.add(tab);
    },
    [qc]
  );

  const getPrefetchHandlers = useCallback(
    (tab: string) => ({
      onMouseEnter: () => prefetchTab(tab),
      onFocus: () => prefetchTab(tab),
      onTouchStart: () => prefetchTab(tab), // Mobile
    }),
    [prefetchTab]
  );

  return { prefetchTab, getPrefetchHandlers };
}
