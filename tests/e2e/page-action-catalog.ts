/**
 * Page Action Catalog
 * Comprehensive list of all actions possible on each page
 * Used for systematic testing coverage
 */

export interface PageAction {
  id: string;
  name: string;
  description: string;
  selector: string;
  actionType: 'click' | 'fill' | 'select' | 'verify' | 'upload' | 'api';
  expectedResult?: string;
  validationRules?: string[];
  affectedRoles?: string[]; // Which roles should see the effect
  databaseTables?: string[]; // Tables affected
  realtimeEvent?: string; // Realtime event name
}

export interface PageDefinition {
  path: string;
  title: string;
  allowedRoles: string[];
  blockedRoles: string[];
  actions: PageAction[];
  dataElements: string[]; // Key data displayed/editable
  dependencies: string[]; // Other pages/data this depends on
}

// Sales Page Actions
export const SALES_PAGE_ACTIONS: PageDefinition = {
  path: '/sales',
  title: 'Sales',
  allowedRoles: ['super_admin', 'manager', 'agent', 'operator'],
  blockedRoles: ['marketer', 'customer'],
  actions: [
    {
      id: 'SALE-001',
      name: 'Create New Sale',
      description: 'Click button to open sale creation form',
      selector: 'button:has-text("New Sale"), button:has-text("Create Sale")',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager', 'agent', 'operator'],
    },
    {
      id: 'SALE-002',
      name: 'Select Store',
      description: 'Choose store for the sale',
      selector: 'select[name="store"], [data-testid="store-select"]',
      actionType: 'select',
      validationRules: ['operator: locked to POS store'],
      affectedRoles: ['agent', 'manager', 'super_admin'],
    },
    {
      id: 'SALE-003',
      name: 'Enter Sale Amount',
      description: 'Input the sale amount',
      selector: 'input[name="amount"], input[placeholder*="amount"]',
      actionType: 'fill',
      validationRules: ['required', 'numeric', 'min:0'],
    },
    {
      id: 'SALE-004',
      name: 'Select Payment Type',
      description: 'Choose cash, UPI, or credit',
      selector: 'select[name="payment_type"], [data-testid="payment-type"]',
      actionType: 'select',
      validationRules: ['operator: must be full payment (no credit)'],
    },
    {
      id: 'SALE-005',
      name: 'Save Sale',
      description: 'Submit the sale form',
      selector: 'button:has-text("Save"), button:has-text("Submit")',
      actionType: 'click',
      databaseTables: ['sales', 'transactions', 'customer_balances', 'activity_log'],
      realtimeEvent: 'sale_inserted',
      affectedRoles: ['super_admin', 'manager', 'agent'],
    },
    {
      id: 'SALE-006',
      name: 'Filter by Date',
      description: 'Filter sales by date range',
      selector: '[data-testid="date-filter"], input[type="date"]',
      actionType: 'fill',
    },
    {
      id: 'SALE-007',
      name: 'Filter by Warehouse',
      description: 'Filter sales by warehouse',
      selector: 'select[name="warehouse"], [data-testid="warehouse-filter"]',
      actionType: 'select',
      validationRules: ['operator: only sees POS warehouse'],
    },
    {
      id: 'SALE-008',
      name: 'View Sale Details',
      description: 'Click on a sale to view details',
      selector: 'tr[data-sale-id], [data-testid="sale-row"]',
      actionType: 'click',
    },
    {
      id: 'SALE-009',
      name: 'Edit Sale',
      description: 'Modify an existing sale',
      selector: 'button:has-text("Edit"), [data-testid="edit-sale"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'SALE-010',
      name: 'Delete Sale',
      description: 'Remove a sale record',
      selector: 'button:has-text("Delete"), [data-testid="delete-sale"]',
      actionType: 'click',
      affectedRoles: ['super_admin'],
      databaseTables: ['sales', 'transactions'],
    },
    {
      id: 'SALE-011',
      name: 'Export Sales Data',
      description: 'Export to CSV/Excel',
      selector: 'button:has-text("Export"), [data-testid="export"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
  ],
  dataElements: ['sale_id', 'amount', 'store_name', 'payment_type', 'created_at', 'status'],
  dependencies: ['/stores', '/customers', '/inventory'],
};

// Inventory Page Actions
export const INVENTORY_PAGE_ACTIONS: PageDefinition = {
  path: '/inventory',
  title: 'Inventory',
  allowedRoles: ['super_admin', 'manager', 'operator'],
  blockedRoles: ['agent', 'marketer', 'customer'],
  actions: [
    {
      id: 'INV-001',
      name: 'View Product List',
      description: 'Display inventory items',
      selector: '[data-testid="inventory-list"], table',
      actionType: 'verify',
      validationRules: ['operator: only POS warehouse products'],
    },
    {
      id: 'INV-002',
      name: 'Filter by Warehouse',
      description: 'Filter inventory by warehouse',
      selector: 'select[name="warehouse"], [data-testid="warehouse-filter"]',
      actionType: 'select',
      validationRules: ['operator: locked to POS warehouse'],
    },
    {
      id: 'INV-003',
      name: 'Search Product',
      description: 'Search inventory by name/SKU',
      selector: 'input[placeholder*="Search"], input[name="search"]',
      actionType: 'fill',
    },
    {
      id: 'INV-004',
      name: 'View Stock Alerts',
      description: 'Show low stock items',
      selector: 'button:has-text("Alerts"), [data-testid="stock-alerts"]',
      actionType: 'click',
    },
    {
      id: 'INV-005',
      name: 'Create Stock Transfer',
      description: 'Initiate stock transfer',
      selector: 'button:has-text("Transfer"), [data-testid="new-transfer"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
      databaseTables: ['stock_transfers', 'inventory'],
      realtimeEvent: 'stock_transfer_created',
    },
    {
      id: 'INV-006',
      name: 'View Stock Transfer History',
      description: 'See past transfers',
      selector: 'button:has-text("History"), [data-testid="transfer-history"]',
      actionType: 'click',
    },
    {
      id: 'INV-007',
      name: 'Adjust Stock',
      description: 'Manual stock adjustment',
      selector: 'button:has-text("Adjust"), [data-testid="adjust-stock"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
      databaseTables: ['inventory', 'stock_adjustments'],
    },
    {
      id: 'INV-008',
      name: 'View BOM Details',
      description: 'View Bill of Materials',
      selector: 'button:has-text("BOM"), [data-testid="view-bom"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
  ],
  dataElements: ['product_id', 'product_name', 'quantity', 'warehouse_name', 'low_stock_threshold'],
  dependencies: ['/products', '/warehouses'],
};

// Orders Page Actions
export const ORDERS_PAGE_ACTIONS: PageDefinition = {
  path: '/orders',
  title: 'Orders',
  allowedRoles: ['super_admin', 'manager', 'agent', 'marketer'],
  blockedRoles: ['operator', 'customer'],
  actions: [
    {
      id: 'ORD-001',
      name: 'Create New Order',
      description: 'Create a new order',
      selector: 'button:has-text("New Order"), [data-testid="create-order"]',
      actionType: 'click',
      affectedRoles: ['marketer', 'super_admin', 'manager'],
      databaseTables: ['orders', 'order_items'],
      realtimeEvent: 'order_inserted',
    },
    {
      id: 'ORD-002',
      name: 'Select Customer',
      description: 'Choose customer for order',
      selector: 'select[name="customer"], [data-testid="customer-select"]',
      actionType: 'select',
    },
    {
      id: 'ORD-003',
      name: 'Enter Order Amount',
      description: 'Input order total',
      selector: 'input[name="amount"], input[placeholder*="amount"]',
      actionType: 'fill',
    },
    {
      id: 'ORD-004',
      name: 'Schedule Delivery',
      description: 'Set delivery date/time',
      selector: 'input[type="datetime-local"], [data-testid="delivery-date"]',
      actionType: 'fill',
    },
    {
      id: 'ORD-005',
      name: 'Save Order',
      description: 'Submit order',
      selector: 'button:has-text("Save"), button:has-text("Create")',
      actionType: 'click',
      affectedRoles: ['agent', 'marketer'],
      realtimeEvent: 'order_created',
    },
    {
      id: 'ORD-006',
      name: 'Convert Order to Sale',
      description: 'Convert pending order',
      selector: 'button:has-text("Convert"), [data-testid="convert-order"]',
      actionType: 'click',
      affectedRoles: ['agent', 'super_admin', 'manager'],
      databaseTables: ['orders', 'sales', 'order_conversions'],
      realtimeEvent: 'order_converted',
    },
    {
      id: 'ORD-007',
      name: 'Cancel Order',
      description: 'Cancel pending order',
      selector: 'button:has-text("Cancel"), [data-testid="cancel-order"]',
      actionType: 'click',
      databaseTables: ['orders'],
    },
    {
      id: 'ORD-008',
      name: 'View Order Details',
      description: 'View full order info',
      selector: 'tr[data-order-id], [data-testid="order-row"]',
      actionType: 'click',
    },
  ],
  dataElements: ['order_id', 'customer_name', 'amount', 'status', 'delivery_date', 'created_by'],
  dependencies: ['/customers', '/sales'],
};

// Attendance Page Actions
export const ATTENDANCE_PAGE_ACTIONS: PageDefinition = {
  path: '/attendance',
  title: 'Attendance',
  allowedRoles: ['super_admin', 'manager', 'operator'],
  blockedRoles: ['agent', 'marketer', 'customer'],
  actions: [
    {
      id: 'ATT-001',
      name: 'Mark Self Check-in',
      description: 'Record own attendance',
      selector: 'button:has-text("Check In"), [data-testid="check-in"]',
      actionType: 'click',
      affectedRoles: ['operator'],
      databaseTables: ['attendance'],
    },
    {
      id: 'ATT-002',
      name: 'Mark Self Check-out',
      description: 'Record departure',
      selector: 'button:has-text("Check Out"), [data-testid="check-out"]',
      actionType: 'click',
      affectedRoles: ['operator'],
      databaseTables: ['attendance'],
    },
    {
      id: 'ATT-003',
      name: 'View Own Attendance History',
      description: 'See personal records',
      selector: '[data-testid="my-attendance"], button:has-text("My Records")',
      actionType: 'click',
      affectedRoles: ['operator'],
    },
    {
      id: 'ATT-004',
      name: 'View All Staff Attendance',
      description: 'Manager view of all staff',
      selector: '[data-testid="all-attendance"], button:has-text("All Staff")',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'ATT-005',
      name: 'Mark Attendance for Staff',
      description: 'Manager marks for others',
      selector: 'button:has-text("Mark"), [data-testid="mark-attendance"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
      databaseTables: ['attendance'],
    },
    {
      id: 'ATT-006',
      name: 'Generate Attendance Report',
      description: 'Export attendance data',
      selector: 'button:has-text("Report"), [data-testid="attendance-report"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'ATT-007',
      name: 'Filter by Date',
      description: 'Filter records by date',
      selector: 'input[type="date"], [data-testid="date-filter"]',
      actionType: 'fill',
    },
    {
      id: 'ATT-008',
      name: 'Filter by Staff',
      description: 'Show specific staff',
      selector: 'select[name="staff"], [data-testid="staff-filter"]',
      actionType: 'select',
      affectedRoles: ['super_admin', 'manager'],
    },
  ],
  dataElements: ['attendance_id', 'staff_name', 'check_in', 'check_out', 'date', 'status'],
  dependencies: ['/hr/staff'],
};

// HR Staff Page Actions
export const HR_STAFF_PAGE_ACTIONS: PageDefinition = {
  path: '/hr/staff',
  title: 'HR Staff Directory',
  allowedRoles: ['super_admin', 'manager', 'operator'],
  blockedRoles: ['agent', 'marketer', 'customer'],
  actions: [
    {
      id: 'HR-001',
      name: 'View Staff List',
      description: 'Display all staff',
      selector: 'table, [data-testid="staff-list"]',
      actionType: 'verify',
      affectedRoles: ['operator', 'manager', 'super_admin'],
    },
    {
      id: 'HR-002',
      name: 'View Staff Details',
      description: 'See individual staff info',
      selector: 'tr[data-staff-id], [data-testid="staff-row"]',
      actionType: 'click',
    },
    {
      id: 'HR-003',
      name: 'Create New Staff',
      description: 'Add staff member',
      selector: 'button:has-text("Add Staff"), [data-testid="add-staff"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
      databaseTables: ['staff_directory', 'profiles'],
    },
    {
      id: 'HR-004',
      name: 'Edit Staff',
      description: 'Modify staff details',
      selector: 'button:has-text("Edit"), [data-testid="edit-staff"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
      validationRules: ['operator: cannot modify staff'],
    },
    {
      id: 'HR-005',
      name: 'Assign Role',
      description: 'Change staff role',
      selector: 'select[name="role"], [data-testid="role-select"]',
      actionType: 'select',
      affectedRoles: ['super_admin', 'manager'],
      validationRules: ['operator: cannot change roles'],
      databaseTables: ['user_roles', 'staff_directory'],
    },
    {
      id: 'HR-006',
      name: 'Assign Warehouse',
      description: 'Set staff warehouse',
      selector: 'select[name="warehouse"], [data-testid="warehouse-select"]',
      actionType: 'select',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'HR-007',
      name: 'Deactivate Staff',
      description: 'Disable staff account',
      selector: 'button:has-text("Deactivate"), [data-testid="deactivate"]',
      actionType: 'click',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'HR-008',
      name: 'Search Staff',
      description: 'Find staff by name/phone',
      selector: 'input[placeholder*="Search"], input[name="search"]',
      actionType: 'fill',
    },
  ],
  dataElements: ['staff_id', 'full_name', 'role', 'warehouse', 'phone', 'is_active'],
  dependencies: ['/warehouses'],
};

// Customer Page Actions
export const CUSTOMERS_PAGE_ACTIONS: PageDefinition = {
  path: '/customers',
  title: 'Customers',
  allowedRoles: ['super_admin', 'manager', 'agent'],
  blockedRoles: ['marketer', 'operator', 'customer'],
  actions: [
    {
      id: 'CUST-001',
      name: 'View Customer List',
      description: 'Display customers',
      selector: 'table, [data-testid="customer-list"]',
      actionType: 'verify',
      validationRules: ['agent: only assigned customers'],
    },
    {
      id: 'CUST-002',
      name: 'Create New Customer',
      description: 'Add customer',
      selector: 'button:has-text("New Customer"), [data-testid="add-customer"]',
      actionType: 'click',
      databaseTables: ['customers', 'customer_warehouse_link'],
      realtimeEvent: 'customer_created',
    },
    {
      id: 'CUST-003',
      name: 'View Customer Details',
      description: 'See customer profile',
      selector: 'tr[data-customer-id], [data-testid="customer-row"]',
      actionType: 'click',
    },
    {
      id: 'CUST-004',
      name: 'Edit Customer',
      description: 'Modify customer info',
      selector: 'button:has-text("Edit"), [data-testid="edit-customer"]',
      actionType: 'click',
      databaseTables: ['customers'],
    },
    {
      id: 'CUST-005',
      name: 'View Outstanding Balance',
      description: 'See payment due',
      selector: '[data-testid="outstanding"], .outstanding-balance',
      actionType: 'verify',
    },
    {
      id: 'CUST-006',
      name: 'View Transaction History',
      description: 'See sales/payments',
      selector: 'button:has-text("Transactions"), [data-testid="transactions"]',
      actionType: 'click',
    },
    {
      id: 'CUST-007',
      name: 'Assign to Route',
      description: 'Link to route',
      selector: 'select[name="route"], [data-testid="route-select"]',
      actionType: 'select',
      affectedRoles: ['super_admin', 'manager'],
    },
    {
      id: 'CUST-008',
      name: 'Filter by Outstanding',
      description: 'Show only with balance',
      selector: 'button:has-text("Outstanding"), [data-testid="filter-outstanding"]',
      actionType: 'click',
    },
  ],
  dataElements: ['customer_id', 'name', 'phone', 'outstanding_balance', 'store_name', 'route_name'],
  dependencies: ['/stores', '/routes'],
};

// Complete Page Catalog
export const PAGE_CATALOG: PageDefinition[] = [
  SALES_PAGE_ACTIONS,
  INVENTORY_PAGE_ACTIONS,
  ORDERS_PAGE_ACTIONS,
  ATTENDANCE_PAGE_ACTIONS,
  HR_STAFF_PAGE_ACTIONS,
  CUSTOMERS_PAGE_ACTIONS,
];

// Helper to get actions by role
export function getActionsForRole(role: string): PageAction[] {
  const actions: PageAction[] = [];

  for (const page of PAGE_CATALOG) {
    if (page.allowedRoles.includes(role)) {
      for (const action of page.actions) {
        // Include action if it's for this role or all roles
        if (!action.affectedRoles || action.affectedRoles.includes(role)) {
          actions.push({
            ...action,
            // Add page context
          });
        }
      }
    }
  }

  return actions;
}

// Helper to get blocked pages for role
export function getBlockedPagesForRole(role: string): PageDefinition[] {
  return PAGE_CATALOG.filter(page => page.blockedRoles.includes(role));
}

// Generate test coverage report
export function generateCoverageReport(): string {
  const report: string[] = [];
  report.push('# Page Action Coverage Report');
  report.push('');
  report.push('## Summary');
  report.push(`Total Pages: ${PAGE_CATALOG.length}`);
  report.push(`Total Actions: ${PAGE_CATALOG.reduce((sum, p) => sum + p.actions.length, 0)}`);
  report.push('');

  for (const page of PAGE_CATALOG) {
    report.push(`## ${page.title} (${page.path})`);
    report.push(`- Allowed Roles: ${page.allowedRoles.join(', ')}`);
    report.push(`- Blocked Roles: ${page.blockedRoles.join(', ')}`);
    report.push(`- Actions: ${page.actions.length}`);
    report.push('');

    for (const action of page.actions) {
      report.push(`### ${action.id}: ${action.name}`);
      report.push(`- Type: ${action.actionType}`);
      report.push(`- Selector: \`${action.selector}\``);
      if (action.affectedRoles) {
        report.push(`- Affected Roles: ${action.affectedRoles.join(', ')}`);
      }
      if (action.databaseTables) {
        report.push(`- Database Tables: ${action.databaseTables.join(', ')}`);
      }
      if (action.realtimeEvent) {
        report.push(`- Realtime Event: ${action.realtimeEvent}`);
      }
      report.push('');
    }
  }

  return report.join('\n');
}
