# Page Structure Audit

**Analysis Date:** 2026-04-12

## Overview

BizManager is a multi-role sales/route/collections app with role-based access control. The application supports 6 user roles: `super_admin`, `manager`, `agent`, `marketer`, `pos`, and `customer`. Routes are protected by a combination of `ProtectedRoute`, `RoleRoute`, and `RoleGuard` components.

## Routes Overview

### Web Routes (src/App.tsx)

| Path | Component | Roles | Guard Type | Description |
|------|-----------|-------|------------|-------------|
| `/auth` | `Auth` | Public | None | Authentication page |
| `/onboarding` | `Onboarding` | Public | None | New customer onboarding |
| `/reset-password` | `ResetPassword` | Public | None | Password reset |
| `/` | `DashboardRouter` | All Staff + Customer | `RoleRoute` | Role-based dashboard routing |
| `/profile` | `UserProfile` | All | `ProtectedRoute` | User profile management |
| `/products` | `Products` | super_admin, manager | `RoleGuard` | Product catalog management |
| `/inventory` | `Inventory` | super_admin, manager | `RoleGuard` | Inventory management |
| `/vendors` | `Vendors` | super_admin, manager | `RoleGuard` | Vendor management |
| `/vendors/:id` | `VendorDetail` | super_admin, manager | `RoleGuard` | Vendor details |
| `/purchases` | `Purchases` | super_admin, manager | `RoleGuard` | Purchase records |
| `/vendor-payments` | `VendorPayments` | super_admin, manager | `RoleGuard` | Vendor payment tracking |
| `/raw-materials` | `RawMaterials` | super_admin, manager | `RoleGuard` | Raw materials inventory |
| `/invoices` | `Invoices` | super_admin, manager | `RoleGuard` | Invoice management |
| `/invoices/new` | `InvoiceForm` | super_admin, manager | `RoleGuard` | Create invoice |
| `/invoices/:id` | `InvoiceView` | super_admin, manager | `RoleGuard` | View invoice |
| `/invoices/:id/print` | `InvoiceView` | super_admin, manager | `RoleGuard` | Print invoice |
| `/attendance` | `Attendance` | super_admin, manager | `RoleGuard` | Staff attendance |
| `/expenses` | `Expenses` | super_admin, manager | `RoleGuard` | Expense tracking |
| `/banners` | `Banners` | super_admin, manager | `RoleGuard` | Marketing banner management |
| `/analytics` | `Analytics` | super_admin, manager | `RoleGuard` | Business analytics |
| `/reports` | `Reports` | super_admin, manager | `RoleGuard` | Report generation |
| `/reports/:type` | `Reports` | super_admin, manager | `RoleGuard` | Specific report type |
| `/activity` | `Activity` | super_admin, manager | `RoleGuard` | Activity audit log |
| `/access-control` | `AccessControl` | super_admin only | `RoleGuard` | Permission management |
| `/admin/staff` | `AdminStaffDirectory` | super_admin only | `RoleGuard` | Staff directory |
| `/settings` | `Settings` | super_admin, manager | `RoleGuard` | System settings |
| `/map` | `MapPage` | super_admin, manager | `RoleGuard` | Geographic store view |
| `/customers` | `Customers` | super_admin, manager, agent, marketer | `RoleGuard` | Customer management |
| `/customers/:id` | `CustomerDetail` | super_admin, manager, agent, marketer | `RoleGuard` | Customer details |
| `/stores` | `Stores` | super_admin, manager, agent, marketer | `RoleGuard` | Store management |
| `/stores/:id` | `StoreDetail` | super_admin, manager, agent, marketer | `RoleGuard` | Store details |
| `/store-types` | `StoreTypes` | super_admin, manager | `RoleGuard` | Store type configuration |
| `/store-types/access` | `StoreTypeAccess` | super_admin, manager | `RoleGuard` | Store type permissions |
| `/routes` | `RoutesPage` | super_admin, manager, agent | `RoleGuard` | Route planning |
| `/routes/:id` | `RouteDetail` | super_admin, manager, agent | `RoleGuard` | Route details |
| `/sales` | `Sales` | super_admin, manager, agent, pos | `RoleGuard` | Sales records |
| `/sale-returns` | `SaleReturns` | super_admin, manager | `RoleGuard` | Process sale returns |
| `/transactions` | `Transactions` | super_admin, manager, agent, marketer | `RoleGuard` | Payment transactions |
| `/purchase-returns` | `PurchaseReturns` | super_admin, manager | `RoleGuard` | Purchase return processing |
| `/orders` | `Orders` | super_admin, manager, agent, marketer | `RoleGuard` | Order management |
| `/handovers` | `Handovers` | All Staff | `RoleGuard` | Cash handover records |
| `/stock-transfers` | `StockTransfers` | super_admin, manager, agent, marketer | `RoleGuard` | Stock transfer management |
| `/portal/sales` | `CustomerSales` | customer | `RoleGuard` | Customer view of sales |
| `/portal/orders` | `CustomerOrders` | customer | `RoleGuard` | Customer order placement |
| `/portal/transactions` | `CustomerTransactions` | customer | `RoleGuard` | Customer transaction history |
| `/portal/profile` | `CustomerProfile` | customer | `RoleGuard` | Customer profile |

