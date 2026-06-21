import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";
import { useLocation } from "react-router-dom";

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
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "balance-adjustments", "store-payment-returns",
  ],
  sale_return_items: ["sale-returns", "return-details", "pl-returns"],
  transactions: [
    "transactions", "customer-transactions", "store-transactions",
    ...DASHBOARD, ...MOBILE_TX, ...ANALYTICS,
    "daybook-transactions", "statement-transactions", "user-transaction-totals",
    "my-ledger-txns", ...PAYMENT_FLOW,
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "balance-adjustments", "store-payment-returns",
  ],
  payment_returns: [
    "transactions", ...DASHBOARD, ...MOBILE_TX, ...ANALYTICS,
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "balance-adjustments", "store-payment-returns",
  ],
  orders: [
    "orders", "my-orders", "my-orders-count", "store-orders",
    ...DASHBOARD, ...MOBILE_ORDERS,
    "order-report", "pending-orders-for-store", "mobile-pending-orders-for-store",
    "pending-order-stores", "pending-orders-map", "routes-for-orders",
    "daybook-sales", "mobile-admin-ops",
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "balance-adjustments", "store-payment-returns",
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
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "balance-adjustments", "store-payment-returns",
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
  balance_adjustments: [
    "balance-adjustments", "stores", "customer-balances",
    "store-sales", "store-transactions", "store-orders", "store-visits",
    "store-payment-returns",
  ],
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

// ── Page/Route → Tables mapping ─────────────────────────────────────────────────
// Maps route patterns to the tables they need realtime updates for.
// Only these tables will be subscribed to when on that page.
const PAGE_TABLE_MAP: Record<string, string[]> = {
  // Dashboard pages
  "/": ["sales", "transactions", "orders", "handovers", "product_stock", "stores"],
  "/dashboard": ["sales", "transactions", "orders", "handovers", "product_stock", "stores"],
  
  // Sales pages
  "/sales": ["sales", "sale_items", "sale_returns", "stores", "customers", "products"],
  "/sale-returns": ["sale_returns", "sale_return_items", "sales", "products"],
  
  // Transactions
  "/transactions": ["transactions", "payment_returns", "stores", "customers"],
  
  // Orders
  "/orders": ["orders", "order_items", "stores", "customers", "products", "routes"],
  
  // Handovers
  "/handovers": ["handovers", "handover_snapshots", "handover_requests", "expense_claims"],
  
  // Customers/Stores
  "/customers": ["customers", "stores", "store_types", "store_pricing"],
  "/stores": ["stores", "store_types", "store_pricing", "customers", "routes"],
  "/store-types": ["store_types", "store_type_pricing", "store_type_products"],
  
  // Routes
  "/routes": ["routes", "route_sessions", "agent_routes", "store_visits", "stores"],
  "/routes/": ["routes", "route_sessions", "agent_routes", "store_visits", "stores"],
  
  // Inventory
  "/inventory": ["product_stock", "stock_movements", "staff_stock", "stock_transfers", "stock_requests", "warehouses", "products"],
  "/inventory/raw-materials": ["raw_materials", "raw_material_stock", "raw_material_adjustments", "vendor_raw_materials"],
  "/inventory/boms": ["bill_of_materials"],
  "/production": ["production_log", "production_runs", "wac_cost_history"],
  
  // Purchases/Vendors
  "/vendors": ["vendors", "vendor_payments", "vendor_transactions", "purchases", "purchase_returns"],
  "/purchases": ["purchases", "purchase_items", "purchase_returns", "vendors", "products"],
  "/vendor-payments": ["vendor_payments", "vendors"],
  
  // Reports/Analytics
  "/reports": ["sales", "transactions", "orders", "purchases", "sale_returns", "purchase_returns", "expenses", "product_stock"],
  "/analytics": ["sales", "transactions", "orders", "product_stock"],
  
  // Staff/HR
  "/staff": ["user_roles", "profiles", "staff_directory", "staff_invitations"],
  "/hr/staff": ["workers", "worker_roles", "worker_balances", "worker_payments", "attendance_records"],
  "/hr/payroll": ["payrolls", "payroll_items", "workers"],
  "/attendance": ["attendance_records", "attendance_entries", "workers"],
  
  // Invoices
  "/invoices": ["invoices", "invoice_items", "invoice_sales", "sales", "customers"],
  
  // Expenses
  "/expenses": ["expenses", "expense_claims", "expense_categories", "fixed_costs", "fixed_cost_payments"],
  
  // Settings/Admin
  "/settings": ["company_settings", "business_info", "promotional_banners", "user_roles", "profiles"],
  "/admin": ["user_roles", "profiles", "staff_directory", "company_settings", "vehicles"],
  
  // Stock Transfers
  "/stock-transfers": ["stock_transfers", "stock_requests", "staff_stock", "product_stock", "warehouses"],
  
  // Activity
  "/activity": ["activity_logs"],
  
  // Mobile-specific routes (agent/marketer/pos)
  "/mobile": ["sales", "transactions", "orders", "handovers", "stores", "products"],
  "/agent": ["sales", "transactions", "orders", "handovers", "stores", "products", "routes", "route_sessions"],
  "/marketer": ["orders", "transactions", "handovers", "stores", "products", "customers"],
  "/pos": ["sales", "transactions", "orders", "handovers", "product_stock", "invoices"],
};

// Default tables for pages not explicitly mapped
const DEFAULT_PAGE_TABLES = [
  "sales", "transactions", "orders", "handovers", "stores", "customers", 
  "products", "notifications", "profiles"
];

function getTablesForRoute(pathname: string, role: string | null): string[] {
  // Exact match first
  if (PAGE_TABLE_MAP[pathname]) {
    return PAGE_TABLE_MAP[pathname];
  }
  
  // Pattern match for dynamic routes
  for (const [pattern, tables] of Object.entries(PAGE_TABLE_MAP)) {
    if (pattern.endsWith("/") && pathname.startsWith(pattern)) {
      return tables;
    }
    if (pattern.includes(":") && pathname.match(pattern.replace(":id", "[^/]+"))) {
      return tables;
    }
  }
  
  // Role-based defaults
  const roleTables = ROLE_TABLE_MAP[role ?? ""] ?? [];
  return roleTables.length > 0 ? roleTables.slice(0, 20) : DEFAULT_PAGE_TABLES;
}

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
const DEBOUNCE_MS = 250;
let retryAttempt = 0;
const invalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingInvalidations = new Map<string, Set<string>>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function flushInvalidations(subscriberId: symbol) {
  const sub = subscribers.get(subscriberId);
  if (!sub || !pendingInvalidations.has(String(subscriberId))) return;
  const keys = pendingInvalidations.get(String(subscriberId));
  if (!keys || keys.size === 0) return;
  keys.forEach((key) => {
    // Mark stale but do NOT force an eager refetch — it can hit a stale read-replica
    // and overwrite optimistic updates before the write has replicated.
    // Active observers will refetch naturally on their next tick (focus, interval, etc.)
    sub.qc.invalidateQueries({ queryKey: [key] });
  });
  pendingInvalidations.delete(String(subscriberId));
}

function handlePayload(table: string, payload: any) {
  const keys = TABLE_QUERY_MAP[table];
  if (!keys?.length) return;
  subscribers.forEach((sub, subscriberId) => {
    const roleTables = ROLE_TABLE_MAP[sub.role ?? ""] ?? [];
    if (!roleTables.includes(table)) return;
    if (shouldSkipForSubscriber(sub, table, payload)) return;

    const subKey = String(subscriberId);
    if (!pendingInvalidations.has(subKey)) {
      pendingInvalidations.set(subKey, new Set());
    }
    keys.forEach((key) => pendingInvalidations.get(subKey)?.add(key));

    if (invalidateTimers.has(subKey)) clearTimeout(invalidateTimers.get(subKey));
    invalidateTimers.set(subKey, setTimeout(() => {
      flushInvalidations(subscriberId);
      invalidateTimers.delete(subKey);
    }, DEBOUNCE_MS));
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
    const subscriberId = String(id);

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
      // Flush any pending invalidations before unsubscribing
      flushInvalidations(id);
      pendingInvalidations.delete(subscriberId);
      maybeTearDown();
    };
  }, [qc, isAdmin, user?.id, role]);
}

