import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logDebug } from "@/lib/logger";

let CapApp: typeof import("@capacitor/app").App | null = null;

/**
 * Capacitor app-state hook.
 *
 * When the native app returns to the foreground (resume) we:
 * 1. Broad-invalidate the most commonly stale domains so every screen
 *    automatically fetches fresh data from the server.
 *
 * This hook is safe to use on web (no-op) and guards against the
 * plug-in not being loaded yet.
 */
export function useCapacitorAppState() {
  const qc = useQueryClient();
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    const setup = async () => {
      try {
        // Lazy-load the plugin so this file never throws at import time
        const { App } = await import("@capacitor/app");
        CapApp = App;

        if (cancelled) return;

        const listener = await CapApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;

          logDebug("[AppState] App resumed — invalidating core queries", {
            context: "useCapacitorAppState",
          });

          if (activeTimer.current) clearTimeout(activeTimer.current);
          activeTimer.current = setTimeout(() => {
            if (cancelled) return;

            const coreKeys = [
              "sales", "transactions", "orders", "stores", "customers",
              "inventory", "product-stock", "staff-stock", "stock-movements",
              "handovers", "expenses",
              // Dashboards
              "agent-dashboard-stats", "manager-dashboard", "agent-dashboard",
              "customer-dashboard", "pos-dashboard", "marketer-dashboard", "operator-dashboard",
              "super-admin-dashboard-stats", "mobile-admin-dashboard",
              // Mobile tabs
              "mobile-agent-sales-today", "mobile-agent-tx-today",
              "mobile-sales", "mobile-transactions",
              "mobile-history-sales-timeline", "mobile-history-transactions-timeline",
              "mobile-history-balance-sales", "mobile-history-balance-transactions",
              "mobile-agent-stock-holdings", "mobile-products-for-sale", "mobile-inventory",
              "mobile-customer-sales", "mobile-customer-ledger-self", "mobile-customer-orders",
              // Lists
              "my-sales", "my-orders", "pending-orders-for-store",
              "store-transactions", "store-sales", "store-visits",
              "staff-directory", "profiles", "all-staff-balances",
            ];

            coreKeys.forEach((key) => {
              qc.invalidateQueries({ queryKey: [key] });
              qc.refetchQueries({ queryKey: [key], exact: false, type: "all" });
            });

            window.dispatchEvent(new CustomEvent("app-resumed"));
          }, 300);
        });

        removeListener = () => listener.remove();
      } catch (err) {
        // Plugin not available (web build or Capacitor not ready)
        logDebug("[AppState] Capacitor App plugin unavailable", {
          context: "useCapacitorAppState",
          error: String(err),
        });
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (activeTimer.current) clearTimeout(activeTimer.current);
      if (removeListener) removeListener();
    };
  }, [qc]);
}
