import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";

// ── Shared query key groups (reused across tables to avoid duplication) ──────
const DASHBOARD = [
  "dashboard-stats", "agent-dashboard-stats", "manager-dashboard",
  "agent-dashboard", "customer-dashboard", "default-dashboard",
  "super-admin-dashboard-stats", "pos-dashboard", "marketer-dashboard",
  "operator-dashboard",
];
const MOBILE_SALES = [
  "mobile-agent-sales-today", "mobile-sales",
  "mobile-history-balance-sales", "mobile-history-sales-timeline",
  "mobile-customer-sales", "mobile-customer-sales-self",
  "mobile-customer-ledger-sales", "mobile-customer-home-sales",
  "mobile-pos-dashboard", "mobile-marketer-dashboard",
];
const MOBILE_TX = [
  "mobile-agent-tx-today", "mobile-transactions",
  "mobile-history-transactions-timeline",
  "mobile-customer-ledger-self", "mobile-customer-ledger-stores",
  "mobile-customer-ledger-payments", "mobile-marketer-dashboard",
  "mobile-pos-dashboard",
  "mobile-history-balance-transactions",
];
const MOBILE_ORDERS = [
  "mobile-agent-all-orders", "mobile-agent-pending-orders",
  "mobile-marketer-orders", "mobile-customer-orders",
  "mobile-customer-orders-self", "mobile-customer-orders-stores",
  "mobile-customer-home-orders", "mobile-orders",
  "mobile-route-pending-orders", "mobile-marketer-dashboard",
];
const PL = [
  "itemwise-pl-sales", "itemwise-pl-purchases", "itemwise-pl-returns",
  "pl-sales", "pl-purchases", "pl-returns", "pl-expenses", "pl-sale-items",
];
const DAYBOOK = [
  "daybook-sales", "daybook-transactions", "daybook-expenses",
  "daybook-purchases", "daybook-vendor-payments",
  "daybook-sale-returns", "daybook-purchase-returns",
];
const PAYMENT_FLOW = [
  "payment-flow-customer", "payment-flow-expenses",
  "payment-flow-vendor", "payment-flow-worker",
];
const ANALYTICS = ["analytics-enhanced", "smart-insights"];
const INVENTORY = ["inventory", "mobile-inventory", "warehouse-stock"];
const INVENTORY_TIMELINE = [
  "inventory-timeline-sales", "inventory-timeline-purchases",
  "inventory-timeline-sale-returns", "inventory-timeline-purchase-returns",
];

