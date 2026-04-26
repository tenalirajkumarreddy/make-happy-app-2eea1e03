/**
 * E2E Test Configuration
 * Role-based testing credentials and settings
 */

export const TEST_CONFIG = {
  baseURL: process.env.TEST_BASE_URL || 'http://localhost:5003',
  headless: process.env.TEST_HEADLESS !== 'false',
  slowMo: parseInt(process.env.TEST_SLOW_MO || '100'),
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
};

// Test accounts with OTP codes
// UNIVERSAL TEST OTP: "000000" works for all test accounts in development
export const TEST_ACCOUNTS = {
  super_admin: {
    phone: '+917997222262',
    otp: '000000', // Universal test OTP
    role: 'super_admin',
    name: 'AQUA PRIME',
    description: 'Full system access',
  },
  manager: {
    phone: '+916305295757',
    otp: '000000', // Universal test OTP
    role: 'manager',
    name: 'Raj',
    description: 'Warehouse-scoped admin',
    warehouseId: '67f904b6-94f8-4fe8-a585-4774c6b2142c',
  },
  agent: {
    phone: '+919879879870', // Note: This phone has 'agent' role in database
    otp: '000000', // Universal test OTP
    role: 'agent',
    name: 'Staff',
    description: 'Field sales - route based',
  },
  marketer: {
    phone: '+919494910007', // Note: This phone has 'marketer' role in database
    otp: '000000', // Universal test OTP
    role: 'marketer',
    name: 'Veeranji',
    description: 'Sales with order creation',
  },
  operator: {
    phone: '+918888888888',
    otp: '000000', // Universal test OTP
    role: 'operator',
    name: 'Test Operator',
    description: 'POS terminal + inventory + attendance',
  },
  customer: {
    phone: '+919090909090',
    otp: '000000', // Universal test OTP
    role: 'customer',
    name: 'Alex',
    description: 'Self-service portal',
  },
};

// Expected access by role
export const ROLE_ACCESS_MATRIX = {
  super_admin: {
    allowedPages: [
      '/', '/dashboard', '/products', '/inventory', '/vendors', '/customers',
      '/stores', '/routes', '/sales', '/transactions', '/orders', '/handovers',
      '/reports', '/analytics', '/activity', '/access-control', '/staff',
      '/attendance', '/invoices', '/expenses', '/banners', '/settings',
      '/admin/setup', '/admin/staff', '/admin/vehicles', '/hr/staff', '/hr/payroll',
      '/production', '/raw-materials', '/cost-insights', '/map', '/profile',
    ],
    canCreate: ['products', 'customers', 'stores', 'orders', 'sales', 'invoices', 'transactions'],
    canDelete: ['products', 'customers', 'stores', 'orders'],
    canManageUsers: true,
    canAccessAllWarehouses: true,
  },
  manager: {
    allowedPages: [
      '/', '/dashboard', '/products', '/inventory', '/vendors', '/customers',
      '/stores', '/routes', '/sales', '/transactions', '/orders', '/handovers',
      '/reports', '/analytics', '/activity', '/staff', '/attendance',
      '/invoices', '/expenses', '/banners', '/settings', '/hr/staff', '/hr/payroll',
      '/production', '/raw-materials', '/cost-insights', '/map', '/profile',
    ],
    canCreate: ['products', 'customers', 'stores', 'orders', 'sales', 'invoices', 'transactions'],
    canDelete: ['products', 'customers', 'stores'],
    canManageUsers: false,
    canAccessAllWarehouses: false, // Scoped to assigned warehouse
  },
  agent: {
    allowedPages: [
      '/', '/dashboard', '/customers', '/stores', '/sales', '/transactions',
      '/orders', '/handovers', '/routes', '/profile', '/portal/sales', '/portal/orders',
    ],
    canCreate: ['customers', 'stores', 'sales', 'transactions'],
    canDelete: [],
    canManageUsers: false,
    canAccessAllWarehouses: false,
    routeRestricted: true,
  },
  marketer: {
    allowedPages: [
      '/', '/dashboard', '/customers', '/stores', '/orders', '/sales',
      '/profile', '/map',
    ],
    canCreate: ['customers', 'stores', 'orders'],
    canDelete: [],
    canManageUsers: false,
    canAccessAllWarehouses: false,
  },
  operator: {
    allowedPages: [
      '/', '/dashboard', '/inventory', '/sales', '/attendance',
      '/hr/staff', '/invoices', '/profile',
    ],
    canCreate: ['sales'], // POS sales only
    canDelete: [],
    canManageUsers: false,
    canAccessAllWarehouses: false,
    posOnly: true, // Locked to POS store
    attendanceManagement: true,
  },
  customer: {
    allowedPages: [
      '/portal/sales', '/portal/orders', '/portal/transactions', '/portal/profile',
    ],
    canCreate: ['orders'],
    canDelete: [],
    canManageUsers: false,
    canAccessAllWarehouses: false,
    portalOnly: true,
  },
};

// Test scenarios for each role
export const TEST_SCENARIOS = {
  login: {
    name: 'Login Flow',
    description: 'Test login with OTP',
    steps: ['Navigate to auth', 'Enter phone', 'Wait for OTP', 'Enter OTP', 'Verify dashboard'],
  },
  navigation: {
    name: 'Navigation Access',
    description: 'Verify all navigation items visible/hidden correctly',
    steps: ['Check sidebar/nav items', 'Verify allowed routes', 'Verify blocked routes'],
  },
  dataRead: {
    name: 'Data Reading',
    description: 'Verify data is scoped correctly',
    steps: ['Load data tables', 'Verify RLS enforcement', 'Check warehouse scoping'],
  },
  dataCreate: {
    name: 'Data Creation',
    description: 'Test create operations',
    steps: ['Open create form', 'Fill data', 'Submit', 'Verify success'],
  },
  dataUpdate: {
    name: 'Data Update',
    description: 'Test update operations',
    steps: ['Open edit form', 'Modify data', 'Submit', 'Verify changes'],
  },
  permissions: {
    name: 'Permission Enforcement',
    description: 'Test permission-based features',
    steps: ['Test allowed actions', 'Test blocked actions', 'Verify error messages'],
  },
};