### Mobile Routes (src/mobile/MobileApp.tsx)

Mobile app uses tab-based navigation instead of routes. Routes are handled by the `MobileApp` component which renders role-specific tab layouts:

| Role | Entry Point | Tab Structure |
|------|-------------|---------------|
| `agent` | `AgentApp` | BottomNav with AGENT_TABS |
| `marketer` | `MarketerApp` | BottomNav with MARKETER_TABS |
| `pos` | `PosApp` | BottomNav with POS_TABS |
| `customer` | `CustomerApp` | BottomNav with CUSTOMER_TABS |
| `super_admin`, `manager` | `StaffApp` | Sidebar navigation (same as web) |

---

## Pages by Role

### Super Admin Pages

**Full System Access - All pages accessible**

#### Dashboard & Overview
- **Page**: `Dashboard`
  - **Path**: `/`
  - **Component**: `src/pages/Dashboard.tsx`
  - **Key Components**: `StatCard`, `PageHeader`, `QuickActionDrawer`, Recharts charts
  - **Actions**: View business overview, quick actions

#### Product & Inventory Management
- **Page**: `Products`
  - **Path**: `/products`
  - **Component**: `src/pages/Products.tsx`
  - **Key Components**: `DataTable`, product CRUD dialogs
  - **Actions**: Create, edit, delete products; manage pricing

- **Page**: `Inventory`
  - **Path**: `/inventory`
  - **Component**: `src/pages/Inventory.tsx`
  - **Key Components**: `DataTable`, stock adjustment dialogs
  - **Actions**: View stock levels, adjust inventory

- **Page**: `RawMaterials`
  - **Path**: `/raw-materials`
  - **Component**: `src/pages/RawMaterials.tsx`
  - **Actions**: Manage raw material inventory

#### Customer & Store Management
- **Page**: `Customers`
  - **Path**: `/customers`
  - **Component**: `src/pages/Customers.tsx`
  - **Key Components**: `DataTable`, `CsvImportDialog`, customer forms
  - **Actions**: Add/edit customers, bulk import, view customer list

- **Page**: `CustomerDetail`
  - **Path**: `/customers/:id`
  - **Component**: `src/pages/CustomerDetail.tsx`
  - **Key Components**: Customer profile, store list, transaction history
  - **Actions**: View customer details, manage stores

- **Page**: `Stores`
  - **Path**: `/stores`
  - **Component**: `src/pages/Stores.tsx`
  - **Key Components**: `DataTable`, `CreateStoreWizard`, `StoreLedger`
  - **Actions**: Create stores, view store details, manage outstanding

- **Page**: `StoreDetail`
  - **Path**: `/stores/:id`
  - **Component**: `src/pages/StoreDetail.tsx`
  - **Key Components**: Store profile, sales history, transaction history
  - **Actions**: Edit store, view history, record transactions

- **Page**: `StoreTypes`
  - **Path**: `/store-types`
  - **Component**: `src/pages/StoreTypes.tsx`
  - **Key Components**: Store type CRUD, product access matrix
  - **Actions**: Configure store types, set product access

- **Page**: `StoreTypeAccess`
  - **Path**: `/store-types/access`
  - **Component**: `src/pages/StoreTypeAccess.tsx`
  - **Key Components**: `StoreTypeAccessMatrix`
  - **Actions**: Manage which products each store type can access

#### Sales & Transactions
- **Page**: `Sales`
  - **Path**: `/sales`
  - **Component**: `src/pages/Sales.tsx`
  - **Key Components**: `DataTable`, `SaleReceipt`, `SaleReturnDialog`, `OrderFulfillmentDialog`
  - **Actions**: Record sales, view all sales, process returns, fulfill orders

- **Page**: `Transactions`
  - **Path**: `/transactions`
  - **Component**: `src/pages/Transactions.tsx`
  - **Key Components**: `DataTable`, payment recording forms
  - **Actions**: Record payments, view transaction history

- **Page**: `SaleReturns`
  - **Path**: `/sale-returns`
  - **Component**: `src/pages/SaleReturns.tsx`
  - **Key Components**: `SalesReturnReport`, return processing
  - **Actions**: Process and view sale returns

#### Route Management
- **Page**: `RoutesPage`
  - **Path**: `/routes`
  - **Component**: `src/pages/Routes.tsx`
  - **Key Components**: `DataTable`, `RouteOptimizer`, route assignment
  - **Actions**: Create routes, assign to agents, optimize routes

- **Page**: `RouteDetail`
  - **Path**: `/routes/:id`
  - **Component**: `src/pages/RouteDetail.tsx`
  - **Key Components**: Route map, store list, session tracking
  - **Actions**: View route details, manage stores in route

#### Vendor & Purchase Management
- **Page**: `Vendors`
  - **Path**: `/vendors`
  - **Component**: `src/pages/Vendors.tsx`
  - **Key Components**: Vendor CRUD, vendor list
  - **Actions**: Add/edit vendors