// ── Table → Query Key Mapping ────────────────────────────────────────────────
// Each table maps to the query keys it should invalidate when changed.
// When adding a new query, include its first segment here if it reads from a DB
// table listed below.
const TABLE_QUERY_MAP: Record<string, string[]> = {
  sales: [
    "sales", "my-sales", ...DASHBOARD, ...MOBILE_SALES, ...ANALYTICS,
    "daily-report", "daybook-sales", "sales-report",
    ...PL, "sale-for-invoice", "statement-sales", "user-sales-totals",
    ...INVENTORY_TIMELINE, "mobile-recent-activity", "mobile-admin-ops",
  ],
  sale_items: [
    "sale-items", "sale-items-detail", "sale-items-for-invoice",
    "sale-items-for-return", "sales", "pl-sale-items",
    "itemwise-pl-sales", "daybook-sales",
  ],
  sale_returns: [
    "sale-returns", "my-return-requests", "my-reviewed-returns",
    "sales-return-report", "sales-return-report-sales",
    "pending-returns", "return-stats", "return-details",
    "inventory-timeline-sale-returns", "daybook-sale-returns",
    "mobile-history-sales-timeline",
    ...PL,
  ],
  sale_return_items: ["sale-returns", "return-details", "pl-returns"],
  transactions: [
    "transactions", "customer-transactions", "store-transactions",
    ...DASHBOARD, ...MOBILE_TX, ...ANALYTICS,
    "daybook-transactions", "statement-transactions", "user-transaction-totals",
    "my-ledger-txns", ...PAYMENT_FLOW,
  ],
  payment_returns: [
    "transactions", ...DASHBOARD, ...MOBILE_TX, ...ANALYTICS,
  ],
  orders: [
    "orders", "my-orders", "my-orders-count", "store-orders",
    ...DASHBOARD, ...MOBILE_ORDERS,
    "order-report", "pending-orders-for-store", "mobile-pending-orders-for-store",
    "pending-order-stores", "pending-orders-map", "routes-for-orders",
    "daybook-sales", "mobile-admin-ops",
  ],
  order_items: ["orders", "order-items", "mobile-marketer-orders"],
  stores: [
    "stores", "store", "my-stores", "my-stores-outstanding",
    "customer-stores", ...DASHBOARD,
    "mobile-marketer-stores", "mobile-marketer-store-profile",
    "mobile-customer-home-stores", "mobile-customer-profile-stores",
    "mobile-store-profile", "mobile-customers-stores",
    "stores-for-sale", "stores-for-txn", "stores-for-order",
    "stores-for-filter-orders", "stores-for-invoice",
    "stores-with-location", "store-qr-codes", "route-stores",
    "routes-with-stores", "statement-customer-stores",
    "mobile-marketer-order-stores",
  ],
  store_pricing: [
    "store-pricing", "store-pricing-tab", "stores",
    "mobile-store-pricing", "price-change-history",
    "all-store-type-pricing",
  ],
  store_type_pricing: [
    "store-type-pricing", "store-type-pricing-tab", "store-type-pricing-for",
    "store-type-pricing-wizard", "all-store-type-pricing",
    "mobile-store-type-pricing",
  ],
  store_type_products: [
    "store-type-products", "store-products-tab", "all-store-type-products",
    "mobile-store-products", "mobile-products-for-sale",
    "all-products-for-sale", "products-for-store",
  ],
  store_types: [
    "store-types", "store-types-all", "store-types-list",
    "store-types-simple", "store-types-settings", "store-types-credit",
    "store-types-for-edit", "store-types-for-map", "store-types-for-orders",
    "store-types-for-txn", "store-types-for-access", "store-types-banners",
    "mobile-store-types", "mobile-store-types-credit",
    "mobile-marketer-store-types",
  ],
  store_visits: [
    "session-visits", "store-visits", "mobile-session-visits",
    "mobile-agent-visits-today", "visited-stores-map", "route-efficiency",
    "mobile-session-visits-marketer",
  ],
  handovers: [
    "handovers", ...DASHBOARD,
    "finalizer-holdings", "finalizer-account",
  ],
  handover_snapshots: ["handover-snapshots", "handovers"],
  handover_requests: ["handovers", "handover-snapshots"],
  expense_claims: [
    "expense-claims", "handovers", ...DASHBOARD,
    "daybook-expenses", "mobile-expense-claims",
  ],
  expenses: [
    "expenses", "daybook-expenses", "pl-expenses",
    "itemwise-pl-purchases", "payment-outstanding-report",
    "payment-flow-expenses",
  ],
  expense_categories: ["expense-categories", "expenses", "expense-categories-mobile"],
  expense_category_access: ["expense-category-access-rules", "expense-categories"],
  customers: [
    "customers", "customers-list", "customers-list-simple",
    "customer", "customer-detail", ...DASHBOARD,
    "customers-for-orders", "customers-for-invoice", "customers-for-txn-filter",
    "customers-kyc-for-sale", "customer-balances", "customer-risk-report",
    "customer-report-customers", "statement-customers",
    "receivables-aging", "mobile-marketer-order-customers",
    "mobile-customers-kyc-sale", "mobile-customer",
    "mobile-customer-self", "mobile-customer-profile",
    "my-customer", "mobile-marketer-followup",
  ],
  kyc_documents: ["customer-kyc"],
  products: [
    "products", "products-active", "all-products", "all-products-for-sale",
    "products-for-invoice", "products-for-store", "products-for-warehouse",
    "products-for-wizard", "lookup-products", "product-categories",
    "product-report", "store-products-tab", "mobile-products",
    "mobile-marketer-order-products", "mobile-products-for-sale",
    "mobile-products-search", "products_finished",
  ],
  product_categories: ["product-categories", "products"],
  routes: [
    "routes", "routes-list", "routes-list-active", "all-routes",
    "routes-for-edit", "routes-for-filter", "routes-for-map",
    "routes-for-orders", "routes-for-txn", "routes-for-access",
    "route-detail", "mobile-marketer-routes", "mobile-agent-routes",
    "mobile-routes-list", "route-access-routes",
  ],
  route_sessions: [
    "active-route-session", "route-sessions", "route-session",
    "mobile-active-session", "active-sessions-map",
    "route-efficiency", "mobile-marketer-session",
  ],
  agent_routes: [
    "route-access-matrix", "routes", "agent-routes",
    "mobile-agent-routes", "route-access-rows",
  ],
  agent_store_types: [
    "store-type-access-matrix", "route-access-matrix",
    "agent-store-types-matrix", "mobile-marketer-store-types",
    "mobile-store-types-credit",
  ],
  balance_adjustments: ["balance-adjustments", "stores", "customer-balances"],
  activity_logs: ["activity-logs", "mobile-recent-activity"],
  user_roles: [
    "user-roles", "all-staff-roles", "all-users",
    "mobile-staff-users", "mobile-staff-for-behalf-sale",
    "mobile-staff-for-behalf-payment", "staff-directory",
    "staff-directory-enriched", "route-access-staff-users",
    "agents-for-assignment", "staff-for-attendance",
    "staff-for-behalf", "staff-for-behalf-txn",
    "staff-transfer-eligible", "staff-for-store-type-matrix",
  ],
  profiles: [
    "profiles", "staff-profiles", "staff-profile",
    "profile-map", "lookup-profiles", "profiles-for-activity",
    "profiles-for-txn", "mobile-profiles", "mobile-profiles-txn",
    "staff-directory", "staff-directory-enriched",
    "user-holding-balance", "all-staff-balances",
    "finalizer-account", "prime-manager-account",
    "mobile-history", "mobile-history-balance",
    "mobile-history-holding-balance",
    ...DASHBOARD,
  ],
  user_permissions: ["all-user-permissions", "my-permissions"],
  // ── Inventory ───────────────────────────────────────────────────────────────
  product_stock: [
    ...INVENTORY, "product-stock", "product-stock-history",
    "stock-summary", "stock-summary-products",
    "stock-summary-stock", "stock-summary-warehouses",
    "warehouse-products", "operator-dashboard", "manager-dashboard",
    "recent-stock-movements", "stock-movement-summary",
    "lookup-warehouses",
  ],
  stock_movements: [
    "stock-movements", "stock-movement-history", "recent-stock-movements",
    "stock-movement-summary", ...INVENTORY,
  ],
  staff_stock: [
    "staff-stock", "staff-stock-by-warehouse",
    "staff-inventory-summary", "agent-stock-holdings",
    "agent-stock-history", "source-stock-transfer",
    ...INVENTORY, "mobile-agent-stock-holdings",
  ],
  stock_transfers: [
    "stock-transfers", "agent-stock-requests",
    "staff-stock", "staff-stock-by-warehouse",
    ...INVENTORY,
    "operator-dashboard", "manager-dashboard", "agent-dashboard",
  ],
  stock_requests: ["agent-stock-requests", "stock-transfers", "operator-dashboard"],
  warehouses: [
    "warehouses", "warehouse", "warehouses-for-invoice",
    "warehouses-transfer", "lookup-warehouses",
    "stock-summary-warehouses", "mobile-warehouses-for-transfer",
  ],
  // ── Finance / Purchases ──────────────────────────────────────────────────────
  purchases: [
    "purchases", "mobile-purchases", "daybook-purchases",
    "purchase-report", ...PL,
    "vendor-purchases", "vendor-report-purchases",
    "inventory-timeline-purchases",
  ],
  purchase_orders: ["purchase_orders", "purchases"],
  purchase_items: ["purchases", "purchase-items-for-return"],
  purchase_returns: [
    "purchase-returns", "purchase-return-report",
    "purchase-return-report-purchases", "purchase-return-detail",
    "purchases-for-return", "vendor-report-returns",
    "inventory-timeline-purchase-returns", "daybook-purchases",
    ...PL,
  ],
  purchase_return_items: ["purchase-returns", "purchase-return-detail"],
  vendors: [
    "vendors", "vendors-list", "vendors-balance",
    "vendors-with-balance", "vendors-with-outstanding",
    "vendor", "vendor-report-vendors", "daybook-vendor-payments",
    "payment-flow-vendor",
  ],
  vendor_payments: [
    "vendor-payments", "vendors", "vendor-report-payments",
    "daybook-vendor-payments", "payment-flow-vendor",
    "vendor-transactions",
  ],
  vendor_transactions: ["vendor-transactions", "vendor-payments"],
  vendor_raw_materials: ["vendor-raw-materials"],
  // ── Fixed costs / Payroll ────────────────────────────────────────────────────
  fixed_costs: ["fixed-costs", "fixed-costs-due-check", "pl-expenses"],
  fixed_cost_payments: ["fixed-costs", "daybook-expenses"],
  income: ["income-entries", "finalizer-account", "prime-manager-account"],
  income_entries: ["income-entries", "finalizer-account", "prime-manager-account"],
  payrolls: ["payrolls", "payroll"],
  payroll_items: ["payrolls", "payroll", "payroll_items"],
  workers: ["workers", "worker-balances", "worker-payments"],
  worker_roles: ["worker_roles", "workers"],
  worker_balances: ["worker-balances", "workers"],
  worker_payments: ["worker-payments", "workers", "payment-flow-worker"],
  shift_rates: ["shift-rates"],
  // ── Attendance ───────────────────────────────────────────────────────────────
  attendance_records: ["attendance-records", "attendance-entries"],
  attendance_entries: ["attendance-entries", "attendance-records", "staff-for-attendance", "mobile-pos-attendance"],
  // ── Invoices ─────────────────────────────────────────────────────────────────
  invoices: ["invoices", "invoice", "uninvoiced-sales", "invoice-items", "mobile-pos-invoices"],
  invoice_items: ["invoices", "invoice"],
  invoice_sales: ["invoices", "uninvoiced-sales"],
  // ── Raw materials / BOM ──────────────────────────────────────────────────────
  raw_materials: [
    "raw-materials", "raw_materials", "raw_materials_list",
    "raw-materials-list", "raw-materials-inventory",
    "unlinked-raw-materials",
  ],
  raw_material_categories: ["raw_material_categories", "raw_material_categories-list"],
  raw_material_stock: ["raw-materials-inventory", "raw-materials"],
  raw_material_adjustments: ["raw-material-adjustments", "raw-materials-inventory"],
  bill_of_materials: ["boms", "bom_summary", "bom_details"],
  // ── Manufacturing ─────────────────────────────────────────────────────────────
  production_log: ["production_log", "production_log_summary", "product_total_costs", "operator-dashboard"],
  production_runs: ["production_runs", "mobile-pos-production", "operator-dashboard", "manager-dashboard"],
  wac_cost_history: ["wac_cost_history"],
  unit_conversions: ["unit_conversions"],
  // ── Staff / HR ────────────────────────────────────────────────────────────────
  staff_cash_accounts: ["staff-cash-accounts", "all-staff-balances", "agent-cash-holding", "finalizer-holdings"],
  staff_directory: ["staff-directory", "staff-directory-enriched"],
  staff_invitations: ["staff-invitations"],
  staff_performance_logs: ["staff-performance-logs", "agent-perf-report"],
  // ── Settings / Config ─────────────────────────────────────────────────────────
  company_settings: [
    "company-settings", "company_settings", "company-settings-care", "company-settings-invoice",
    "company-settings-map", "company-settings-portal",
    "company-settings-receipt", "company-settings-txn",
    "business-info", "business-info-invoice",
    "partial-collections-setting", "app-settings-auth",
    "mobile-customer-care-setting",
  ],
  business_info: ["business-info", "business-info-invoice"],
  promotional_banners: ["promotional-banners", "banners-admin", "banners-carousel", "store-types-banners"],
  banner_store_types: ["promotional-banners", "banners-admin"],
  store_qr_codes: ["store-qr-codes"],
  vehicles: ["vehicles", "admin_vehicles"],
  price_change_history: ["price-change-history"],
  receipts: ["receipts", "receipt-history", "sale-receipt"],
  notifications: ["notifications"],
};

