import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on key tables
 * and invalidates the relevant React Query caches automatically.
 * Mount once in AppLayout so every page benefits.
 */

const TABLE_QUERY_MAP: Record<string, string[][]> = {
  sales: [["sales"], ["dashboard"], ["agent-dashboard"], ["marketer-dashboard"], ["pos-dashboard"]],
  orders: [["orders"], ["dashboard"], ["marketer-dashboard"]],
  transactions: [["transactions"], ["dashboard"], ["agent-dashboard"], ["marketer-dashboard"]],
  stores: [["stores"], ["dashboard"]],
  handovers: [["handovers"], ["dashboard"], ["agent-dashboard"]],
  customers: [["customers"], ["dashboard"]],
};

export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("global-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => invalidate("sales")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => invalidate("orders")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => invalidate("transactions")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stores" },
        () => invalidate("stores")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "handovers" },
        () => invalidate("handovers")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => invalidate("customers")
      )
      .subscribe();

    function invalidate(table: string) {
      const keys = TABLE_QUERY_MAP[table] || [];
      keys.forEach((key) => {
        qc.invalidateQueries({ queryKey: key });
      });
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