- **Page**: `VendorDetail`
  - **Path**: `/vendors/:id`
  - **Component**: `src/pages/VendorDetail.tsx`
  - **Key Components**: Vendor profile, purchase history
  - **Actions**: View vendor details, manage purchases

- **Page**: `Purchases`
  - **Path**: `/purchases`
  - **Component**: `src/pages/Purchases.tsx`
  - **Key Components**: Purchase recording, inventory update
  - **Actions**: Record purchases from vendors

- **Page**: `VendorPayments`
  - **Path**: `/vendor-payments`
  - **Component**: `src/pages/VendorPayments.tsx`
  - **Key Components**: Payment recording, vendor ledger
  - **Actions**: Record vendor payments

- **Page**: `PurchaseReturns`
  - **Path**: `/purchase-returns`
  - **Component**: `src/pages/PurchaseReturns.tsx`
  - **Actions**: Process purchase returns

#### Orders & Handovers
- **Page**: `Orders`
  - **Path**: `/orders`
  - **Component**: `src/pages/Orders.tsx`
  - **Key Components**: Order management, fulfillment tracking
  - **Actions**: View orders, manage fulfillment

- **Page**: `Handovers`
  - **Path**: `/handovers`
  - **Component**: `src/pages/Handovers.tsx`
  - **Key Components**: Handover recording, cash reconciliation
  - **Actions**: Record cash handovers, view handover history

#### Reports & Analytics
- **Page**: `Reports`
  - **Path**: `/reports`, `/reports/:type`
  - **Component**: `src/pages/Reports.tsx`
  - **Key Components**: `ReportContainer`, `SalesReport`, `PurchaseReport`, `StockSummaryReport`, `ProfitLossReport`, etc.
  - **Actions**: Generate various reports, export data

- **Page**: `Analytics`
  - **Path**: `/analytics`
  - **Component**: `src/pages/Analytics.tsx`
  - **Key Components**: Charts, KPIs, trend analysis
  - **Actions**: View business analytics, charts

#### Admin & System
- **Page**: `AccessControl`
  - **Path**: `/access-control`
  - **Component**: `src/pages/AccessControl.tsx`
  - **Key Components**: `UserPermissionsPanel`, permission matrix
  - **Actions**: Manage user permissions, role assignments

- **Page**: `AdminStaffDirectory`
  - **Path**: `/admin/staff`
  - **Component**: `src/pages/AdminStaffDirectory.tsx`
  - **Key Components**: Staff list, invitation dialog
  - **Actions**: Invite staff, manage user roles

- **Page**: `Activity`
  - **Path**: `/activity`
  - **Component**: `src/pages/Activity.tsx`
  - **Key Components**: Activity log table, audit trail
  - **Actions**: View system activity logs

- **Page**: `Attendance`
  - **Path**: `/attendance`
  - **Component**: `src/pages/Attendance.tsx`
  - **Key Components**: Attendance tracking, reports
  - **Actions**: Record attendance, view reports

- **Page**: `Expenses`
  - **Path**: `/expenses`
  - **Component**: `src/pages/Expenses.tsx`
  - **Key Components**: Expense recording, categorization
  - **Actions**: Record expenses, view expense reports

- **Page**: `Banners`
  - **Path**: `/banners`
  - **Component**: `src/pages/Banners.tsx`
  - **Key Components**: Banner management, image upload
  - **Actions**: Manage marketing banners

- **Page**: `Settings`
  - **Path**: `/settings`
  - **Component**: `src/pages/Settings.tsx`
  - **Key Components**: `WarehouseManagement`, `PricingTab`, `SmsGatewayTab`
  - **Actions**: Configure system settings, warehouses, SMS gateway

- **Page**: `MapPage`
  - **Path**: `/map`
  - **Component**: `src/pages/MapPage.tsx`
  - **Key Components**: Interactive map, store markers
  - **Actions**: View stores on map, plan routes

#### Invoicing
- **Page**: `Invoices`
  - **Path**: `/invoices`
  - **Component**: `src/pages/Invoices.tsx`
  - **Key Components**: Invoice list, generation
  - **Actions**: Create, view invoices

- **Page**: `InvoiceForm`
  - **Path**: `/invoices/new`
  - **Component**: `src/pages/InvoiceForm.tsx`
  - **Key Components**: Invoice creation form
  - **Actions**: Generate new invoices

- **Page**: `InvoiceView`
  - **Path**: `/invoices/:id`, `/invoices/:id/print`
  - **Component**: `src/pages/InvoiceView.tsx`
  - **Key Components**: Invoice display, print layout
  - **Actions**: View and print invoices

#### Stock Transfers
- **Page**: `StockTransfers`
  - **Path**: `/stock-transfers`
  - **Component**: `src/pages/StockTransfers.tsx`
  - **Key Components**: Transfer creation, stock movement tracking
  - **Actions**: Create stock transfers between warehouses

---

### Manager Pages

**Same access as Super Admin except:**
- ❌ `/access-control` (Permission management) - NOT accessible
- ❌ `/admin/staff` (Staff directory/invitations) - NOT accessible

All other pages and actions identical to Super Admin.

---

### Agent Pages

**Field Sales Role - Mobile-Optimized**