// ── Role → Tables ────────────────────────────────────────────────────────────
const ROLE_TABLE_MAP: Record<string, string[]> = {
  super_admin: Object.keys(TABLE_QUERY_MAP),
  manager: [
    "sales", "sale_items", "sale_returns", "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products", "store_types",
    "store_visits", "customers", "products", "product_categories",
    "routes", "route_sessions", "agent_routes", "agent_store_types",
    "handovers", "handover_snapshots", "expense_claims", "expenses",
    "expense_categories", "expense_category_access",
    "balance_adjustments", "activity_logs", "user_roles", "profiles", "user_permissions",
    "product_stock", "stock_movements", "staff_stock", "stock_transfers",
    "stock_requests", "warehouses",
    "purchases", "purchase_orders", "purchase_items", "purchase_returns",
    "vendors", "vendor_payments", "vendor_transactions",
    "fixed_costs", "fixed_cost_payments", "income", "income_entries",
    "payrolls", "payroll_items", "workers", "worker_roles", "worker_balances", "worker_payments",
    "attendance_records", "attendance_entries",
    "invoices", "invoice_items", "invoice_sales",
    "raw_materials", "raw_material_categories", "raw_material_stock",
    "bill_of_materials", "production_log", "wac_cost_history",
    "staff_cash_accounts", "staff_directory", "staff_performance_logs",
    "company_settings", "business_info", "promotional_banners",
    "receipts", "notifications", "price_change_history",
  ],
  operator: [
    "sales", "sale_items", "sale_returns",
    "orders", "order_items",
    "stores", "store_type_products",
    "products", "profiles",
    "product_stock", "stock_movements", "staff_stock", "stock_transfers",
    "stock_requests", "warehouses", "production_log", "production_runs",
    "raw_materials", "raw_material_stock", "bill_of_materials",
    "handovers", "handover_snapshots", "expense_claims",
    "expense_categories", "expense_category_access",
    "notifications",
  ],
  agent: [
    "sales", "sale_items", "sale_returns", "sale_return_items",
    "transactions", "orders", "order_items",
    "stores", "store_pricing", "store_type_pricing", "store_type_products", "store_types",
    "store_visits", "customers", "products",
    "routes", "route_sessions", "agent_routes", "agent_store_types",
    "handovers", "handover_snapshots", "expense_claims",
    "expense_categories", "expense_category_access",
    "profiles", "stock_transfers", "staff_stock",
    "product_stock", "stock_movements",
    "notifications", "receipts",
  ],
  marketer: [
    "sales", "sale_items", "sale_returns", "sale_return_items",
    "orders", "order_items", "stores", "store_type_products", "store_types",
    "customers", "products", "routes", "route_sessions",
    "transactions", "agent_store_types", "profiles",
    "handovers", "handover_snapshots", "expense_claims",
    "expense_categories", "expense_category_access",
    "staff_stock", "product_stock", "stock_transfers",
    "notifications",
  ],
  customer: [
    "orders", "order_items", "stores", "customers", "profiles",
    "transactions", "sales", "sale_returns",
    "notifications",
  ],
};

