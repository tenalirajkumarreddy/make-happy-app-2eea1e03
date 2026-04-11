import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Subscribes to Supabase Realtime changes on all key tables
 * and invalidates the relevant React Query caches automatically.
 * Only activates for staff roles (not customers) to limit connections.
 */

const TABLE_QUERY_MAP: Record<string, string[]> = {
  sales: ["sales", "dashboard-stats", "agent-dashboard-stats", "mobile-marketer-dashboard", "mobile-pos-dashboard", "mobile-agent-sales-today", "mobile-history-balance-sales", "mobile-history-sales-timeline", "mobile-customer-sales", "mobile-customer-ledger-sales", "mobile-customer-home-sales"],
  sale_items: ["sales", "sale-items"],
  orders: ["orders", "dashboard-stats", "mobile-marketer-dashboard", "store-orders", "mobile-marketer-orders", "mobile-customer-orders", "mobile-customer-orders-self", "mobile-customer-orders-stores", "mobile-agent-all-orders", "mobile-route-pending-orders"],
  order_items: ["orders", "order-items"],
  transactions: ["transactions", "dashboard-stats", "agent-dashboard-stats", "mobile-marketer-dashboard", "mobile-pos-dashboard", "store-transactions", "customer-transactions", "mobile-agent-tx-today", "mobile-history-transactions-timeline", "mobile-customer-ledger-self", "mobile-customer-ledger-stores", "mobile-customer-ledger-payments"],
  stores: ["stores", "dashboard-stats", "store", "customer-stores", "mobile-marketer-stores", "mobile-customer-home-stores", "mobile-customer-profile-stores", "mobile-store-profile"],
  store_pricing: ["store-pricing", "store-pricing-tab", "stores", "mobile-store-pricing"],
  store_type_pricing: ["store-type-pricing-tab", "mobile-store-type-pricing"],
  store_type_products: ["store-type-products", "store-products-tab", "mobile-store-products", "mobile-products-for-sale"],
  store_visits: ["session-visits", "store-visits"],
  handovers: ["handovers", "dashboard-stats", "agent-dashboard-stats"],
  handover_snapshots: ["handover-snapshots"],
  expense_claims: ["expense-claims", "handovers", "dashboard-stats", "agent-dashboard-stats"],
  customers: ["customers", "dashboard-stats", "customer", "customers-list", "customers-for-orders", "customers-for-invoice", "customers-kyc-for-sale", "mobile-marketer-order-customers", "mobile-customers-kyc-sale"],
  products: ["products", "products-active", "store-products-tab", "mobile-products", "mobile-marketer-order-products"],
  routes: ["routes", "routes-list-active", "all-routes", "routes-for-edit", "mobile-marketer-routes", "mobile-agent-routes"],
  route_sessions: ["active-route-session", "route-sessions"],
  balance_adjustments: ["balance-adjustments", "stores"],
  activity_logs: ["activity-logs"],
  user_roles: ["user-roles", "mobile-staff-users", "mobile-staff-for-behalf-sale", "mobile-staff-for-behalf-payment"],
  profiles: ["profiles", "staff-profiles"],
  agent_routes: ["route-access-matrix", "routes", "mobile-agent-routes"],
  agent_store_types: ["store-type-access-matrix", "route-access-matrix", "mobile-marketer-store-types", "mobile-store-types-credit"],
  // Inventory tables
  product_stock: ["inventory", "stock-movements"],
  stock_movements: ["stock-movements", "inventory"],
  staff_stock: ["staff-stock"],
  stock_transfers: ["stock-transfers", "staff-stock", "inventory"],
  warehouses: ["warehouses"],
};

const STAFF_ROLES = ["super_admin", "manager", "agent", "marketer", "pos"];

export function useRealtimeSync() {
  const qc = useQueryClient();
  const { role, user } = useAuth();

  const isStaff = role && STAFF_ROLES.includes(role);
  const isAdmin = role === "super_admin" || role === "manager";

  useEffect(() => {
    if (!isStaff) return;

    const tables = Object.keys(TABLE_QUERY_MAP);

    const channelName = `global-realtime-sync-${Math.random().toString(36).substring(2, 9)}`;
    let channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: any) => {
          // For non-admins, skip invalidation if the record belongs to another user
          if (!isAdmin) {
            if (table === "sales" || table === "transactions") {
              const recordedBy = payload.new?.recorded_by ?? payload.old?.recorded_by;
              if (recordedBy && recordedBy !== user?.id) return;
            }
            if (table === "handovers") {
              const sender = payload.new?.user_id ?? payload.old?.user_id;
              const receiver = payload.new?.handed_to ?? payload.old?.handed_to;
              if (sender !== user?.id && receiver !== user?.id) return;
            }
            if (table === "expense_claims") {
              const claimOwner = payload.new?.user_id ?? payload.old?.user_id;
              if (claimOwner && claimOwner !== user?.id) return;
            }
          }
          const keys = TABLE_QUERY_MAP[table] || [];
          keys.forEach((key) => {
            qc.invalidateQueries({ queryKey: [key] });
          });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, isStaff, isAdmin, user?.id]);
}