#### Web Interface Pages
- **Page**: `AgentDashboard`
  - **Path**: `/`
  - **Component**: `src/pages/AgentDashboard.tsx`
  - **Key Components**: `StatCard`, `RouteSessionPanel`, `QuickActionDrawer`
  - **Actions**: View daily stats, stores covered, sales recorded, handoverable amounts

- **Page**: `Customers` (scoped)
  - **Path**: `/customers`
  - **Component**: `src/pages/Customers.tsx` (filtered by route/store-type access)
  - **Key Components**: `DataTable`, filtered customer list
  - **Actions**: View assigned customers only

- **Page**: `CustomerDetail` (scoped)
  - **Path**: `/customers/:id`
  - **Component**: `src/pages/CustomerDetail.tsx`
  - **Actions**: View customer details (if in scope)

- **Page**: `Stores` (scoped)
  - **Path**: `/stores`
  - **Component**: `src/pages/Stores.tsx` (filtered)
  - **Key Components**: Store list with route/store-type filtering
  - **Actions**: View assigned stores

- **Page**: `StoreDetail` (scoped)
  - **Path**: `/stores/:id`
  - **Component**: `src/pages/StoreDetail.tsx`
  - **Actions**: View store details, record transactions

- **Page**: `Routes` (scoped)
  - **Path**: `/routes`
  - **Component**: `src/pages/Routes.tsx` (filtered)
  - **Actions**: View assigned routes

- **Page**: `RouteDetail` (scoped)
  - **Path**: `/routes/:id`
  - **Component**: `src/pages/RouteDetail.tsx`
  - **Key Components**: `RouteSessionPanel`
  - **Actions**: View route, start/end sessions, mark visits

- **Page**: `Sales` (own records)
  - **Path**: `/sales`
  - **Component**: `src/pages/Sales.tsx`
  - **Key Components**: `DataTable`, sale recording dialog
  - **Actions**: Record sales, view own sales history

- **Page**: `Transactions` (own records)
  - **Path**: `/transactions`
  - **Component**: `src/pages/Transactions.tsx`
  - **Actions**: Record payments, view own transactions

- **Page**: `Orders` (scoped)
  - **Path**: `/orders`
  - **Component**: `src/pages/Orders.tsx`
  - **Actions**: View and manage orders for assigned stores

- **Page**: `Handovers`
  - **Path**: `/handovers`
  - **Component**: `src/pages/Handovers.tsx`
  - **Actions**: Record cash handovers

- **Page**: `StockTransfers` (scoped)
  - **Path**: `/stock-transfers`
  - **Component**: `src/pages/StockTransfers.tsx`
  - **Actions**: View/create stock transfers for assigned stores

#### Mobile Interface Pages (src/mobile/pages/agent/)

- **Page**: `AgentHome`
  - **Component**: `src/mobile/pages/agent/AgentHome.tsx`
  - **Key Components**: Revenue cards, route progress, next store navigation
  - **Actions**: View daily summary, navigate to stores, mark visits

- **Page**: `AgentRoutes`
  - **Component**: `src/mobile/pages/agent/AgentRoutes.tsx`
  - **Key Components**: Route list, session management
  - **Actions**: Start/end route sessions, view route stores

- **Page**: `AgentScan`
  - **Component**: `src/mobile/pages/agent/AgentScan.tsx`
  - **Key Components**: QR scanner, store selector
  - **Actions**: Scan store QR code, select store for recording

- **Page**: `AgentRecord`
  - **Component**: `src/mobile/pages/agent/AgentRecord.tsx`
  - **Key Components**: `RecordSale`, `RecordPayment`, `StorePickerSheet`
  - **Actions**: Record sales (with products), record payments, offline queue support

- **Page**: `AgentHistory`
  - **Component**: `src/mobile/pages/agent/AgentHistory.tsx`
  - **Key Components**: Sales and transaction history list
  - **Actions**: View today's activity, receipt viewing

- **Page**: `AgentCustomers`
  - **Component**: `src/mobile/pages/agent/AgentCustomers.tsx`
  - **Key Components**: Store list, search/filter
  - **Actions**: Browse stores, open store profile, go to record

- **Page**: `AgentStoreProfile`
  - **Component**: `src/mobile/pages/agent/AgentStoreProfile.tsx`
  - **Key Components**: Store details, outstanding display, quick actions
  - **Actions**: View store info, initiate sale/payment

- **Page**: `AgentProducts`
  - **Component**: `src/mobile/pages/agent/AgentProducts.tsx`
  - **Key Components**: Product catalog, pricing display
  - **Actions**: View available products and prices

- **Page**: `AddCustomerStore`
  - **Component**: `src/mobile/pages/agent/AddCustomerStore.tsx`
  - **Key Components**: Customer/store creation form
  - **Actions**: Add new customer and store while on field

#### Mobile Tabs (AGENT_TABS)
```typescript
[
  { id: "home", label: "Home", icon: Home },
  { id: "routes", label: "Routes", icon: Map },
  { id: "scan", label: "Scan", icon: ScanLine, centerAction: true },
  { id: "customers", label: "Stores", icon: Users },
  { id: "approvals", label: "Approvals", icon: CheckSquare }
]
```