// ── Per-page realtime sync hook ────────────────────────────────────────────────
// Usage: usePageRealtimeSync() — subscribes only to tables relevant to current route

const pageChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const pageSubscribers = new Map<symbol, RealtimeSubscriber>();
let pageIsTearingDown = false;
let pageRetryAttempt = 0;
let pageRetryTimer: ReturnType<typeof setTimeout> | null = null;
const pageInvalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pagePendingInvalidations = new Map<string, Set<string>>();
const PAGE_DEBOUNCE_MS = 250;

function buildPageChannel(tables: string[], role: string | null) {
  const channelName = `page-realtime-sync-${tables.join("-").slice(0, 50)}`;
  if (pageChannels.has(channelName)) return;
  
  let ch = supabase.channel(channelName);
  tables.forEach((table) => {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload: any) => handlePagePayload(table, payload)
    );
  });

  ch.subscribe((status: string) => {
    if (pageIsTearingDown) return;
    if (status === "SUBSCRIBED") {
      pageRetryAttempt = 0;
      if (import.meta.env.DEV) console.log(`[PageRealtime] Subscribed to ${tables.length} tables`); // eslint-disable-line no-console
    } else if (status === "CHANNEL_ERROR") {
      logError("[PageRealtime] Channel error", { context: "usePageRealtimeSync" });
      schedulePageReconnect(tables, role);
    } else if (status === "CLOSED" || status === "TIMED_OUT") {
      if (import.meta.env.DEV) console.warn("[PageRealtime] Connection", status, "— reconnecting…");
      schedulePageReconnect(tables, role);
    }
  });

  pageChannels.set(channelName, ch);
}

