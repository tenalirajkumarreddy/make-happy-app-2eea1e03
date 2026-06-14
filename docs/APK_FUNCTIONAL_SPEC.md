# APK Functional Specification — Business Management & Distribution System

> Hand this document to any agent tasked with recreating the APK from scratch.

## Overview

A multi-role business management & distribution mobile APK connecting **Agents** (route sales), **Marketers** (sales support), **Customers** (store owners), **POS Operators** (point-of-sale), and **Admins** (super_admin / manager). Backend is Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage). Android APK via Capacitor.

### Technical Stack
- **Frontend:** React + TypeScript + Capacitor (Android native)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Mobile Navigation:** Custom role-based tab routing (no React Router — uses `useLocation`/`useNavigate` with tab state)
- **Offline:** IndexedDB queue for critical writes (store creation, sales, payments), syncs when online
- **Push:** FCM via Capacitor PushNotifications plugin with deep-linking
- **Capacitor Plugins:** App, StatusBar, Keyboard, SplashScreen, PushNotifications (FCM), Geolocation, Camera

### Architecture Notes
- All mobile routes live in a single-file router (`MobileApp.tsx`) — lazy-loaded per role.
- Layout: `MobileShell` (top header bar + scrollable content + bottom tab nav, safe-area aware).
- Auth: Supabase email/password for staff, phone OTP for customers. Role resolved from `user_roles` table.
- Offline-first for store creation, sales, payments — queue via IndexedDB, conflict resolver reconciles on sync.
- Geo-location on visit marking, sale recording, and proximity checks.
- Credit limit checks both online (`resolveCreditLimit`) and offline (`validateCreditLimitOffline`).
- Notifications sent via Supabase Edge Functions on sale/payment/order/handover/KYC events.
- Pull-to-refresh on all admin list pages.
- Business keys generated via `generateBusinessKey` for display IDs.

---

## 1. Agent Role — Route-Based Sales Agent

### AgentHome (Dashboard)
**Data displayed:**
- Today's stats: total sales, cash sales, UPI sales, sales count, payments collected, pending orders count
- List of stores in the agent's assigned route (ordered): store name, outstanding balance, distance from agent, last visit time, store type badge
- "Start Route" / "Resume Route" session banner

**Actions:**
- Tap store → AgentStoreProfile
- Quick-action buttons per store: Record Sale, Record Payment, Mark Visit
- "Mark Visit" button → records visit with reason (Delivery, Payment Collection, etc.) + geo-location
- FAB: "Add Customer/Store" → opens AddCustomerStore wizard
- "Stock Transfer" → opens stock transfer sheet

### AgentRoutes (Route Session Management)
**Data displayed:**
- Map and/or list of all stores in the route with distances
- Session state: active / paused / ended
- Per store: name, outstanding, order stock summary, pending orders
- QR store selector

**Actions:**
- Start route session (geo-fenced)
- Visit stores in sequence
- Mark visit with geo-location + reason
- Record sale / payment against current store
- View pending orders per store
- Cancel order with reason
- End or resume route session

### AgentScan (QR Scanner)
**Data displayed:**
- Live camera QR scanner view
- Nearby stores list (within 5 km) as fallback

**Actions:**
- Scan store QR code → identify store → navigate to Record Sale or Record Payment with pre-selected store
- Scan UPI QR code → capture UPI ID for payment
- Show nearby stores if scan fails

### AgentRecord (Combined Record Sale/Payment)
**Data displayed:**
- Store selector (searchable)
- Mode toggle: Sale / Payment
- Sale mode: product catalogue grouped by category, product search, quantity picker (+, -), unit price per product, calculated total, cash/UPI split inputs, credit limit remaining
- Payment mode: cash amount, UPI amount, notes, optional backdate
- Receipt preview after save

**Actions:**
- Select store (or pre-selected from scan)
- Add products with quantities
- Adjust prices per product
- Set cash/UPI split
- Validate credit limit before save
- Assign sale to another staff user (if permitted)
- Save → generates sale to Supabase, updates outstanding, shows receipt, sends notification to admin
- Save offline via offline queue if no network
- Payment save → updates outstanding, sends notification

### AgentRecordSale (Dedicated Sale Recording)
Same as AgentRecord's Sale mode — product catalogue, cart, credit check, receipt, offline queue, notification.