---

### Marketer Pages

**Order-Taking Role - Limited Sales Access**

#### Web Interface Pages
- **Page**: `MarketerDashboard`
  - **Path**: `/`
  - **Component**: `src/pages/MarketerDashboard.tsx`
  - **Key Components**: Order-focused dashboard
  - **Actions**: View order metrics, customer outreach stats

- **Page**: `Customers` (scoped)
  - **Path**: `/customers`
  - **Component**: `src/pages/Customers.tsx` (filtered)
  - **Actions**: View assigned customers

- **Page**: `CustomerDetail` (scoped)
  - **Path**: `/customers/:id`
  - **Component**: `src/pages/CustomerDetail.tsx`
  - **Actions**: View customer details

- **Page**: `Stores` (scoped)
  - **Path**: `/stores`
  - **Component**: `src/pages/Stores.tsx` (filtered)
  - **Actions**: View assigned stores

- **Page**: `StoreDetail` (scoped)
  - **Path**: `/stores/:id`
  - **Component**: `src/pages/StoreDetail.tsx`
  - **Actions**: View store, place orders

- **Page**: `Orders` (scoped)
  - **Path**: `/orders`
  - **Component**: `src/pages/Orders.tsx`
  - **Actions**: Create and manage orders

- **Page**: `Transactions` (own records)
  - **Path**: `/transactions`
  - **Component**: `src/pages/Transactions.tsx`
  - **Actions**: Record collections (payments only)

- **Page**: `Handovers`
  - **Path**: `/handovers`
  - **Component**: `src/pages/Handovers.tsx`
  - **Actions**: Record handovers

- **Page**: `StockTransfers` (scoped)
  - **Path**: `/stock-transfers`
  - **Component**: `src/pages/StockTransfers.tsx`
  - **Actions**: View/create transfers

#### Mobile Interface Pages (src/mobile/pages/marketer/)

- **Page**: `MarketerHome`
  - **Component**: `src/mobile/pages/marketer/MarketerHome.tsx`
  - **Key Components**: Order metrics, quick record action
  - **Actions**: View daily summary, access order/recording functions

- **Page**: `MarketerOrders`
  - **Component**: `src/mobile/pages/marketer/MarketerOrders.tsx`
  - **Key Components**: Order list, order creation
  - **Actions**: Create orders, view order history

- **Page**: `MarketerStores`
  - **Component**: `src/mobile/pages/marketer/MarketerStores.tsx`
  - **Key Components**: Store list with outreach status
  - **Actions**: Browse stores, mark outreach

- **Page**: `MarketerStoreProfile`
  - **Component**: `src/mobile/pages/marketer/MarketerStoreProfile.tsx`
  - **Key Components**: Store details, order history
  - **Actions**: View store, place order, record payment

#### Mobile Tabs (MARKETER_TABS)
```typescript
[
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "record", label: "Record", icon: ReceiptIndianRupee, centerAction: true },
  { id: "customers", label: "Stores", icon: Users },
  { id: "history", label: "History", icon: History }
]
```

**Note**: Marketer `record` tab uses `AgentRecord` with `allowSale={false}`, so only payment recording is allowed.

---

### POS (Point of Sale) Pages

**Counter Sales Role - Minimal Access**

#### Web Interface Pages
- **Page**: `PosDashboard`
  - **Path**: `/`
  - **Component**: `src/pages/PosDashboard.tsx`
  - **Key Components**: Quick sale recording, daily totals
  - **Actions**: View counter sales metrics

- **Page**: `Sales` (POS counter only)
  - **Path**: `/sales`
  - **Component**: `src/pages/Sales.tsx`
  - **Key Components**: Simplified sale recording (locked to POS store)
  - **Actions**: Record cash-and-carry sales (full payment required, no outstanding)

- **Page**: `Handovers`
  - **Path**: `/handovers`
  - **Component**: `src/pages/Handovers.tsx`
  - **Actions**: Record end-of-shift cash handovers

#### Mobile Interface Pages (src/mobile/pages/pos/)

- **Page**: `PosHome`
  - **Component**: `src/mobile/pages/pos/PosHome.tsx`
  - **Key Components**: Quick sale button, daily summary
  - **Actions**: View today's sales, quick access to recording

#### Mobile Tabs (POS_TABS)
```typescript
[
  { id: "home", label: "Home", icon: Home },
  { id: "record", label: "Sale", icon: ScanLine, centerAction: true },
  { id: "handovers", label: "Handover", icon: HandCoins },
  { id: "history", label: "History", icon: History }
]
```

**Note**: POS `record` tab uses `AgentRecord` with `allowPayment={false}`, so only sale recording is allowed.

---

### Customer Pages

**Self-Service Portal - Customer-Facing**

#### Web Interface Pages (Customer Portal)
- **Page**: `CustomerPortal`
  - **Path**: `/`
  - **Component**: `src/pages/CustomerPortal.tsx`
  - **Key Components**: Customer dashboard, store selector
  - **Actions**: View own stores, outstanding balance, recent activity