const STAFF_ROLES = ["super_admin", "manager", "agent", "marketer", "operator"];

type RealtimeSubscriber = {
  qc: QueryClient;
  isAdmin: boolean;
  userId?: string | null;
  role: string | null;
};

function shouldSkipForSubscriber(sub: RealtimeSubscriber, table: string, payload: any) {
  if (sub.isAdmin || sub.role === "operator") return false;
  const userId = sub.userId;
  if (!userId) return true;

  if (table === "sales" || table === "sale_returns") {
    const owner = payload.new?.recorded_by ?? payload.old?.recorded_by
      ?? payload.new?.agent_id ?? payload.old?.agent_id;
    if (owner && owner !== userId) return true;
  }
  if (table === "transactions") {
    const owner = payload.new?.recorded_by ?? payload.old?.recorded_by;
    if (owner && owner !== userId) return true;
  }
  if (table === "handovers") {
    const sender = payload.new?.user_id ?? payload.old?.user_id;
    const receiver = payload.new?.handed_to ?? payload.old?.handed_to;
    if (sender !== userId && receiver !== userId) return true;
  }
  if (table === "expense_claims") {
    const owner = payload.new?.user_id ?? payload.old?.user_id;
    if (owner && owner !== userId) return true;
  }
  if (table === "orders") {
    const assigned = payload.new?.assigned_to ?? payload.old?.assigned_to;
    const created = payload.new?.created_by ?? payload.old?.created_by;
    const fulfilled = payload.new?.fulfilled_by ?? payload.old?.fulfilled_by;
    if (sub.role === "agent") {
      if (assigned === userId || created === userId || fulfilled === userId) return false;
      return true;
    }
    if (assigned === userId || created === userId) return false;
    return true;
  }
  if (table === "stock_transfers") {
    const fromUser = payload.new?.from_user_id ?? payload.old?.from_user_id;
    const toUser = payload.new?.to_user_id ?? payload.old?.to_user_id;
    const reqBy = payload.new?.requested_by ?? payload.old?.requested_by;
    if (fromUser !== userId && toUser !== userId && reqBy !== userId) return true;
  }
  if (table === "staff_stock") {
    const owner = payload.new?.user_id ?? payload.old?.user_id;
    if (owner && owner !== userId) return true;
  }
  if (table === "sale_return_items") {
    return false;
  }
  return false;
}