### AgentRecordPayment (Dedicated Payment Recording)
Same as AgentRecord's Payment mode — store select, cash/UPI/notes/backdate, save updates outstanding.

### AgentHistory (Activity History)
**Data displayed:**
- Agent's full sales and payments list
- Tabs: All / Sales / Payments
- Per entry: store name, amount, date, status

**Actions:**
- Edit a sale → change items/quantities/prices
- Return a sale → full or partial return with reason (reverses stock and outstanding)
- Return a payment → reverse it with reason
- All mutations logged, update store outstanding

### AgentCustomers (Stores List)
**Data displayed:**
- Searchable/filterable store list (by name, route, store type)
- Per store: name, type badge, address, phone, distance, outstanding balance, last activity time

**Actions:**
- Tap store → AgentStoreProfile
- FAB: Add Customer/Store → multi-step wizard

### AgentStoreProfile
**Data displayed:**
- Store name, ID, type, route, customer name, phone, address, outstanding balance, last activity timestamp

**Actions:**
- Record Sale
- Record Payment
- Mark Visit (with geo-location)
- Open in Google Maps navigation

### AgentProducts (Product Catalogue)
**Data displayed:**
- Searchable product list (name, SKU, price, unit, category, current stock level)
- Filter by category
- Tap → bottom sheet with full details (description, price breakdown, stock across warehouses)

### AddCustomerStore (Multi-Step Wizard)
**Steps:**
1. Choose mode: Both (customer + store), Only Customer, Only Store
2. Customer details: name, phone, email, address (or select existing customer)
3. Store details: name, type, address, phone, optional photo from camera, optional geo-location
4. Review and submit

**Behavior:**
- Works offline (queued in IndexedDB)
- Sends notification to admins on successful creation

---

## 2. Marketer Role — Sales Support

### MarketerHome (Dashboard)
**Data displayed:**
- Stats: total assigned stores, today's orders count, pending orders, outstanding balance
- Store list in route: name, distance, outstanding

**Actions:**
- Add Store/Customer → wizard
- Record Sale / Payment
- View Orders
- View Map
- View Stock Transfers
- View Customers
- Tap store → profile

### MarketerOrders (Order Management)
**Data displayed:**
- List of active orders from stores
- Per order: store name, items, status
- Active order conflict dialog (prevents double orders for same store)

**Actions:**
- Create new order: select store → add product items with quantities → set requirement note → submit
- View order stock summary
- View proforma invoice
- Cancel order with reason
- Copy/edit existing order
- Save → sends notification to admin

### MarketerStores (Stores List)
**Data displayed:**
- Searchable/filterable store list by name, route, type
- Per store: name, type badge, address, phone, distance, outstanding balance

**Actions:**
- Tap store → MarketerStoreProfile
- Add new store/customer via wizard

### MarketerStoreProfile
**Data displayed:**
- Store info, outstanding balance, contact, address

**Actions:**
- Record Sale
- View / Manage Orders for that store

---

## 3. POS Operator Role — Point of Sale

### PosHome (POS Dashboard)
**Data displayed:**
- Today's sales total, cash/UPI breakdown, transaction count (for assigned POS store)
- Recent sales list for today

**Actions:**
- Record Sale
- View Sale History
- Inventory Quick View
- Stock Transfers (incoming/outgoing)
- Warehouse Stock
- Products Catalogue
- Staff List

---

## 4. Customer Role — Store Owner

### CustomerHome (Dashboard)
**Data displayed:**
- Store selector dropdown (if multiple stores)
- Current balance / outstanding
- Quick stats: total sales count, pending orders count
- Recent sales and transactions list

**Actions:**
- Navigate to: Sales History, Orders, Ledger/Transactions, Profile, KYC

### CustomerSales (Sales List)
**Data displayed:**
- Full sales list filtered by selected store
- Per sale: sale ID, date, store name, total amount, cash/UPI breakdown, outstanding amount
- Tap → sale items breakdown (product name, qty, price)

### CustomerOrders (Order Management)
**Data displayed:**
- Order list with status (pending/confirmed/delivered/cancelled)
- Active order conflict prevention

**Actions:**
- Create new order: select store (if multiple) → add items with quantities → add requirement note → submit
- Tap order → view details
- Cancel order
- Submit → sends notification to admin