- **Page**: `CustomerSales`
  - **Path**: `/portal/sales`
  - **Component**: `src/pages/CustomerSales.tsx`
  - **Key Components**: Sales history table
  - **Actions**: View sales history for linked stores

- **Page**: `CustomerOrders`
  - **Path**: `/portal/orders`
  - **Component**: `src/pages/CustomerOrders.tsx`
  - **Key Components**: Order placement form, order history
  - **Actions**: Place new orders, view order status

- **Page**: `CustomerTransactions`
  - **Path**: `/portal/transactions`
  - **Component**: `src/pages/CustomerTransactions.tsx`
  - **Key Components**: Transaction ledger
  - **Actions**: View payment history, outstanding details

- **Page**: `CustomerProfile`
  - **Path**: `/portal/profile`
  - **Component**: `src/pages/CustomerProfile.tsx`
  - **Key Components**: Profile form, KYC upload
  - **Actions**: Update profile, upload KYC documents

#### Mobile Interface Pages (src/mobile/pages/customer/)

- **Page**: `CustomerHome`
  - **Component**: `src/mobile/pages/customer/CustomerHome.tsx`
  - **Key Components**: Store selector, outstanding display, recent sales
  - **Actions**: Select store, view outstanding, browse recent activity

- **Page**: `CustomerSales`
  - **Component**: `src/mobile/pages/customer/CustomerSales.tsx`
  - **Actions**: View sales history

- **Page**: `CustomerOrders`
  - **Component**: `src/mobile/pages/customer/CustomerOrders.tsx`
  - **Key Components**: Order creation, order list
  - **Actions**: Place orders, view order status

- **Page**: `CustomerTransactions`
  - **Component**: `src/mobile/pages/customer/CustomerTransactions.tsx`
  - **Actions**: View transaction history

- **Page**: `CustomerProfile`
  - **Component**: `src/mobile/pages/customer/CustomerProfile.tsx`
  - **Key Components**: Profile editing, KYC upload
  - **Actions**: Update profile, manage KYC documents

- **Page**: `CustomerKyc`
  - **Component**: `src/mobile/pages/customer/CustomerKyc.tsx`
  - **Key Components**: Document upload interface
  - **Actions**: Upload KYC documents

#### Mobile Tabs (CUSTOMER_TABS)
```typescript
[
  { id: "home", label: "Home", icon: Home },
  { id: "sales", label: "Sales", icon: ClipboardList },
  { id: "orders", label: "Order", icon: Plus, centerAction: true },
  { id: "transactions", label: "Ledger", icon: ReceiptIndianRupee },
  { id: "profile", label: "Profile", icon: Users }
]
```

---

## Component Hierarchy

### Layout Components

```
App (src/App.tsx)
├── AuthProvider (src/contexts/AuthContext.tsx)
├── WarehouseProvider (src/contexts/WarehouseContext.tsx)
├── BrowserRouter
│   ├── Suspense (with PageLoader)
│   │   └── Routes
│   │       ├── /auth → Auth
│   │       ├── /onboarding → Onboarding
│   │       ├── /reset-password → ResetPassword
│   │       └── /* → ProtectedRoute
│   │           └── isNativeApp() ?
│   │               ├── MobileAppV2 (APK mode)
│   │               └── AppLayout (Web mode)
│   │                   └── Outlet
│   │                       └── RoleRoute
│   │                           ├── Dashboard (super_admin, manager)
│   │                           ├── AgentDashboard (agent)
│   │                           ├── MarketerDashboard (marketer)
│   │                           ├── PosDashboard (pos)
│   │                           └── CustomerPortal (customer)
```

### Mobile App Structure

```
MobileApp (src/mobile/MobileApp.tsx)
├── ProtectedRoute
│   └── Role-based App Component:
│       ├── StaffApp (super_admin, manager)
│       │   ├── MobileHeader
│       │   ├── Sheet (Navigation Drawer)
│       │   └── renderCurrentScreen()
│       │       └── Returns web pages or mobile admin pages
│       ├── AgentApp (agent)
│       │   ├── MobileHeader
│       │   ├── Main Content (tab-based)
│       │   └── BottomNav (AGENT_TABS)
│       ├── MarketerApp (marketer)
│       │   ├── MobileHeader
│       │   ├── Main Content (tab-based)
│       │   └── BottomNav (MARKETER_TABS)
│       ├── PosApp (pos)
│       │   ├── MobileHeader
│       │   ├── Main Content (tab-based)
│       │   └── BottomNav (POS_TABS)
│       └── CustomerApp (customer)
│           ├── MobileHeader
│           ├── Main Content (tab-based)
│           └── BottomNav (CUSTOMER_TABS)
```

### Key Shared Components by Domain

#### Data Display Components
- `DataTable` (`src/components/shared/DataTable.tsx`) - Universal table with sorting, filtering, pagination
- `VirtualDataTable` (`src/components/shared/VirtualDataTable.tsx`) - Virtualized table for large datasets
- `StatCard` (`src/components/shared/StatCard.tsx`) - Metric display card
- `PageHeader` (`src/components/shared/PageHeader.tsx`) - Page title with actions
- `StatusBadge` (`src/components/shared/StatusBadge.tsx`) - Status indicator