// ── Channel batching ──────────────────────────────────────────────────────────
// Supabase Realtime practical limit is ~50 tables per channel.
// Batch tables into groups of 30 to stay well within limits.
const BATCH_SIZE = 30;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Shared multi-channel realtime ────────────────────────────────────────────
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const subscribers = new Map<symbol, RealtimeSubscriber>();
let isTearingDown = false;

const RETRY = { maxRetries: 5, baseDelay: 1000, maxDelay: 30000 };
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function handlePayload(table: string, payload: any) {
  const keys = TABLE_QUERY_MAP[table];
  if (!keys?.length) return;
  subscribers.forEach((sub) => {
    const roleTables = ROLE_TABLE_MAP[sub.role ?? ""] ?? [];
    if (!roleTables.includes(table)) return;
    if (shouldSkipForSubscriber(sub, table, payload)) return;
    keys.forEach((key) => sub.qc.invalidateQueries({ queryKey: [key] }));
  });
}

function buildChannel(role: string | null) {
  const existingChannels = Array.from(channels.keys());
  if (existingChannels.length > 0) return; // Already built for this role
  const tables = ROLE_TABLE_MAP[role ?? ""] ?? [];
  if (!tables.length) return;

  const batches = chunkArray(tables, BATCH_SIZE);
  batches.forEach((batch, idx) => {
    const channelName = `global-realtime-sync-v2-batch${idx}`;
    let ch = supabase.channel(channelName);
    batch.forEach((table) => {
      ch = ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: any) => handlePayload(table, payload)
      );
    });

    ch.subscribe((status: string) => {
      if (isTearingDown) return;
      if (status === "SUBSCRIBED") {
        retryAttempt = 0;
        if (import.meta.env.DEV) console.log(`[Realtime] Batch ${idx} subscribed to ${batch.length} tables`); // eslint-disable-line no-console
      } else if (status === "CHANNEL_ERROR") {
        logError(`[Realtime] Channel error batch ${idx}`, { context: "useRealtimeSync" });
        scheduleReconnect(role);
      } else if (status === "CLOSED" || status === "TIMED_OUT") {
        if (import.meta.env.DEV) console.warn(`[Realtime] Batch ${idx} connection`, status, "— reconnecting…");
        scheduleReconnect(role);
      }
    });

    channels.set(channelName, ch);
  });
}