### CustomerTransactions (Ledger)
**Data displayed:**
- Running balance ledger per store
- Each entry: type (delivery/sale or payment), old outstanding, new outstanding, amount
- Filterable by store

### CustomerProfile
**Data displayed:**
- Name, ID, phone, email, address

**Actions:**
- Link/unlink Google account for SSO
- Logout

### CustomerKyc (KYC Upload)
**Data displayed:**
- KYC status: not submitted / pending / verified / rejected (with rejection reason)

**Actions:**
- Upload 3 documents: Selfie photo, Aadhaar front image, Aadhaar back image
- Take photo from camera or pick from gallery
- Submit for verification
- Re-submit if rejected

---

## 5. Admin Role — Super Admin / Manager

### AdminHome (Dashboard)
**Data displayed:**
- Today's total sales, cash/UPI breakdown, sales count
- Total pending orders
- Total outstanding across all stores
- Low stock count
- Role-aware: super_admin sees all warehouses, manager sees only assigned warehouse

**Actions:**
- Navigate to: Sales, Orders, Purchases, Handovers, Inventory, Transactions, Staff Expense Approvals

### AdminSales (Full Sales List)
**Data displayed:**
- All sales, filterable by date range, store, staff
- Per sale: sale ID, store name, total amount, cash/UPI, recorded by, date

**Actions:**
- View full receipt/invoice (InvoiceDialog)
- Edit sale items
- Cancel sale (with reason)
- Return / partial return sale items
- Pull-to-refresh

### AdminTransactions (Payments List)
**Data displayed:**
- All payments, filterable by date range, store
- Per transaction: ID, store, amount, cash/UPI, recorded by, date

**Actions:**
- View full receipt
- Pull-to-refresh

### AdminOrders (Orders Management)
**Data displayed:**
- All orders with status (pending/confirmed/delivered/cancelled)
- Filters: status, store, date
- Active order conflict prevention

**Actions:**
- Super_admin: assign orders to warehouses
- Manager: confirm / cancel / deliver orders
- Convert delivered order into a sale (product mapping)
- View proforma invoice / order stock summary
- Notifications sent on state changes

### AdminHandovers (Cash Handover Management)
**Data displayed:**
- Handover list with status (pending → submitted → approved/rejected)
- Per handover: cash amounts, UPI amounts, notes, bill images

**Actions:**
- Create daily handover: enter cash, UPI, notes, attach bill images from camera/gallery
- Approve or reject handovers with comments
- View full handover history
- Pull-to-refresh

### AdminInventory (Stock Management)
**Data displayed:**
- All products with current stock level, reorder level
- Low stock items highlighted
- Filter by warehouse, category

**Actions:**
- Adjust stock: increase/decrease with reason
- View stock movement history per product
- View staff holdings (inventory assigned to staff)
- Pull-to-refresh

### AdminPurchases (Purchase Orders)
**Data displayed:**
- Purchase orders with status (pending/completed)
- Filter by status, warehouse, vendor
- Per purchase: product/raw material, quantity, cost, batch number, expiry date, bill images

**Actions:**
- Create purchase order
- Upload bill images
- Mark purchase as completed (updates stock)

---

## 6. Shared / Infrastructure

### Mobile Navigation Shell
- `MobileShell`: top header bar (title + notification bell + settings gear) + scrollable content + bottom tab navigation bar. Safe-area aware.
- `MobileHeader`: title, back button (when applicable), notification bell with unread badge → opens NotificationsSheet, settings icon → phone settings.
- `BottomNav`: role-based static tab definitions.

### Role-Based Bottom Tabs
| Role | Tabs |
|------|------|
| Agent | Home \| Routes \| Scan (center) \| Stores \| History |
| Marketer | Home \| Orders \| Record (center) \| Stores \| History |
| Customer | Home \| Sales \| Order (center) \| Ledger \| Profile |
| Admin | Home \| Sales \| Orders \| Handovers \| Inventory + sheet for more |
| POS | Home \| Record \| History \| Inventory |