#### Form Components (shadcn/ui)
Located in `src/components/ui/`:
- `button`, `input`, `select`, `dialog`, `sheet`, `popover`, `calendar`
- `table`, `badge`, `avatar`, `card`, `tabs`, `toast`

#### Sales & Transaction Components
- `SaleReceipt` (`src/components/shared/SaleReceipt.tsx`) - Receipt display/print
- `SaleReturnDialog` (`src/components/sales/SaleReturnDialog.tsx`) - Return processing
- `OrderFulfillmentDialog` (`src/components/orders/OrderFulfillmentDialog.tsx`) - Order to sale conversion
- `QrStoreSelector` (`src/components/shared/QrStoreSelector.tsx`) - QR code store selection

#### Route & Location Components
- `RouteOptimizer` (`src/components/shared/RouteOptimizer.tsx`) - Route optimization
- `RouteSessionPanel` (`src/components/routes/RouteSessionPanel.tsx`) - Active route management

#### Store Components
- `CreateStoreWizard` (`src/components/stores/CreateStoreWizard.tsx`) - Multi-step store creation
- `StoreLedger` (`src/components/stores/StoreLedger.tsx`) - Store transaction history
- `StorePickerSheet` (`src/mobile/components/StorePickerSheet.tsx`) - Mobile store selection

#### Report Components
Located in `src/components/reports/`:
- `ReportContainer`, `SalesReport`, `PurchaseReport`, `StockSummaryReport`
- `ProfitLossReport`, `SalesReturnReport`, `PurchaseReturnReport`
- `VendorReport`, `SmartInsightsReport`

#### Settings Components
- `WarehouseManagement` (`src/components/settings/WarehouseManagement.tsx`)
- `PricingTab` (`src/components/settings/PricingTab.tsx`)
- `SmsGatewayTab` (`src/components/settings/SmsGatewayTab.tsx`)

#### Auth Components
- `ProtectedRoute` (`src/components/auth/ProtectedRoute.tsx`) - Authentication guard
- `RoleGuard` (`src/components/auth/RoleGuard.tsx`) - Role-based access
- `RoleRoute` (`src/components/auth/RoleRoute.tsx`) - Dashboard routing by role

#### Layout Components
- `AppLayout` (`src/components/layout/AppLayout.tsx`) - Web sidebar layout
- `AppSidebar` (`src/components/layout/AppSidebar.tsx`) - Navigation sidebar
- `TopBar` (`src/components/layout/TopBar.tsx`) - Header bar
- `MobileHeader` (`src/mobile/components/MobileHeader.tsx`) - Mobile app header
- `BottomNav` (`src/mobile/components/BottomNav.tsx`) - Mobile bottom navigation

---

## Navigation Configuration

### Web Sidebar Navigation (src/components/layout/AppSidebar.tsx)

Defined in `NAV_BY_ROLE` constant:

**Super Admin Navigation:**
- Main: Dashboard, Inventory, Customers, Vendors, Stores, Routes, Orders, Invoices, Sales, Transactions, Purchases, Vendor Payments, Expenses, Attendance, Handovers, Stock Transfers, Map, Banners
- Secondary: Reports (with sub-menu), Analytics, Activity Log, Access Control, Staff Directory, Settings

**Manager Navigation:**
- Main: Same as Super Admin
- Secondary: Reports, Analytics, Activity Log, Settings (no Access Control or Staff Directory)

**Agent Navigation:**
- Main: Dashboard, Customers, Stores, Routes, Sales, Transactions, Orders, Handovers, Stock Transfers
- Secondary: (none)

**Marketer Navigation:**
- Main: Dashboard, Customers, Stores, Orders, Transactions, Handovers, Stock Transfers
- Secondary: (none)

**POS Navigation:**
- Main: Dashboard, Sales, Handovers
- Secondary: (none)

**Customer Navigation:**
- Main: Dashboard, Sales, Orders, Transactions, Profile
- (Uses separate customerNav array)

---

## File Organization

### Page File Locations

