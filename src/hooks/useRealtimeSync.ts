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
  sales: ["sales", "dashboard", "agent-dashboard", "marketer-dashboard", "pos-dashboard"],
  sale_items: ["sales", "sale-items"],
  orders: ["orders", "dashboard", "marketer-dashboard"],
  order_items: ["orders", "order-items"],
  transactions: ["transactions", "dashboard", "agent-dashboard", "marketer-dashboard"],
  stores: ["stores", "dashboard", "store-detail"],
  store_pricing: ["store-pricing", "stores"],
  store_type_pricing: ["store-type-pricing"],
  store_type_products: ["store-type-products"],
  store_visits: ["session-visits", "store-visits"],
  handovers: ["handovers", "dashboard", "agent-dashboard"],
  handover_snapshots: ["handover-snapshots"],
  customers: ["customers", "dashboard", "customer-detail"],
  products: ["products", "products-active"],
  routes: ["routes", "routes-list-active"],
  route_sessions: ["active-route-session", "route-sessions"],
  balance_adjustments: ["balance-adjustments", "stores"],
  activity_logs: ["activity-logs"],
  user_roles: ["user-roles"],
  profiles: ["profiles", "staff-profiles"],
};

const STAFF_ROLES = ["super_admin", "manager", "agent", "marketer", "pos"];

export function useRealtimeSync() {
  const qc = useQueryClient();
  const { role } = useAuth();

  const isStaff = role && STAFF_ROLES.includes(role);

  useEffect(() => {
    if (!isStaff) return;

    const tables = Object.keys(TABLE_QUERY_MAP);

    let channel = supabase.channel("global-realtime-sync");

    tables.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
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
  }, [qc, isStaff]);
}
