/**
 * Canonical source for all permission definitions.
 * Single source of truth — all components/hooks must import from here.
 */
import { type AppRole } from "@/types/roles";
import type { PermissionKey } from "@/components/access/UserPermissionsPanel";

// Re-export so consumers don't need two imports
export { type PermissionKey } from "@/components/access/UserPermissionsPanel";
export type { AppRole } from "@/types/roles";

/** Default permissions per role — inherent permissions that can't be toggled off */
export const ROLE_DEFAULTS: Record<AppRole, PermissionKey[]> = {
  super_admin: [
    "price_override", "record_behalf", "create_customers", "create_stores",
    "edit_balance", "opening_balance", "finalizer", "see_handover_balance",
    "modify_handovers", "cancel_any_handover", "adjust_holding_balance",
    "view_vendors", "manage_vendors",
    "view_purchases", "manage_purchases", "view_vendor_payments", "manage_vendor_payments",
    "view_raw_materials", "manage_raw_materials", "view_attendance", "manage_attendance",
    "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
    "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
    "create_sale_returns",
    "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
    "view_assigned_orders", "accept_order_transfers",
    "submit_expenses", "manage_expense_access", "approve_expenses",
    "backdate",
    "cancel_sales",
  ],
  manager: [
    "price_override", "record_behalf", "create_customers", "create_stores",
    "edit_balance", "opening_balance", "finalizer", "see_handover_balance",
    "modify_handovers", "cancel_any_handover", "adjust_holding_balance",
    "view_vendors", "manage_vendors",
    "view_purchases", "manage_purchases", "view_vendor_payments", "manage_vendor_payments",
    "view_raw_materials", "manage_raw_materials", "view_attendance", "manage_attendance",
    "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
    "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
    "create_sale_returns",
    "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
    "view_assigned_orders", "accept_order_transfers",
    "submit_expenses", "manage_expense_access", "approve_expenses",
    "backdate",
    "cancel_sales",
  ],
  marketer: [
    "create_customers", "create_stores",
    "view_orders", "create_orders", "modify_orders", "transfer_orders",
    "view_invoices", "download_invoices",
  ],
  agent: [
    "create_customers", "create_stores",
    "price_override", "create_sale_returns",
    "view_orders", "create_orders", "modify_orders",
    "view_assigned_orders", "accept_order_transfers",
    "fulfill_orders", "cancel_orders", "record_sale",
    "view_invoices", "download_invoices",
    "submit_expenses",
  ],
  operator: [
    "price_override", "create_sale_returns",
    "view_orders", "create_orders", "modify_orders",
    "fulfill_orders", "cancel_orders", "transfer_orders",
    "view_invoices", "download_invoices",
    "view_attendance", "manage_attendance",
    "record_sale", "see_handover_balance",
  ],

  customer: [
    "view_orders",
  ],
};

/**
 * Check if a role has a permission by default.
 * Returns false for unknown roles or unknown permissions.
 */
export function hasRoleDefaultPermission(role: AppRole, permission: PermissionKey): boolean {
  return ROLE_DEFAULTS[role]?.includes(permission) ?? false;
}

/** All defined permission keys — use this instead of hardcoding arrays */
export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  // General
  "price_override", "record_behalf", "create_customers", "create_stores",
  "edit_balance", "opening_balance", "finalizer", "see_handover_balance",
  "submit_expenses", "manage_expense_access", "approve_expenses",
  // Handover
  "modify_handovers", "cancel_any_handover", "adjust_holding_balance",
  // Sales
  "record_sale", "backdate", "cancel_sales",
  // Vendor & Purchase
  "view_vendors", "manage_vendors",
  "view_purchases", "manage_purchases",
  "view_vendor_payments", "manage_vendor_payments",
  "view_raw_materials", "manage_raw_materials",
  // Attendance
  "view_attendance", "manage_attendance",
  // Orders
  "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
  "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
  "create_sale_returns",
  "view_assigned_orders", "accept_order_transfers",
  // Invoices
  "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
];

/** Human-readable labels */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_orders: "View All Orders",
  create_orders: "Create Orders",
  modify_orders: "Modify Orders",
  modify_order_item_prices: "Modify Order Item Prices",
  transfer_orders: "Transfer Orders to Other Staff",
  delete_orders: "Delete Orders",
  fulfill_orders: "Fulfill Orders",
  cancel_orders: "Cancel Orders",
  create_sale_returns: "Create Sale Returns",
  view_assigned_orders: "View Assigned Orders Only",
  accept_order_transfers: "Accept Order Transfers",
  view_invoices: "View Invoices",
  create_invoices: "Create Invoices",
  edit_invoices: "Edit Invoices",
  delete_invoices: "Delete Invoices",
  download_invoices: "Download/Print Invoices",
  price_override: "Override Product Prices",
  record_behalf: "Record Sales on Behalf",
  record_sale: "Record Sales",
  backdate: "Backdate Sales",
  cancel_sales: "Cancel Sales",
  create_customers: "Create Customers",
  create_stores: "Create Stores",
  edit_balance: "Edit Customer Balances",
  opening_balance: "Set Opening Balances",
  finalizer: "Finalize Reports",
  see_handover_balance: "See Handover Balance",
  modify_handovers: "Modify Handovers",
  cancel_any_handover: "Cancel Any Handover",
  adjust_holding_balance: "Adjust Holding Balance",
  submit_expenses: "Submit Expenses",
  manage_expense_access: "Manage Expense Access",
  approve_expenses: "Approve Expenses",
  view_vendors: "View Vendors",
  manage_vendors: "Manage Vendors",
  view_purchases: "View Purchases",
  manage_purchases: "Manage Purchases",
  view_vendor_payments: "View Vendor Payments",
  manage_vendor_payments: "Manage Vendor Payments",
  view_raw_materials: "View Raw Materials",
  manage_raw_materials: "Manage Raw Materials",
  view_attendance: "View Attendance",
  manage_attendance: "Manage Attendance",
};

/** Permission groupings for display */
export const PERMISSION_GROUPS: Record<string, PermissionKey[]> = {
  "Orders": [
    "view_orders", "create_orders", "modify_orders", "modify_order_item_prices",
    "transfer_orders", "delete_orders", "fulfill_orders", "cancel_orders",
    "create_sale_returns", "view_assigned_orders", "accept_order_transfers",
  ],
  "Invoices": [
    "view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "download_invoices",
  ],
  "Sales & Pricing": [
    "record_sale", "backdate", "cancel_sales", "price_override", "record_behalf", "edit_balance",
    "opening_balance", "finalizer", "see_handover_balance",
  ],
  "Handovers": [
    "modify_handovers", "cancel_any_handover", "adjust_holding_balance",
  ],
  "Customers & Stores": [
    "create_customers", "create_stores",
  ],
  "Vendors & Purchases": [
    "view_vendors", "manage_vendors", "view_purchases", "manage_purchases",
    "view_vendor_payments", "manage_vendor_payments",
    "view_raw_materials", "manage_raw_materials",
  ],
  "Attendance": [
    "view_attendance", "manage_attendance",
  ],
  "Other": [
    "submit_expenses", "manage_expense_access", "approve_expenses",
  ],
};