```
src/
├── pages/                    # Web pages
│   ├── Dashboard.tsx
│   ├── AgentDashboard.tsx
│   ├── MarketerDashboard.tsx
│   ├── PosDashboard.tsx
│   ├── CustomerPortal.tsx
│   ├── Auth.tsx
│   ├── NotFound.tsx
│   ├── Products.tsx
│   ├── Customers.tsx
│   ├── CustomerDetail.tsx
│   ├── Stores.tsx
│   ├── StoreDetail.tsx
│   ├── Routes.tsx
│   ├── RouteDetail.tsx
│   ├── Sales.tsx
│   ├── Transactions.tsx
│   ├── Orders.tsx
│   ├── Handovers.tsx
│   ├── Reports.tsx
│   ├── Analytics.tsx
│   ├── Inventory.tsx
│   ├── Vendors.tsx
│   ├── VendorDetail.tsx
│   ├── Purchases.tsx
│   ├── VendorPayments.tsx
│   ├── RawMaterials.tsx
│   ├── Invoices.tsx
│   ├── InvoiceForm.tsx
│   ├── InvoiceView.tsx
│   ├── Attendance.tsx
│   ├── Banners.tsx
│   ├── Activity.tsx
│   ├── AccessControl.tsx
│   ├── AdminStaffDirectory.tsx
│   ├── Settings.tsx
│   ├── StoreTypes.tsx
│   ├── StoreTypeAccess.tsx
│   ├── MapPage.tsx
│   ├── SaleReturns.tsx
│   ├── PurchaseReturns.tsx
│   ├── StockTransfers.tsx
│   ├── Expenses.tsx
│   ├── UserProfile.tsx
│   ├── Onboarding.tsx
│   ├── ResetPassword.tsx
│   ├── CustomerSales.tsx
│   ├── CustomerOrders.tsx
│   ├── CustomerTransactions.tsx
│   ├── CustomerProfile.tsx
│   ├── Index.tsx
│   ├── Receipts.tsx
│   ├── StaffProfile.tsx
│   └── admin/                 # Admin-specific pages
│       ├── AuditLogDashboard.tsx
│       └── ReconciliationDashboard.tsx
│
└── mobile/
    └── pages/                 # Mobile-specific pages
        ├── agent/
        │   ├── AgentHome.tsx
        │   ├── AgentRoutes.tsx
        │   ├── AgentScan.tsx
        │   ├── AgentRecord.tsx
        │   ├── AgentHistory.tsx
        │   ├── AgentCustomers.tsx
        │   ├── AgentStoreProfile.tsx
        │   ├── AgentProducts.tsx
        │   └── AddCustomerStore.tsx
        ├── marketer/
        │   ├── MarketerHome.tsx
        │   ├── MarketerOrders.tsx
        │   ├── MarketerStores.tsx
        │   └── MarketerStoreProfile.tsx
        ├── customer/
        │   ├── CustomerHome.tsx
        │   ├── CustomerSales.tsx
        │   ├── CustomerOrders.tsx
        │   ├── CustomerTransactions.tsx
        │   ├── CustomerProfile.tsx
        │   └── CustomerKyc.tsx
        ├── pos/
        │   └── PosHome.tsx
        ├── admin/
        │   ├── AdminHome.tsx
        │   ├── AdminSales.tsx
        │   ├── AdminOrders.tsx
        │   ├── AdminCustomers.tsx
        │   ├── AdminStores.tsx
        │   ├── AdminProducts.tsx
        │   ├── AdminTransactions.tsx
        │   ├── AdminHandovers.tsx
        │   ├── AdminRoutes.tsx
        │   ├── AdminProfile.tsx
        │   └── AdminSettings.tsx
        └── Approvals.tsx
```

---

## Access Control Matrix

| Feature | super_admin | manager | agent | marketer | pos | customer |
|---------|-------------|---------|-------|----------|-----|----------|
| **Dashboard** | Full | Full | Agent | Marketer | POS | Customer Portal |
| **Products** | CRUD | CRUD | View | View | - | - |
| **Inventory** | Full | Full | - | - | - | - |
| **Customers** | CRUD | CRUD | Scoped View | Scoped View | - | Own only |
| **Stores** | CRUD | CRUD | Scoped CRUD | Scoped View | POS only | Own only |
| **Routes** | CRUD | CRUD | Scoped | - | - | - |
| **Sales** | All | All | Own + Scoped | - | POS only | View own |
| **Transactions** | All | All | Own | Own | - | View own |
| **Orders** | All | All | Scoped | Scoped | - | Create/View |
| **Handovers** | All | All | Own | Own | Own | - |
| **Reports** | All | All | - | - | - | - |
| **Analytics** | All | All | - | - | - | - |
| **Invoices** | CRUD | CRUD | - | - | - | View |
| **Purchases** | CRUD | CRUD | - | - | - | - |
| **Vendors** | CRUD | CRUD | - | - | - | - |
| **Access Control** | Full | - | - | - | - | - |
| **Staff Directory** | Full | - | - | - | - | - |
| **Settings** | Full | Partial | - | - | - | Profile only |

**Scoped Access**: Agents, marketers have access limited by:
- Route assignment (`agent_routes` table)
- Store type access (`agent_store_types` table)
- Record ownership (can only see/edit own sales/transactions)

---

## Key Implementation Notes

1. **Role Scoping**: Agent/Marketer access is controlled by `useRouteAccess` hook which checks `agent_routes` and `agent_store_types` tables

2. **Mobile Tab Structure**: Each role has its own tab configuration in `BottomNav.tsx`:
   - `AGENT_TABS`: home, routes, scan, customers, approvals
   - `MARKETER_TABS`: home, orders, record, customers, history
   - `POS_TABS`: home, record, handovers, history
   - `CUSTOMER_TABS`: home, sales, orders, transactions, profile

3. **Shared Recording Interface**: `AgentRecord` component is reused across Agent, Marketer, and POS roles with feature flags (`allowSale`, `allowPayment`)

4. **Offline Support**: Mobile sales and visits support offline queueing via `offlineQueue.ts`

5. **Proximity Validation**: Agent sales enforce GPS proximity checks when `company_settings.location_validation` is enabled

---

*Page structure audit completed: 2026-04-12*
