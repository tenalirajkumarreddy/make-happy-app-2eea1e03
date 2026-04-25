# BizManager - Complete Action Inventory & User Flows

**Generated:** 2025-01-25  
**Version:** 1.0  
**Purpose:** Comprehensive reference for all user actions, data flows, and system behaviors

---

## Table of Contents

1. [Overview](#overview)
2. [Role Definitions](#role-definitions)
3. [Complete Page Inventory (94 Pages)](#complete-page-inventory)
4. [Core Operational Pages](#core-operational-pages)
5. [Inventory & Stock Pages](#inventory--stock-pages)
6. [Master Data Pages](#master-data-pages)
7. [Admin & Reporting Pages](#admin--reporting-pages)
8. [Mobile-Specific Pages](#mobile-specific-pages)
9. [Record Sale - End-to-End Flow](#record-sale---end-to-end-flow)
10. [Data Reflection Matrix](#data-reflection-matrix)
11. [Error Scenarios](#error-scenarios)

---

## Overview

The BizManager app is a multi-role sales/route/collections management system with:

- **Web interface** (React + Vite + TypeScript)
- **Mobile APK interface** (Capacitor-based native UI)
- **Roles:** `super_admin`, `manager`, `agent`, `marketer`, `pos`, `customer`
- **Total Pages:** 94
- **Total Actions:** 500+

---

## Role Definitions

| Role | Description | Key Capabilities |
|------|-------------|----------------|
| **super_admin** | Full system access | All permissions, staff management, system configuration |
| **manager** | Warehouse management | All operations within assigned warehouse(s) |
| **agent** | Field sales | Record sales, collect payments, route visits |
| **marketer** | Order management | Create orders, manage customers |
| **pos** | Point of sale | Record sales for specific store, no outstanding allowed |
| **customer** | Self-service portal | View own data, place orders |

### Permission System

50 permissions across 7 categories:
- Orders (view, create, modify, transfer, fulfill, cancel, delete)
- Invoices (view, create, edit, delete, download)
- Sales & Pricing (price_override, record_behalf, edit_balance, etc.)
- Customers & Stores (create_customers, create_stores)
- Vendors & Purchases (view_vendors, manage_vendors, etc.)
- Attendance (view_attendance, manage_attendance)
- Other (submit_expenses)

---

## Complete Page Inventory

### Page Count by Location

| Location | Count |
|----------|-------|
| `src/pages/` | 68 pages |
| `src/mobile/pages/agent/` | 9 pages |
| `src/mobile/pages/admin/` | 6 pages |
| `src/mobile/pages/marketer/` | 4 pages |
| `src/mobile/pages/customer/` | 6 pages |
| `src/mobile/pages/pos/` | 1 page |
| **Total** | **94 pages** |

---

## Core Operational Pages

### 1. SALES PAGE (`/sales`)

**Available Roles:** `super_admin`, `manager`, `agent`, `pos`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Record Sale** | All roles with `canRecordSale` | Opens sale form | - | - |
| **Store Selector** | All | Pick store | - | Shows store's outstanding balance |
| **Add Product** | All | Add item to cart | - | Calculates running total |
| **Set Quantity** | All | +/- quantity | - | Updates item total |
| **Price Override** | `price_override` perm | Edit unit price | - | Recalculates with custom price |
| **Cash Input** | All | Enter cash amount | - | Updates outstanding calc |
| **UPI Input** | All | Enter UPI amount | - | Updates outstanding calc |
| **Credit Limit Check** | Auto | Validates limit | - | Shows warning if exceeded |
| **Proximity Check** | `agent` role only | GPS validation | - | Blocks if too far |
| **Stock Check** | Auto | Validates availability | - | Blocks if insufficient |
| **Save Sale** | All | Submits sale | `sales`, `sale_items`, `stores.outstanding`, `product_stock` | See full flow below |
| **Export CSV** | All | Download data | - | File download |
| **Print Receipt** | All | Generate receipt | - | Print dialog |
| **View Sale Detail** | All | Expand row | - | Shows items, amounts |
| **Delete Sale** | `delete_sales` perm | Remove sale | Soft delete | Updates all related totals |

**Sale Record Form Fields:**
- Store selector (locked to POS store for POS users)
- Product items (with quantity & price)
- Cash amount
- UPI amount
- Outstanding calculation
- Credit limit validation
- Proximity check (for agents)
- Stock availability check

---

### 2. ORDERS PAGE (`/orders`)

**Available Roles:** `super_admin`, `manager`, `agent`, `marketer`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Create Simple Order** | `create_orders` perm | Text-only order | `orders` | Notification to admins |
| **Create Detailed Order** | `create_orders` perm | Product list order | `orders`, `order_items` | Notification to admins |
| **Assign Order** | `transfer_orders` perm | Change assignee | `orders.assigned_to` | Notification to new assignee |
| **Fulfill Order** | `fulfill_orders` perm | Convert to sale | `orders.status='delivered'`, creates `sales` | Removes from pending |
| **Cancel Order** | `cancel_orders` perm | Cancel with reason | `orders.status='cancelled'` | Removes from active |
| **Edit Order** | `modify_orders` perm | Modify pending | Updates `orders`/`order_items` | Updates totals |
| **Generate Proforma** | `view_invoices` perm | Create estimate | `invoices` | - |
| **Export Orders** | All | CSV download | - | File download |

**Order Types:**
- **Simple:** Text requirement only
- **Detailed:** Product list with quantities

**Status Flow:** `pending` → `confirmed` → `delivered` (or `cancelled`)

---

### 3. TRANSACTIONS PAGE (`/transactions`)

**Available Roles:** `super_admin`, `manager`, `agent`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Record Payment** | All | Log collection | `transactions`, `stores.outstanding` (decreased) | Notifications, reports updated |
| **Cash Input** | All | Enter cash amount | - | - |
| **UPI Input** | All | Enter UPI amount | - | - |
| **Transaction Date** | All | Optional backdate | - | - |
| **View History** | All | List view | - | Shows all transactions |
| **Export CSV** | All | Download data | - | File download |

---

### 4. HANDOVERS PAGE (`/handovers`)

**Available Roles:** `super_admin`, `manager`, `agent`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Create Handover** | Non-finalizer staff | Send money to staff | `handovers` | Notification to recipient |
| **Confirm Handover** | Recipient | Accept transfer | `handovers.status='confirmed'` | Updates both balances |
| **Reject Handover** | Recipient | Decline transfer | `handovers.status='rejected'` | Reverts to sender |
| **Cancel Handover** | Sender | Cancel pending | `handovers.status='cancelled'` | Removes from pending |
| **Admin Transfer** | `transfer_between_staff` perm | Transfer any staff | Uses RPC `admin_transfer_between_staff` | Updates balances |
| **Submit Expense** | All staff | Add expense claim | `expense_claims` | Admin notification |
| **Approve Expense** | `manage_expenses` perm | Approve claim | Updates `expense_claims.status` | Deducts from handover |

**Handover Status:** `awaiting_confirmation` → `confirmed` | `rejected` | `cancelled`

---

## Inventory & Stock Pages

### 5. INVENTORY PAGE (`/inventory`)

**Available Roles:** `super_admin`, `manager`, `pos`, `agent` (view only)

| Tab | Description | Actions |
|-----|-------------|---------|
| **Stock** | Warehouse product stock | View, search, adjust stock, transfer |
| **Staff Holdings** | Products held by staff | View staff stock levels |
| **Raw Materials** | Production materials | View, manage raw material stock |
| **History** | Stock movement log | Review transfers, adjustments, returns |

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Adjust Stock** | `canAdjustStock` | Add/remove stock | `stock_movements` | Updates `product_stock` |
| **Transfer Stock** | Based on type | Move between locations | `stock_transfers` | Adjusts source/target stock |
| **Review Returns** | `canReviewReturns` | Process returns | Updates `stock_transfers.status` | Adjusts stock |
| **View History** | All | Movement log | Reads `stock_movements` | Audit trail |

**Transfer Types:**
- `warehouse_to_staff`
- `staff_to_warehouse`
- `staff_to_staff`
- `warehouse_to_warehouse`

---

### 6. PRODUCTS PAGE (`/products`)

**Available Roles:** `super_admin`, `manager`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Add Product** | All | Create product | `products` | Available for sales |
| **Edit Product** | All | Update details/pricing | `products` | Updates future sales |
| **Toggle Active** | All | Activate/deactivate | `is_active` | Shows/hides in catalog |
| **Bulk Activate** | All | Activate multiple | Multiple records | - |
| **Bulk Deactivate** | All | Deactivate multiple | Multiple records | - |
| **Manage Categories** | All | Product categories | `product_categories` | - |
| **Product Access Matrix** | All | Store type permissions | `store_type_products` | Controls visibility |

**Product Fields:** name, SKU, base_price, unit, category, description, image_url, HSN code, GST rate

---

## Master Data Pages

### 7. CUSTOMERS PAGE (`/customers`)

**Available Roles:** `super_admin`, `manager`, `agent`

| Action | Who Can See | What Happens | Data Changes | Offline |
|--------|-------------|--------------|--------------|---------|
| **Add Customer** | All | Create profile | `customers` | Queued if offline |
| **Bulk Import** | All | CSV import | Bulk inserts | - |
| **Edit Customer** | All | Update details | `customers` | - |
| **Bulk Edit** | All | Edit multiple | Bulk updates | - |
| **Bulk Deactivate** | All | Deactivate | `is_active` | - |
| **Review KYC** | Admin only | Approve/reject | `kyc_status` | Updates credit limit |
| **View Ledger** | All | Transaction history | Reads `transactions` | - |

**Customer Fields:** display_id, name, phone, email, address, photo_url, kyc_status, credit_limit

---

### 8. STORES PAGE (`/stores`)

**Available Roles:** `super_admin`, `manager`, `agent`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Add Store** | All | Create store | `stores` | Available for sales |
| **Import CSV** | All | Bulk creation | Bulk inserts | - |
| **Set Pricing** | All | Store-specific prices | `store_pricing` | Overrides base price |
| **Bulk Edit** | All | Edit name/phone | Bulk updates | - |
| **Bulk Assign Route** | All | Assign to routes | `route_id` | Route optimization |
| **View Detail** | All | Store profile | - | Shows all store data |

**Store Fields:** name, display_id, customer_id, store_type_id, route_id, phone, address, lat, lng, outstanding, photo_url

---

### 9. ROUTES PAGE (`/routes`)

**Available Roles:** `super_admin`, `manager`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Create Route** | All | New delivery route | `routes` | - |
| **Edit Route** | All | Modify details | `routes` | - |
| **Assign Stores** | All | Add stores | `stores.route_id` | Route sequence |
| **Set Store Order** | All | Sequence stops | `store_order` | Navigation order |

---

## Admin & Reporting Pages

### 10. REPORTS PAGE (`/reports`)

**Available Roles:** `super_admin`, `manager`

| Report Type | Description | Data Source |
|-------------|-------------|-------------|
| Sales Report | Date-range sales | `sales` |
| Collection Report | Payment collections | `transactions` |
| Outstanding Report | Store balances | `stores` |
| Inventory Report | Stock levels | `product_stock` |
| Route Report | Route performance | `routes`, `sales` |
| Staff Report | Staff activity | `sales`, `handovers` |

| Action | Description |
|--------|-------------|
| Generate | Create report |
| Export CSV | Download data |
| Print | Print report |

---

### 11. ACCESS CONTROL PAGE (`/access-control`)

**Available Roles:** `super_admin` only

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Manage Permissions** | Super admin | Role permissions | `role_permissions` | Affects all users |
| **Route Access Matrix** | Super admin | Store/route restrictions | `route_access_matrix` | Data visibility |
| **Set Credit Limits** | Super admin | Per-store-type limits | `store_types.credit_limit_*` | Sale validation |

---

### 12. STAFF DIRECTORY (`/staff`)

**Available Roles:** `super_admin`, `manager`

| Action | Who Can See | What Happens | Data Changes | Reflections |
|--------|-------------|--------------|--------------|-------------|
| **Invite Staff** | Super admin | Send invitation | `staff_invitations` | Email sent |
| **Edit Staff** | Super admin | Update role | `user_roles` | Permission changes |
| **Deactivate** | Super admin | Disable account | `profiles.is_active` | Cannot login |
| **View Profile** | All | Staff details | - | - |

---

## Mobile-Specific Pages

### 13. AGENT HOME (Mobile)

**Role:** `agent` only

| Section | Actions | Data Changes | Reflections |
|---------|---------|--------------|-------------|
| **Stats** | View today's revenue, cash, UPI | - | Reads `sales`, `transactions` |
| **Active Route** | See route progress | - | Shows next store |
| **Next Stop** | Navigate, call, mark visited, record sale/payment | - | Route actions |
| **Quick Actions** | Product Catalog, Add Customer/Store | - | Navigation |
| **Pending Orders** | View orders on route | - | Route orders |

| Action | Description | Data Changes | Reflections |
|--------|-------------|--------------|-------------|
| **Mark Visited** | GPS visit logging | `store_visits` | Route progress updated |
| **Navigate** | Opens Google Maps | - | - |
| **Record Sale** | Opens sale form | - | Navigates to sale |
| **Record Payment** | Opens payment form | - | Navigates to payment |

---

### 14. AGENT SCAN (Mobile)

**Role:** `agent` only

| Feature | Description |
|---------|-------------|
| **QR Scanner** | Scan store QR codes |
| **Store Lookup** | Auto-find store by QR |
| **Quick Actions** | Direct to sale/payment for scanned store |

---

### 15. CUSTOMER HOME (Mobile)

**Role:** `customer` only

| Section | Content |
|---------|---------|
| **Dashboard** | Stores, outstanding, orders |
| **Quick Actions** | Place order, view sales, view transactions, profile |
| **Store List** | Owned stores with balances |

| Action | Description | Data Changes | Reflections |
|--------|-------------|--------------|-------------|
| **View Stores** | My stores list | - | Reads `stores` |
| **View Outstanding** | Total balance | - | Sum of `stores.outstanding` |
| **Place Order** | Create order | `orders` | Admin notification |
| **View Sales** | My sales history | - | Reads `sales` |
| **View Transactions** | Payment history | - | Reads `transactions` |
| **Call Agent** | Opens dialer | - | - |

---

### 16. POS HOME (Mobile)

**Role:** `pos` only

| Action | Description | Data Changes | Reflections |
|--------|-------------|--------------|-------------|
| **Record Sale** | Quick sale | `sales` | Locked to POS store |
| **View Sales** | Today's sales | - | Reads `sales` |
| **Sync Status** | Offline queue | - | Shows pending count |

---

## Record Sale - End-to-End Flow

### PHASE 1: USER INITIATES SALE

```
1. User clicks "Record Sale" button
   ↓
2. System opens sale form modal
   ↓
3. User selects STORE from dropdown
   ↓
4. System fetches:
   - Store details (name, outstanding, customer_id)
   - Store type products (allowed products)
   - Customer KYC status (for credit limit)
   - Store GPS coordinates (for agents)
```

**Data Fetched:**
- `stores` → store info, outstanding balance
- `store_type_products` → allowed products
- `customers` → KYC status, credit limit
- `product_stock` → available quantities

---

### PHASE 2: USER BUILDS SALE

```
5. User adds PRODUCTS to cart
   - Selects product
   - Sets quantity (+/- buttons)
   - Unit price (auto-filled, overrideable with permission)
   ↓
6. System CALCULATES:
   - Item total: quantity × unit_price
   - Running total: sum of all items
   ↓
7. User enters PAYMENT:
   - Cash amount
   - UPI amount
   ↓
8. System CALCULATES OUTSTANDING:
   - outstanding = total - cash - UPI
   - new_store_outstanding = old_outstanding + outstanding
```

**Validations:**
- Product has stock available
- Quantity > 0
- Total > 0
- For POS: Cash + UPI must equal Total (no outstanding)

---

### PHASE 3: PRE-SUBMISSION CHECKS

```
9. PROXIMITY CHECK (agents only)
   - GPS coordinates vs store location
   - Within 100m? → Continue
   - >100m? → Block with error
   - No GPS? → Manager override required
   ↓
10. CREDIT LIMIT CHECK
    - Get store_type credit_limit (KYC vs non-KYC)
    - Check: new_outstanding > credit_limit?
    - Exceeded? → Block with error
    - Near limit? → Show warning
    ↓
11. STOCK AVAILABILITY CHECK
    - Call check_stock_availability RPC
    - Verify sufficient stock in:
      * If recording for self: user's staff_stock
      * If recording for another: that user's staff_stock
    - Insufficient? → Block with error showing available qty
```

---

### PHASE 4: SUBMISSION

```
12. OFFLINE CHECK
    - navigator.onLine = false?
    - Yes → Queue sale in offlineQueue.ts
    - No → Proceed to live submission
    ↓
13. GENERATE DISPLAY ID
    - Call generate_display_id RPC ('SALE' prefix)
    - Returns unique ID like SALE-001234
    ↓
14. BUILD SALE PAYLOAD
    {
      display_id: 'SALE-001234',
      store_id: 'uuid',
      customer_id: 'uuid',
      recorded_by: user.id (or recorded_for if behalf),
      logged_by: user.id (if recording for another),
      total_amount: 5000,
      cash_amount: 3000,
      upi_amount: 1000,
      outstanding_amount: 1000,
      sale_items: [...],
      created_at: (optional backdate)
    }
    ↓
15. CALL record_sale RPC
    - Atomic transaction: sale + items + store update + order delivery
```

---

### PHASE 5: DATABASE OPERATIONS (Atomic)

**The `record_sale` RPC performs:**

```sql
1. INSERT INTO sales (all fields)
   ↓
2. INSERT INTO sale_items (for each item)
   - Deduct from staff_stock OR warehouse stock
   ↓
3. UPDATE stores SET outstanding = new_outstanding
   ↓
4. DELIVER PENDING ORDERS (auto-fulfill)
   - Find orders for this store with status='pending'
   - UPDATE orders SET status='delivered'
   ↓
5. RETURN sale_id + order_delivery_count
```

**Tables Modified:**
- `sales` ← New record
- `sale_items` ← Line items
- `stores.outstanding` ← Updated balance
- `product_stock` OR `staff_stock` ← Deducted quantities
- `orders` ← Auto-delivered orders (status changed)
- `activity_log` ← Audit entry

---

### PHASE 6: POST-SUCCESS ACTIONS

```
16. LOG ACTIVITY
    - Insert to activity_log
    - "Recorded sale" + metadata
    ↓
17. SHOW SUCCESS TOAST
    - "Sale recorded successfully"
    - OR "Sale recorded. X pending order(s) auto-marked as delivered."
    ↓
18. SEND NOTIFICATIONS
    - getAdminUserIds() → returns [admin_id, manager_id, ...]
    - Filter out current user
    - sendNotificationToMany({
        title: "New Sale Recorded",
        message: "Sale SALE-001234 of ₹5,000 at Store Name",
        type: "payment",
        entityType: "sale",
        entityId: sale_id
      })
    ↓
19. INVALIDATE QUERIES (refresh data)
    - ["sales"] ← Refresh sales list
    - ["orders"] ← Refresh orders (if any delivered)
    - ["store-stock"] ← Refresh stock levels
    - ["stores"] ← Refresh store list
    ↓
20. CLOSE MODAL & RESET FORM
```

---

### PHASE 7: REALTIME PROPAGATION

```
21. REALTIME SYNC (via useRealtimeSync hook)
    - Supabase broadcasts sale insert
    - All connected clients receive update
    ↓
22. REFLECTED IN DASHBOARDS:
    - Admin Dashboard: Today's sales ↑
    - Agent Dashboard: Today's sales ↑, Cash on Hand ↑
    - Store Profile: Outstanding updated
    - Inventory: Stock levels ↓
    - Orders: Pending count ↓ (if auto-delivered)
    ↓
23. NOTIFICATION DELIVERY:
    - Push notification to admin/manager devices
    - In-app notification badge increments
```

---

## Data Reflection Matrix

| After Sale | Updated In | How |
|------------|-----------|-----|
| Today's Sales | Dashboard | Realtime subscription |
| Store Outstanding | Store list, Store profile | Realtime + query invalidation |
| Inventory Levels | Inventory page, Product list | Query invalidation |
| Agent Cash on Hand | Agent dashboard | Recalculated from sales |
| Pending Orders | Orders list | Auto-delivery removes them |
| Sales List | Sales page | Query invalidation |
| Reports | All reports | Next report generation |
| Notifications | Bell icon | Realtime insert |
| Activity Log | Activity page | Direct insert |

---

## Role Differences in Record Sale

| Aspect | Admin/Manager | Agent | POS |
|--------|-------------|-------|-----|
| **Store Selection** | Any store in warehouse | Assigned routes only | Locked to POS store |
| **Price Override** | If has permission | If has permission | No |
| **Proximity Check** | No | Yes (100m) | No |
| **Record for Others** | Yes | If has `record_behalf` | No |
| **Credit Limit** | Enforced | Enforced | Enforced |
| **Outstanding Allowed** | Yes | Yes | No (must pay full) |
| **Offline Queue** | Yes | Yes | Yes |

---

## Error Scenarios

| Error | When | Message |
|-------|------|---------|
| Credit Limit Exceeded | new_outstanding > credit_limit | "Credit limit exceeded. Increase payment or reduce items." |
| Insufficient Stock | stock < requested qty | "Insufficient stock for: Product Name. Available: X" |
| Proximity Fail | agent >100m from store | "Too far from store location" |
| POS Partial Payment | cash+upi < total | "POS sales require full payment" |
| Invalid Date | date >1 day future or >30 days past | "Sale date cannot be..." |
| Offline Credit Fail | offline validation fails | "Credit limit exceeded (offline check)" |

---

## Summary Statistics

- **Total Pages:** 94
- **Total Actions:** 500+
- **Roles:** 6
- **Permissions:** 50
- **Database Tables:** 40+
- **Offline Supported:** Yes
- **Real-time Sync:** Yes
- **Web/APK Logic:** Identical

---

## Document Maintenance

**Last Updated:** 2025-01-25  
**Maintained By:** Development Team  
**Review Schedule:** Monthly or after major feature releases

---

*For questions or updates to this document, contact the development team.*