function scheduleReconnect(role: string | null) {
  if (retryTimer) clearTimeout(retryTimer);
  if (retryAttempt >= RETRY.maxRetries) {
    logError("[Realtime] Max retries reached", { context: "useRealtimeSync" });
    return;
  }
  const delay = Math.min(RETRY.baseDelay * 2 ** retryAttempt, RETRY.maxDelay);
  retryTimer = setTimeout(async () => {
    retryAttempt++;
    await tearDownChannels();
    buildChannel(role);
  }, delay);
}

async function tearDownChannels() {
  if (channels.size === 0) return;
  isTearingDown = true;
  const removals = Array.from(channels.values()).map((ch) =>
    supabase.removeChannel(ch).catch(() => {})
  );
  await Promise.allSettled(removals);
  channels.clear();
  isTearingDown = false;
}

async function maybeTearDown() {
  if (subscribers.size > 0) return;
  await tearDownChannels();
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

// ── Public hook ───────────────────────────────────────────────────────────────
export function useRealtimeSync() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const prevRoleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!role) return;

    let cancelled = false;
    const id = Symbol("rt-sub");

    const setup = async () => {
      // If role changed, tear down existing channels and rebuild
      if (prevRoleRef.current !== null && prevRoleRef.current !== role) {
        await tearDownChannels();
      }
      if (cancelled) return;
      prevRoleRef.current = role;

      subscribers.set(id, { qc, isAdmin, userId: user?.id, role });
      buildChannel(role);
    };

    setup();

    return () => {
      cancelled = true;
      subscribers.delete(id);
      maybeTearDown();
    };
  }, [qc, isAdmin, user?.id, role]);
}