function schedulePageReconnect(tables: string[], role: string | null) {
  if (pageRetryTimer) clearTimeout(pageRetryTimer);
  if (pageRetryAttempt >= RETRY.maxRetries) {
    logError("[PageRealtime] Max retries reached", { context: "usePageRealtimeSync" });
    return;
  }
  const delay = Math.min(RETRY.baseDelay * 2 ** pageRetryAttempt, RETRY.maxDelay);
  pageRetryTimer = setTimeout(async () => {
    pageRetryAttempt++;
    await tearDownPageChannels();
    buildPageChannel(tables, role);
  }, delay);
}

async function tearDownPageChannels() {
  if (pageChannels.size === 0) return;
  pageIsTearingDown = true;
  const removals = Array.from(pageChannels.values()).map((ch) =>
    supabase.removeChannel(ch).catch(() => {})
  );
  await Promise.allSettled(removals);
  pageChannels.clear();
  pageIsTearingDown = false;
}

function handlePagePayload(table: string, payload: any) {
  const keys = TABLE_QUERY_MAP[table];
  if (!keys?.length) return;
  pageSubscribers.forEach((sub, subscriberId) => {
    const roleTables = ROLE_TABLE_MAP[sub.role ?? ""] ?? [];
    if (!roleTables.includes(table)) return;
    if (shouldSkipForSubscriber(sub, table, payload)) return;

    const subKey = String(subscriberId);
    if (!pagePendingInvalidations.has(subKey)) {
      pagePendingInvalidations.set(subKey, new Set());
    }
    keys.forEach((key) => pagePendingInvalidations.get(subKey)?.add(key));

    if (pageInvalidateTimers.has(subKey)) clearTimeout(pageInvalidateTimers.get(subKey));
    pageInvalidateTimers.set(subKey, setTimeout(() => {
      flushPageInvalidations(subscriberId);
      pageInvalidateTimers.delete(subKey);
    }, PAGE_DEBOUNCE_MS));
  });
}

function flushPageInvalidations(subscriberId: symbol) {
  const sub = pageSubscribers.get(subscriberId);
  if (!sub || !pagePendingInvalidations.has(String(subscriberId))) return;
  const keys = pagePendingInvalidations.get(String(subscriberId));
  if (!keys || keys.size === 0) return;
  keys.forEach((key) => {
    // Mark stale but do NOT force an eager refetch — same as flushInvalidations above
    sub.qc.invalidateQueries({ queryKey: [key] });
  });
  pagePendingInvalidations.delete(String(subscriberId));
}

export function usePageRealtimeSync() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const location = useLocation();
  const isAdmin = role === "super_admin" || role === "manager";
  const prevRouteRef = useRef<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!role) return;

    let cancelled = false;
    const id = Symbol("page-rt-sub");
    const subscriberId = String(id);
    const currentPath = location.pathname;
    const tables = getTablesForRoute(currentPath, role);

    const setup = async () => {
      // Tear down if route or role changed
      if (prevRouteRef.current !== null && prevRouteRef.current !== currentPath) {
        await tearDownPageChannels();
      }
      if (prevRoleRef.current !== null && prevRoleRef.current !== role) {
        await tearDownPageChannels();
      }
      if (cancelled) return;
      prevRouteRef.current = currentPath;
      prevRoleRef.current = role;

      pageSubscribers.set(id, { qc, isAdmin, userId: user?.id, role });
      buildPageChannel(tables, role);
    };

    setup();

    return () => {
      cancelled = true;
      pageSubscribers.delete(id);
      flushPageInvalidations(id);
      pagePendingInvalidations.delete(subscriberId);
      // Don't tear down immediately - keep channel for potential quick re-navigation
      // tearDownPageChannels() is called on route/role change
    };
  }, [qc, isAdmin, user?.id, role, location.pathname]);
}
