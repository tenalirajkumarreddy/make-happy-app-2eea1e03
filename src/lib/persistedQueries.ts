export const PERSISTED_QUERY_PREFIXES = new Set([
  "sales", "sale-items",
  "orders", "order-items",
  "products", "product-categories",
  "customers", "customer",
  "stores", "store",
  "routes",
  "inventory",
  "transactions",
  "invoices", "invoice", "invoice-items",
  "purchases", "purchase-items",
  "vendors", "vendor",
  "expenses", "expense-categories",
  "stock-transfers", "stock-movements",
  "product-stock", "warehouse-stock", "staff-stock", "agent-stock",
  "sale-returns", "purchase-returns",
  "handovers",
  "company-settings", "business-info",
  "workers", "payrolls", "payroll",
  "raw-materials", "bill-of-materials", "boms", "production-log",
  "vehicles",
  "notifications",
  "user-roles", "my-permissions",
]);

export function isQueryPersisted(queryKey: string[]): boolean {
  return PERSISTED_QUERY_PREFIXES.has(queryKey[0]);
}