### Shared Components
- **StorePickerSheet** — searchable bottom sheet for store selection
- **InvoiceDialog** — full-screen invoice/receipt with print support
- **BillImageUpload** — camera/gallery uploader for handover bills
- **StockAdjustmentSheet** — adjust stock with reason
- **StockHistorySheet** — stock movement history
- **StaffHoldingsSheet** — inventory assigned to staff
- **ActiveOrderExistsDialog** — duplicate order alert
- **ReturnPaymentDialog** — reverse payment with reason
- **NotificationsSheet** — recent notifications panel
- **PullRefreshIndicator** — pull-to-refresh wrapper
- **CardSkeleton** — loading skeleton for lists
- **MiniStat** — single stat card (icon, label, value)

### Custom Hooks
- `useHardwareBackButton` — Android back button with exit confirm dialog
- `useHandoverBadge` — pending handover count for badge
- `useMarkVisit` — visit record with store_id, timestamp, geo-coords, reason
- `useOperatorWarehouse` — resolves POS operator's assigned warehouse
- `usePullToRefresh` — pull-to-refresh state machine
- `useStorePendingOrders` — pending order count per store for badge
- `useActiveSession` — active route session tracking

### Offline & Sync
- **Offline Queue** (`lib/offlineQueue`): IndexedDB queue for store creation, sales, payments
- **Conflict Resolver** (`lib/conflictResolver`): reconciles offline mutations when back online
- All critical writes attempt online first, fall back to offline queue

### Push Notifications
Triggers (via Supabase Edge Functions):
- Sale created → admin notified
- Payment recorded → admin notified
- Order placed → admin notified
- Handover submitted → admin notified
- KYC submitted → admin notified
- KYC verified/rejected → customer notified
- Expense actions → relevant approvers

Deep-linking: notification tap dispatches `push-notification-tap` custom event → navigates to relevant page.

### Auth Flow
- Staff: Supabase email/password
- Customers: phone OTP via OpenSMS → Supabase auth
- Role resolved from `user_roles` table (default fallback: `customer`)

---

## File Reference (for code verification)

| Page/Component | Path (relative to `src/mobile/`) |
|---|---|
| Router | `MobileApp.tsx` |
| Layout | `components/MobileShell.tsx` |
| Header | `components/MobileHeader.tsx` |
| Bottom Nav | `components/BottomNav.tsx` |
| Agent Home | `pages/agent/AgentHome.tsx` |
| Agent Routes | `pages/agent/AgentRoutes.tsx` |
| Agent Scan | `pages/agent/AgentScan.tsx` |
| Agent Record (combined) | `pages/agent/AgentRecord.tsx` |
| Agent Record Sale | `pages/agent/AgentRecordSale.tsx` |
| Agent Record Payment | `pages/agent/AgentRecordPayment.tsx` |
| Agent History | `pages/agent/AgentHistory.tsx` |
| Agent Customers | `pages/agent/AgentCustomers.tsx` |
| Agent Store Profile | `pages/agent/AgentStoreProfile.tsx` |
| Agent Products | `pages/agent/AgentProducts.tsx` |
| Add Customer/Store | `pages/agent/AddCustomerStore.tsx` |
| Marketer Home | `pages/marketer/MarketerHome.tsx` |
| Marketer Orders | `pages/marketer/MarketerOrders.tsx` |
| Marketer Stores | `pages/marketer/MarketerStores.tsx` |
| Marketer Store Profile | `pages/marketer/MarketerStoreProfile.tsx` |
| Customer Home | `pages/customer/CustomerHome.tsx` |
| Customer Sales | `pages/customer/CustomerSales.tsx` |
| Customer Orders | `pages/customer/CustomerOrders.tsx` |
| Customer Transactions | `pages/customer/CustomerTransactions.tsx` |
| Customer Profile | `pages/customer/CustomerProfile.tsx` |
| Customer KYC | `pages/customer/CustomerKyc.tsx` |
| POS Home | `pages/pos/PosHome.tsx` |
| Admin Home | `pages/admin/AdminHome.tsx` |
| Admin Sales | `pages/admin/AdminSales.tsx` |
| Admin Transactions | `pages/admin/AdminTransactions.tsx` |
| Admin Orders | `pages/admin/AdminOrders.tsx` |
| Admin Handovers | `pages/admin/AdminHandovers.tsx` |
| Admin Inventory | `pages/admin/AdminInventory.tsx` |
| Admin Purchases | `pages/admin/AdminPurchases.tsx` |
| Offline Queue | `lib/offlineQueue.ts` |
| Conflict Resolver | `lib/conflictResolver.ts` |
