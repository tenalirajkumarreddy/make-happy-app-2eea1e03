# BizManager Page Actions & Elements Audit
## Comprehensive Analysis of Every Page, Component, Button, and Action

**Audit Date:** 2026-04-12
**Version:** 1.0
**Purpose:** Document every page, route, role access, UI elements, actions, and data flows for change management

---

## 📋 Table of Contents
1. [Route Summary](#route-summary)
2. [Super Admin Pages](#super-admin-pages)
3. [Manager Pages](#manager-pages)
4. [Agent Pages](#agent-pages)
5. [Marketer Pages](#marketer-pages)
6. [POS Pages](#pos-pages)
7. [Customer Pages](#customer-pages)
8. [Shared/Common Pages](#sharedcommon-pages)
9. [Mobile-Only Pages](#mobile-only-pages)

---

## Route Summary

### Web Routes (App.tsx)

| Path | Component | Allowed Roles | Guard | Description |
|------|-----------|---------------|-------|-------------|
| `/auth` | Auth | Public | None | Login/OTP screen |
| `/onboarding` | Onboarding | Public | None | New user onboarding |
| `/reset-password` | ResetPassword | Public | None | Password reset |
| `/` | DashboardRouter | All | RoleRoute | Role-based dashboard redirect |
| `/products` | Products | super_admin, manager | RoleGuard | Product management |
| `/inventory` | Inventory | super_admin, manager | RoleGuard | Stock management |
| `/vendors` | Vendors | super_admin, manager | RoleGuard | Vendor directory |
| `/vendors/:id` | VendorDetail | super_admin, manager | RoleGuard | Vendor details |
| `/purchases` | Purchases | super_admin, manager | RoleGuard | Purchase orders |
| `/vendor-payments` | VendorPayments | super_admin, manager | RoleGuard | Payment tracking |
| `/raw-materials` | RawMaterials | super_admin, manager | RoleGuard | Material inventory |
| `/invoices` | Invoices | super_admin, manager | RoleGuard | Invoice list |
| `/invoices/new` | InvoiceForm | super_admin, manager | RoleGuard | Create invoice |
| `/invoices/:id` | InvoiceView | super_admin, manager | RoleGuard | View invoice |
| `/attendance` | Attendance | super_admin, manager | RoleGuard | Staff attendance |
| `/expenses` | Expenses | super_admin, manager | RoleGuard | Expense claims |
| `/banners` | Banners | super_admin, manager | RoleGuard | Banner management |
| `/analytics` | Analytics | super_admin, manager | RoleGuard | Business analytics |
| `/reports` | Reports | super_admin, manager | RoleGuard | Reports hub |
| `/reports/:type` | Reports | super_admin, manager | RoleGuard | Specific report |
| `/activity` | Activity | super_admin, manager | RoleGuard | Activity logs |
| `/access-control` | AccessControl | super_admin | RoleGuard | Permission management |
| `/admin/staff` | AdminStaffDirectory | super_admin | RoleGuard | Staff management |
| `/settings` | Settings | super_admin, manager | RoleGuard | App settings |
| `/map` | MapPage | super_admin, manager | RoleGuard | Store map view |
| `/customers` | Customers | super_admin, manager, agent, marketer | RoleGuard | Customer list |
| `/customers/:id` | CustomerDetail | super_admin, manager, agent, marketer | RoleGuard | Customer details |
| `/stores` | Stores | super_admin, manager, agent, marketer | RoleGuard | Store directory |
| `/stores/:id` | StoreDetail | super_admin, manager, agent, marketer | RoleGuard | Store details |
| `/store-types` | StoreTypes | super_admin, manager | RoleGuard | Store categorization |
| `/store-types/access` | StoreTypeAccess | super_admin, manager | RoleGuard | Type permissions |
| `/routes` | RoutesPage | super_admin, manager, agent | RoleGuard | Route management |
| `/routes/:id` | RouteDetail | super_admin, manager, agent | RoleGuard | Route details |
| `/sales` | Sales | super_admin, manager, agent, pos | RoleGuard | Sales recording/list |
| `/sale-returns` | SaleReturns | super_admin, manager | RoleGuard | Process returns |
| `/transactions` | Transactions | super_admin, manager, agent, marketer | RoleGuard | Collections |
| `/purchase-returns` | PurchaseReturns | super_admin, manager | RoleGuard | Purchase returns |
| `/orders` | Orders | super_admin, manager, agent, marketer | RoleGuard | Order management |
| `/handovers` | Handovers | super_admin, manager, agent, marketer, pos | RoleGuard | Cash handover |
| `/stock-transfers` | StockTransfers | super_admin, manager, agent, marketer | RoleGuard | Stock movements |
| `/profile` | UserProfile | All authenticated | Protected | User profile |
| `/portal/sales` | CustomerSales | customer | RoleGuard | Customer order history |
| `/portal/orders` | CustomerOrders | customer | RoleGuard | Customer orders |
| `/portal/transactions` | CustomerTransactions | customer | RoleGuard | Customer payments |
| `/portal/profile` | CustomerProfile | customer | RoleGuard | Customer profile |
| `/receipts` | Receipts | All | Protected | Receipt history |

---

## Super Admin Pages

### 1. Access Control (`/access-control`)
**Component:** `AccessControl.tsx` (25KB)

#### Purpose
Manage role-based permissions and access control for all users

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Permission Matrix | Table | Grid of roles vs permissions |
| Role Selector | Dropdown | Select role to edit |
| Permission Toggle | Switch | Enable/disable permission |
| Save Button | Button | Save changes |
| Reset Button | Button | Reset to defaults |

#### Actions Available
1. **View Permission Matrix**
   - Triggers: Page load
   - Data Flow: `user_roles` → permission calculations
   - Dependencies: `usePermissions()` hook

2. **Toggle Permission**
   - Button: Switch toggle
   - Triggers: Click
   - Data Flow: Update `role_permissions` table
   - Validation: Check if user has `manage_permissions`

3. **Save Changes**
   - Button: "Save Changes" (primary)
   - Triggers: Click
   - API Call: `update_role_permissions()` RPC
   - Success: Toast notification + invalidate cache

#### Data Dependencies
```typescript
- Tables: user_roles, role_permissions, permissions
- Hooks: usePermissions(), useAuth()
- Realtime: role_permissions changes
```

#### Permission Requirements
```typescript
const requiredPermissions = ['manage_permissions', 'super_admin_access'];
```

---

### 2. Admin Staff Directory (`/admin/staff`)
**Component:** `AdminStaffDirectory.tsx` (23KB)

#### Purpose
Manage all staff members, roles, and assignments

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Staff Table | Data Grid | List of all staff |
| Add Staff Button | Button | Open invite dialog |
| Role Filter | Dropdown | Filter by role |
| Warehouse Filter | Dropdown | Filter by warehouse |
| Search Input | Text | Search by name/email |
| Edit Button | Icon | Edit staff details |
| Deactivate Button | Icon | Disable account |
| Export Button | Button | Export to CSV |

#### Actions Available
1. **Invite Staff**
   - Button: "Invite Staff" (primary)
   - Dialog: Opens invitation form
   - Fields: Email, Phone, Role, Warehouse
   - API: `invite-staff` Edge Function
   - Validation: Email format, phone format

2. **Edit Staff**
   - Button: Edit icon
   - Dialog: Staff edit form
   - Fields: Name, Role, Warehouse, Status
   - API: Update `user_roles` table
   - Validation: Role hierarchy check

3. **Deactivate Staff**
   - Button: Deactivate icon
   - Confirmation: "Are you sure?"
   - API: Soft delete (set `is_active = false`)
   - Side Effects: Revoke sessions, notify user

4. **Filter/Search**
   - Input: Search text
   - Debounce: 300ms
   - Data Flow: Client-side filter on cached data

#### Data Dependencies
```typescript
- Tables: auth.users, user_roles, warehouses
- Hooks: useStaff(), useWarehouses()
- Edge Functions: invite-staff
```

---

### 3. Analytics (`/analytics`)
**Component:** `Analytics.tsx` (32KB)

#### Purpose
Business intelligence dashboard with charts and metrics

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Date Range Picker | DateRange | Select period |
| KPI Cards | Cards | Key metrics display |
| Sales Chart | LineChart | Sales trend |
| Revenue Chart | BarChart | Revenue by category |
| Store Map | Map | Store locations |
| Download Button | Button | Export reports |
| Refresh Button | Icon | Refresh data |

#### Actions Available
1. **Change Date Range**
   - Input: Date range picker
   - Triggers: Selection change
   - Data Flow: Refetch all queries with new params
   - Cache: Invalidate existing cache

2. **View Metric Details**
   - Click: KPI card
   - Navigation: To detailed report
   - Data: Drill-down data

3. **Export Report**
   - Button: "Export"
   - Format: CSV/Excel
   - API: Generate downloadable file
   - Loading: Spinner during generation

#### Data Dependencies
```typescript
- Tables: sales, transactions, stores, customers
- Hooks: useAnalytics(), useReports()
- Time range: Default last 30 days
```

---

## Manager Pages

### 1. Products (`/products`)
**Component:** `Products.tsx` (26KB)

#### Purpose
Product catalog management

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Product Grid | Grid | Product cards |
| Add Button | FAB/Button | Add product |
| Category Filter | Chips | Filter by category |
| Search Bar | Input | Search products |
| Sort Dropdown | Select | Sort by price/name |
| Bulk Actions | Toolbar | Select multiple |
| Image Upload | Dropzone | Product images |

#### Actions Available
1. **Add Product**
   - Button: "Add Product"
   - Dialog: Product form
   - Fields: Name, SKU, Price, Category, Stock, Images
   - API: Insert into `products` table
   - Validation: SKU uniqueness, price > 0

2. **Edit Product**
   - Click: Product card
   - Dialog: Edit form
   - Fields: All editable
   - API: Update `products` table
   - Side Effects: Update `sale_items` references

3. **Delete Product**
   - Button: Delete icon
   - Confirmation: Required
   - API: Soft delete
   - Validation: Check no active sales

4. **Bulk Operations** (Phase 4)
   - Select: Checkbox on cards
   - Actions: Update price, category, status
   - API: `bulk_update_prices()` RPC
   - Progress: Progress dialog

#### Data Dependencies
```typescript
- Tables: products, categories, product_images
- Hooks: useProducts(), useCategories()
- Storage: product-images bucket
```

---

### 2. Inventory (`/inventory`)
**Component:** `Inventory.tsx` (Enhanced - 85KB)

#### Purpose
Comprehensive stock management system with staff inventory, warehouse control, POS integration, products, and raw materials

#### UI Structure (Tab-Based)
| Tab | Visible To | Description |
|-----|------------|-------------|
| **My Stock** | Agent, Marketer, Manager | Personal inventory with value tracking |
| **Warehouse** | Manager, Super Admin | Central warehouse stock management |
| **Products** | Manager, Super Admin | Product catalog with inventory |
| **Raw Materials** | Manager, Super Admin | Raw materials with vendor integration |

#### My Stock Tab Elements (Staff Inventory)
| Element | Type | Description |
|---------|------|-------------|
| Summary Cards | Cards | Total products, quantity, value |
| Product List | Cards | Staff inventory items with images |
| Value Display | Text | Amount value per product |
| Last Sale | Badge | Last sale timestamp |
| Last Received | Badge | Last received timestamp |
| Adjust Button | Button | Adjust own stock |

#### Warehouse Tab Elements
| Element | Type | Description |
|---------|------|-------------|
| Warehouse Selector | Dropdown | Select warehouse |
| Summary Cards | Cards | Total products, stock, allocated, available |
| Stock Table | Data Grid | Products with stock levels |
| Allocation Columns | Text | Allocated to staff vs available |
| Transfer Button | Icon | Transfer to staff |
| Adjust Button | Icon | Adjust warehouse stock |
| History Button | Icon | View movement history |

#### Actions Available

**1. View My Stock (Staff)**
- Load: Staff inventory summary cards
- Display: Product cards with images, quantity, value
- Summary: Total products, total quantity, total value
- API: `get_staff_inventory_summary()` RPC
- Auto-calculated: amount_value based on product prices

**2. Transfer Stock to Staff**
- Button: "Transfer" (Warehouse view)
- Dialog: Staff selection, quantity input
- Fields: Staff, Quantity, Notes
- Validation: Check warehouse availability
- API: `transfer_stock_to_staff()` RPC
- Side Effects:
  - Deduct from warehouse
  - Add to staff stock
  - Update amount_value
  - Log movement

**3. Adjust Stock**
- Button: "Adjust"
- Dialog: Adjustment type, quantity, reason
- Types: Addition (+) or Deduction (-)
- Reasons: Damaged, Expired, Lost, Found, Correction, etc.
- API: `adjust_stock()` RPC
- Side Effects: Log movement with reason

**4. View Stock History**
- Button: "History"
- Dialog: Timeline of movements
- Filters: By type, date range
- Export: CSV export option
- API: `get_stock_history()` RPC

**5. POS Sale (from Warehouse)**
- Context: POS sales automatically deduct from warehouse
- Validation: Mandatory payment (Cash/UPI)
- Flow: Sale → Deduct warehouse → No outstanding
- API: `deduct_sale_stock()` trigger

**6. Raw Material Purchase**
- Context: Raw material purchase increases vendor balance
- API: `record_vendor_purchase()` RPC
- Side Effects:
  - Increase vendor balance
  - Add raw material stock
  - Create purchase record

**7. Vendor Payment**
- Context: Record payment to vendor
- API: `record_vendor_payment()` RPC
- Validation: Payment <= vendor balance
- Side Effects: Decrease vendor balance

#### Data Dependencies
```typescript
// Staff Inventory
- Tables: staff_stock (with amount_value), products
- Hooks: useStaffStock(), useStaffInventorySummary()
- RPCs: get_staff_inventory_summary(), calculate_staff_inventory_value()

// Warehouse Management
- Tables: product_stock, staff_stock, warehouses
- Hooks: useWarehouseStock(), useStockTransfer()
- RPCs: transfer_stock_to_staff(), adjust_stock()

// Stock Movements
- Tables: stock_movements (enhanced with location tracking)
- Hooks: useStockHistory()
- RPCs: get_stock_history(), record_stock_movement()

// Vendor Integration
- Tables: vendors (with balance), vendor_transactions
- Hooks: useVendorBalance(), useVendorTransactions()
- RPCs: record_vendor_purchase(), record_vendor_payment(), get_vendor_balance()

// POS Integration
- Tables: pos_stores, sales (with pos_store_id)
- Triggers: deduct_sale_stock(), validate_pos_sale()
- Functions: get_sale_stock_source()
```

#### Business Rules
```typescript
const inventoryRules = {
  // Staff Inventory
  staffStockDeduct: "Auto-deduct on sale via trigger",
  valueCalculation: "quantity × product.base_price",
  valueUpdate: "Auto on stock change via trigger",
  
  // Warehouse Transfers
  transferValidation: "Must have sufficient warehouse stock",
  transferUpdate: "Deduct warehouse, add staff, log movement",
  
  // POS Sales
  posSource: "Warehouse stock (not staff)",
  posPayment: "Mandatory - Cash or UPI only",
  posOutstanding: "0 - No credit allowed",
  
  // Adjustments
  adjustmentReason: "Required",
  adjustmentTypes: ["addition", "deduction"],
  auditTrail: "Logged in stock_movements",
  
  // Vendor
  purchaseIncreasesBalance: true,
  paymentDecreasesBalance: true,
  validation: "Payment <= current_balance"
};
```

---

### 3. Sales (`/sales`)
**Component:** `Sales.tsx` (52KB)

#### Purpose
Record and view sales

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Store Selector | Autocomplete | Select store |
| Product List | Searchable | Add items |
| Quantity Input | Number | Item quantity |
| Payment Split | Inputs | Cash + UPI |
| Outstanding Display | Text | Current balance |
| Submit Button | Button | Record sale |
| Receipt Preview | Card | Sale summary |

#### Actions Available
1. **Record Sale**
   - Button: "Record Sale"
   - Validation: Store selected, items added
   - API: `record_sale()` RPC (atomic)
   - Side Effects:
     - Deduct stock (trigger)
     - Update store outstanding
     - Generate receipt
     - Log audit trail

2. **Check Stock**
   - Automatic: Before submit
   - API: `check_stock_availability()` RPC
   - Display: Warning if insufficient

3. **Process Return**
   - Button: "Return" (on existing sale)
   - Dialog: Return form
   - API: `process_sale_return()` RPC
   - Validation: Within return window

4. **View Receipt**
   - Click: Receipt icon
   - Display: PDF receipt
   - Actions: Download, Email, Print

#### Data Dependencies
```typescript
- Tables: sales, sale_items, stores, products, receipts
- RPCs: record_sale, check_stock_availability
- Hooks: useSales(), useStockCheck()
- Triggers: stock_deduction_on_sale
```

#### Business Rules
```typescript
const rules = {
  maxOutstanding: (store) => store.credit_limit,
  returnWindow: 7, // days
  stockCheck: true, // Required before sale
  paymentValidation: (cash, upi, total) => cash + upi === total
};
```

---

### 4. Customers (`/customers`)
**Component:** `Customers.tsx` (30KB)

#### Purpose
Customer management and directory

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Customer Table | Data Grid | List of customers |
| Add Button | Button | Add customer |
| Import Button | Button | Bulk import |
| Filter Panel | Collapsible | Advanced filters |
| KYC Status | Badge | Verification status |
| Outstanding | Column | Balance display |

#### Actions Available
1. **Add Customer**
   - Button: "Add Customer"
   - Dialog: Customer form
   - Fields: Name, Phone, Email, Address, GST
   - API: Insert `customers`
   - Validation: Phone unique

2. **View Customer**
   - Click: Row
   - Navigation: `/customers/:id`
   - Display: Full profile

3. **Import Customers**
   - Button: "Import"
   - Upload: CSV file
   - Validation: Format check
   - API: Bulk insert
   - Report: Success/failure list

4. **Send Reminder**
   - Button: Bell icon
   - API: Send outstanding reminder
   - Channels: SMS, Push, Email

#### Data Dependencies
```typescript
- Tables: customers, stores, sales
- Hooks: useCustomers(), useCustomerStats()
- Edge Functions: send-otp-opensms
```

---

## Agent Pages

### 1. Agent Dashboard
**Component:** `AgentDashboard.tsx` (8KB)

#### Purpose
Agent's daily work overview

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Today's Route | Card | Assigned route |
| Visit Progress | Progress | Stores visited/total |
| Quick Actions | Buttons | Scan, Record, View |
| Outstanding | Card | Total to collect |
| Recent Sales | List | Last 5 sales |

#### Actions Available
1. **Start Route**
   - Button: "Start Route"
   - Navigation: `/routes/:id`
   - GPS: Track location

2. **Quick Record**
   - Button: "Record Sale"
   - Navigation: `/sales`
   - Shortcut: Pre-selects current store

3. **Scan Store**
   - Button: "Scan"
   - Feature: QR/Barcode scan
   - Result: Load store profile

---

### 2. Routes (`/routes`)
**Component:** `RoutesPage.tsx` (9KB)

#### Purpose
View and manage assigned routes

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Route List | Cards | Today's routes |
| Map View | Toggle | Map vs list |
| Store Sequence | List | Ordered stores |
| Visit Status | Checkbox | Mark visited |
| Optimization Button | Button | Optimize order |

#### Actions Available
1. **View Route**
   - Click: Route card
   - Navigation: `/routes/:id`
   - Display: Full route details

2. **Mark Visited**
   - Checkbox: Store row
   - API: Update `route_stores`
   - GPS: Capture location
   - Timestamp: Record visit time

3. **Optimize Route**
   - Button: "Optimize"
   - API: `optimize_route()` RPC
   - Algorithm: Nearest neighbor/TSP
   - Result: Reordered store list

4. **Record Visit Note**
   - Button: Note icon
   - Dialog: Text input
   - API: Update `store_visits`

#### Data Dependencies
```typescript
- Tables: routes, route_stores, stores, route_sessions
- Hooks: useRoutes(), useRouteSession()
- GPS: location_pings table
```

---

### 3. Mobile Agent Record (`/agent/record`)
**Component:** `AgentRecord.tsx` (mobile)

#### Purpose
Mobile-optimized sale recording

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Store Selector | Dropdown | Select store |
| Product Grid | Grid | Quick select |
| Cart Display | Panel | Selected items |
| Camera Button | FAB | Scan barcode |
| Submit Button | Button | Record sale |

#### Actions Available
1. **Scan Barcode**
   - Button: Camera FAB
   - API: Camera/Barcode scanner
   - Result: Auto-add product

2. **Quick Add Product**
   - Tap: Product tile
   - Increment: Quantity +1
   - Long Press: Quantity dialog

3. **Record Sale (Mobile)**
   - Button: "Record"
   - Offline: Queue if no connection
   - API: `record_sale()` RPC
   - Sync: Auto-sync when online

#### Data Dependencies
```typescript
- Tables: sales, sale_items, staff_stock
- Hooks: useOfflineQueue(), useOnlineStatus()
- Storage: IndexedDB offline queue
```

---

## Marketer Pages

### 1. Marketer Dashboard
**Component:** `MarketerDashboard.tsx` (3KB)

#### Purpose
Marketer's work dashboard

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Orders Pipeline | Kanban | Order stages |
| Stores Assigned | Card | Store count |
| Performance | Chart | Conversion rate |
| Quick Actions | Buttons | Create order, View stores |

#### Actions Available
1. **Create Order**
   - Button: "New Order"
   - Navigation: `/orders`
   - Form: Order creation

2. **View Pipeline**
   - Display: Kanban board
   - Drag: Move orders
   - API: Update order status

---

## POS Pages

### 1. POS Dashboard
**Component:** `PosDashboard.tsx` (3KB)

#### Purpose
Point-of-sale interface

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Product Grid | Grid | Quick select |
| Calculator | Panel | Price calculation |
| Cart Display | Sidebar | Current items |
| Payment Buttons | Buttons | Cash/UPI/Card |
| Print Receipt | Button | Receipt printer |

#### Actions Available
1. **Quick Sale**
   - Tap: Product
   - Auto: Add to cart
   - Flow: Faster than agent flow

2. **Process Payment**
   - Button: Payment type
   - Cash: Drawer opens
   - UPI: QR code display
   - Card: External terminal

3. **Print Receipt**
   - Button: Print
   - API: Thermal printer
   - Fallback: Digital receipt

---

## Customer Pages

### 1. Customer Portal (`/portal/*`)
**Component:** `CustomerPortal.tsx` (8KB)

#### Purpose
Customer self-service portal

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Order History | Table | Past orders |
| Outstanding | Card | Amount due |
| Pay Button | Button | Make payment |
| Download Invoice | Button | Get invoice |
| Support Chat | Widget | Customer support |

#### Actions Available
1. **View Orders**
   - Navigation: `/portal/orders`
   - Display: Order details
   - Actions: Reorder, Cancel (if pending)

2. **Make Payment**
   - Button: "Pay Now"
   - Integration: Razorpay/Stripe
   - API: `record_transaction()` RPC
   - Receipt: Auto-generated

3. **Update Profile**
   - Navigation: `/portal/profile`
   - Form: KYC documents
   - Upload: ID proof, Address proof

#### Data Dependencies
```typescript
- Tables: sales, transactions, customers, kyc_documents
- Hooks: useCustomerSales(), useCustomerOrders()
- Storage: kyc-documents bucket
```

---

## Shared/Common Pages

### 1. Profile (`/profile`)
**Component:** `UserProfile.tsx` (4KB)

#### Purpose
User profile management

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Avatar | Image | Profile photo |
| Name Input | Text | Full name |
| Phone Display | Text | Read-only |
| Email Input | Text | Email address |
| Password Change | Button | Reset password |
| Notifications | Toggle | Push/SMS preferences |

#### Actions Available
1. **Update Profile**
   - Button: "Save"
   - API: Update `auth.users`
   - Validation: Email format

2. **Change Password**
   - Flow: Reset password email
   - Security: Requires re-auth

3. **Upload Avatar**
   - Click: Avatar image
   - Upload: Image file
   - Resize: Auto-crop to square

---

### 2. Auth (`/auth`)
**Component:** `Auth.tsx` (22KB)

#### Purpose
Authentication flows

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Phone Input | Input | Mobile number |
| OTP Input | Input | 6-digit code |
| Send OTP Button | Button | Trigger SMS |
| Verify Button | Button | Verify code |
| Resend Timer | Text | Countdown 60s |
| Role Selector | Dropdown | Select role (first login) |

#### Actions Available
1. **Send OTP**
   - Button: "Send OTP"
   - API: `send-otp-opensms` Edge Function
   - Rate Limit: 3 per 10 minutes
   - UI: Show countdown timer

2. **Verify OTP**
   - Input: 6-digit code
   - API: `verify-otp-opensms` Edge Function
   - Success: Exchange for Supabase token
   - Error: Show "Invalid code"

3. **Select Role**
   - Dropdown: Available roles
   - API: Insert `user_roles`
   - Redirect: Role-based dashboard

---

## Mobile-Only Pages

### 1. Agent Home (Mobile)
**Component:** `AgentHome.tsx`

#### Purpose
Mobile agent dashboard

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Bottom Nav | Tabs | Home, Routes, Record, History |
| Today's Summary | Cards | Sales, Visits, Collections |
| Quick Actions | FABs | Scan, Add Store |

### 2. Scanner (`/agent/scan`)
**Component:** `AgentScan.tsx`

#### Purpose
Barcode/QR code scanning

#### Actions
1. **Scan Code**
   - Camera: Barcode scanner
   - Result: Lookup product/store
   - Action: Auto-navigate

### 3. Customer Home (Mobile)
**Component:** `CustomerHome.tsx`

#### Purpose
Mobile customer portal

#### UI Elements
| Element | Type | Description |
|---------|------|-------------|
| Outstanding | Card | Amount due |
| Recent Orders | List | Last 3 orders |
| Pay Button | FAB | Quick payment |
| Support | Button | Contact support |

---

## Action Permissions Matrix

### Button-Level Permissions

| Action | super_admin | manager | agent | marketer | pos | customer |
|--------|-------------|---------|-------|----------|-----|----------|
| **Sales** |
| Record Sale | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| View All Sales | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Edit Sale | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Process Return | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Customers** |
| Add Customer | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit Customer | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Customer | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (own) |
| Delete Customer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Stores** |
| Add Store | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit Store | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign to Route | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Inventory** |
| View Stock | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Transfer Stock | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Adjust Stock | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Staff** |
| Invite Staff | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Staff | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports** |
| View Analytics | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export Reports | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Settings** |
| App Settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Profile Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Data Flow Summary

### Sale Recording Flow
```
User Action: Click "Record Sale"
  ↓
Validation: Stock check, Outstanding limit
  ↓
API: record_sale() RPC
  ↓
Database Triggers:
  - stock_deduction_on_sale
  - audit_log_insert
  - update_store_outstanding
  ↓
Side Effects:
  - Generate receipt
  - Update analytics
  - Send notifications
  ↓
UI: Show success + receipt preview
```

### Handover Flow
```
User Action: Click "Create Handover"
  ↓
API: create_handover() RPC (server-side calc)
  ↓
Calculation: Sum of today's sales
  ↓
Insert: handovers table
  ↓
Notification: Send to recipient
  ↓
UI: Show handover details
```

### Offline Sale Flow
```
User Action: Record sale (no connection)
  ↓
Queue: Add to offlineQueue (IndexedDB)
  ↓
Context: Capture current prices, limits
  ↓
Sync: When connection restored
  ↓
Validation: Re-check context
  ↓
Conflict: If mismatch, show resolver
  ↓
Success: Remove from queue
```

---

## Dependencies & Relationships

### Page Dependencies
| Page | Depends On | Tables | Hooks |
|------|------------|--------|-------|
| Sales | Inventory | sales, sale_items, products, stores | useSales, useStock |
| Inventory | Products | staff_stock, stock_movements, products | useStock |
| Customers | Sales | customers, stores, sales | useCustomers |
| Handovers | Sales | handovers, sales | useHandovers |
| Reports | All | All reporting tables | useReports |

### Component Dependencies
| Component | Uses | Shared With |
|-----------|------|-------------|
| SaleReceipt | Sales, Receipts | Sales, CustomerPortal |
| StoreSelector | Stores | Sales, AgentRecord |
| ProductGrid | Products | Sales, POS, Inventory |
| PaymentInputs | Transactions | Sales, Transactions |

---

## Change Management Guide

### When Adding a New Button
1. **Add to Permission Matrix**: Update table above
2. **Update RoleGuard**: Check `allowed` prop in App.tsx
3. **Add to Audit Trail**: If action modifies data
4. **Update Tests**: Add to E2E tests

### When Modifying a Flow
1. **Document Change**: Update this audit
2. **Check Dependencies**: Review dependent pages
3. **Update Realtime**: Check subscription keys
4. **Test All Roles**: Verify access control

### When Adding a New Page
1. **Add Route**: In App.tsx with RoleGuard
2. **Add to Navigation**: Update sidebar/menu
3. **Document Here**: Add section above
4. **Set Permissions**: Define who can access

---

## Audit Checklist

### Quarterly Review
- [ ] Verify all routes still exist
- [ ] Check permission matrix accuracy
- [ ] Review data flow diagrams
- [ ] Update screenshots if UI changed
- [ ] Test all CRUD operations
- [ ] Verify edge cases

### Before Major Release
- [ ] Cross-reference with PR changes
- [ ] Update user documentation
- [ ] Train support team on changes
- [ ] Prepare rollback plan

---

*This audit is a living document. Update it whenever pages, permissions, or flows change.*
*Last updated: 2026-04-12*
*Maintainer: Development Team*
