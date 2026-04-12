import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Subscribes to Supabase Realtime changes on relevant tables per role
 * and invalidates the relevant React Query caches automatically.
 * Optimized: each role only subscribes to tables they actually need.
 */

// Core tables needed by most roles
const CORE_TABLES = [
  "sales", "sale_items", "transactions", "orders", "order_items",
  "stores", "customers", "handovers", "handover_snapshots",
];

// Role-specific table subscriptions
const ROLE_TABLE_MAP: Record<string, string[]> = {
  super_admin: [
    // Super admin needs everything
    "sales", "sale_items", "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products",
    "customers", "products", "routes", "route_sessions", "store_visits",
    "handovers", "handover_snapshots", "expense_claims",
    "balance_adjustments", "activity_logs", "user_roles", "profiles",
    "agent_routes", "agent_store_types",
    "product_stock", "stock_movements", "staff_stock", "stock_transfers", "warehouses",
  ],
  manager: [
    // Manager needs most operational tables
    "sales", "sale_items", "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products",
    "customers", "products", "routes", "route_sessions", "store_visits",
    "handovers", "handover_snapshots", "expense_claims",
    "balance_adjustments", "activity_logs", "user_roles", "profiles",
    "agent_routes", "agent_store_types",
    "product_stock", "stock_movements", "staff_stock", "stock_transfers", "warehouses",
  ],
  agent: [
    // Agent only needs their operational data
    "sales", "sale_items", "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products",
    "customers", "products", "routes", "route_sessions", "store_visits",
    "handovers", "handover_snapshots", "expense_claims",
    "agent_routes", "agent_store_types", "profiles",
  ],
  marketer: [
    // Marketer needs customer and order data
    "orders", "order_items", "stores", "store_type_products",
    "customers", "products", "routes", "route_sessions",
    "transactions",
    "agent_store_types", "profiles",
  ],
  pos: [
    // POS only needs sales and their own data
    "sales", "sale_items", "stores", "store_type_products",
    "products", "handovers", "profiles",
  ],
  customer: [
    // Customer only needs their own data
    "orders", "order_items", "stores", "customers", "profiles",
  ],
};

// Query key mappings for each table
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

type RealtimeSubscriber = {
  qc: QueryClient;
  isAdmin: boolean;
  userId?: string | null;
  role: string | null;
};

// Get tables to subscribe based on role
function getTablesForRole(role: string | null): string[] {
  if (!role) return [];
  return ROLE_TABLE_MAP[role] || [];
}

let sharedChannel: any | null = null;
const subscribers = new Map<symbol, RealtimeSubscriber>();

function shouldSkipForSubscriber(sub: RealtimeSubscriber, table: string, payload: any) {
  if (sub.isAdmin) return false;

  const userId = sub.userId;
  if (!userId) return true;

  if (table === "sales" || table === "transactions") {
    const recordedBy = payload.new?.recorded_by ?? payload.old?.recorded_by;
    if (recordedBy && recordedBy !== userId) return true;
  }

  if (table === "handovers") {
    const sender = payload.new?.user_id ?? payload.old?.user_id;
    const receiver = payload.new?.handed_to ?? payload.old?.handed_to;
    if (sender !== userId && receiver !== userId) return true;
  }

  if (table === "expense_claims") {
    const claimOwner = payload.new?.user_id ?? payload.old?.user_id;
    if (claimOwner && claimOwner !== userId) return true;
  }

  return false;
}

function handleRealtimePayload(table: string, payload: any) {
  const keys = TABLE_QUERY_MAP[table] || [];
  if (keys.length === 0) return;

  subscribers.forEach((sub) => {
    // Skip if table not relevant for this subscriber's role
    const roleTables = getTablesForRole(sub.role);
    if (!roleTables.includes(table)) return;
    
    if (shouldSkipForSubscriber(sub, table, payload)) return;
    keys.forEach((key) => {
      sub.qc.invalidateQueries({ queryKey: [key] });
    });
  });
}

function ensureSharedChannel(role: string | null) {
  if (sharedChannel) return;

  // Subscribe only to tables relevant for this role
  const tables = getTablesForRole(role);
  if (tables.length === 0) return;

  sharedChannel = supabase.channel("global-realtime-sync");

  tables.forEach((table) => {
    sharedChannel = sharedChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload: any) => handleRealtimePayload(table, payload)
    );
  });

  sharedChannel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] Subscribed to tables:', tables);
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[Realtime] Channel error');
    }
  });
}

function maybeTearDownSharedChannel() {
  if (subscribers.size > 0) return;
  if (!sharedChannel) return;
  supabase.removeChannel(sharedChannel);
  sharedChannel = null;
}

export function useRealtimeSync() {
  const qc = useQueryClient();
  const { role, user } = useAuth();

  const isStaff = role && STAFF_ROLES.includes(role);
  const isAdmin = role === "super_admin" || role === "manager";

  useEffect(() => {
    if (!isStaff || !role) return;

    const subscriberId = Symbol("realtime-subscriber");
    subscribers.set(subscriberId, { qc, isAdmin, userId: user?.id, role });
    ensureSharedChannel(role);

    return () => {
      subscribers.delete(subscriberId);
      maybeTearDownSharedChannel();
    };
  }, [qc, isStaff, isAdmin, user?.id, role]);
}
