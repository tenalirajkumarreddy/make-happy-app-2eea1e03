# Business Management System - Requirements Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Authentication & User Management](#authentication--user-management)
4. [Products Management](#products-management)
5. [Customers Management](#customers-management)
   - [Customer Status Management](#customer-status-management)
6. [Stores Management](#stores-management)
   - [Store Status Management](#store-status-management)
   - [Store Outstanding Balance Management](#store-outstanding-balance-management)
7. [Routes Management](#routes-management)
8. [Sales & Transactions](#sales--transactions)
9. [Handover System](#handover-system-cashupi-collection-tracking)
10. [Orders Management](#orders-management)
11. [Daily Reports](#daily-reports)
12. [Search & Filters](#search--filters)
13. [Bulk Operations](#bulk-operations)
14. [Analytics Dashboard](#analytics-dashboard)
15. [Promotional Banners](#promotional-banners-customer-dashboard)
16. [Audit Trail](#audit-trail)
17. [Access Control System](#access-control-system)
18. [Activity History](#activity-history)
19. [Notifications](#notifications)
20. [Customer Portal Features](#customer-portal-features)
21. [Company Settings](#company-settings)
22. [ID Format Standards](#id-format-standards)
23. [Technical Stack](#technical-stack)

---

## System Overview

A comprehensive business management system for managing products, customers, stores, routes, sales, and transactions with role-based access control.

**Platform**: Mobile-responsive web application (future: Capacitor for APK)
**Database**: Supabase
**Maps**: Free mapping service
**Offline Support**: Yes, with automatic sync when online

### ID Format Standards

All entities in the system use standardized ID formats:

- **Orders**: `ORD-XXXXXX` (e.g., ORD-012345)
- **Customers**: `CUST-XXXXXX` (e.g., CUST-004567)
- **Stores**: `STR-XXXXXX` (e.g., STR-001234)
- **Payments**: `PAY-XXXXXX` (e.g., PAY-005678)
- **Sales**: `SALE-XXXXXX` (e.g., SALE-012345)

Where `XXXXXX` is a zero-padded 6-digit sequential number.

### Duplicate Detection System

**Mobile Number Validation:**
- **Hard Block**: No duplicate customers with same mobile number allowed
- Real-time validation when phone number is entered
- If duplicate found, must use existing customer

**Store Name + Location Validation:**
- Checks for similar store names when creating new store
- **Distance < 5 meters**: Warning - "Similar store exists for this customer"
  - Likely duplicate, suggest using existing store
- **Distance > 5 meters**: Smart suggestion
  - Auto-tag with area/street name
  - Example: "Tea Time" → "Tea Time (MG Road)" or "Tea Time (AT Agraharam)"
  - User can accept suggestion, enter different name, or keep original

### Order Types & Tracking

**Order Types:**
- **Simple Order**: Requirement note only (no products/quantities specified)
  - Example: "Need water bottles urgently"
- **Detailed Order**: Products + Quantities specified
  - Example: "500ML Water - 10 units, 1L Water - 5 units"

**Order Metadata:**
- **Order Type**: AUTO (system-generated) or MANUAL (created by user/marketer)
- **Created By**: User ID (Marketer/Customer) or "System"
- **Created For**: Store ID
- **Created On**: Timestamp

**Activity Logs:**
- Format: "Order created for [Store Name] by [Creator Name]"
- Examples:
  - "Order created for Tea Stall - MG Road by Marketer Amit"
  - "Order created for Restaurant - Koramangala by Customer"
  - "Order created for Bakery - Jayanagar by System (Auto)"

- **Order Tracking Metadata**: Track `Created By`, `Created For`, `Created On` for all orders to support reporting on order creation by user type (Agent/Marketer/Customer/System)
- **Store Photo Upload**: All stores must have a photo field for uploading store images during customer/store creation
- **Behalf-of Recording**: Managers can record sales, payments, and orders on behalf of other users (Agents, Marketers, Customers) with granular permission controls
- **Manager Permission Controls**: Admin can enable/disable behalf-of recording permissions per manager for:
  - Record Sales: Self / On behalf of others
  - Record Payments: Self / On behalf of others
  - Create Orders: Self / On behalf of others
- **Enhanced Outstanding Reports**: Track customer risk categories:
  - Customers with no orders in last 15 days
  - Customers with outstanding but no orders in last 15 days
  - Customers with increasing outstanding trend (outstanding grows after each sale)
  - Customers whose outstanding exceeds their credit limit
- **Payment Reports**: Show day vs total payments trend (daily payment amounts over time), not Cash vs UPI comparison
**Order Reports (Admin/Manager):**
- Track number of orders created by each user
- Filter by creator type (Marketer/Customer/System)
- Status breakdown (Active/Delivered/Cancelled)
- Performance metrics per marketer


---

## User Roles & Permissions

### Role Hierarchy
1. **Super Admin** - Full system access
2. **Managers** - Extended access, no access control management
3. **Agents** - Field operations focused
4. **Marketers** - Order and customer management
5. **POS** - Point of Sale operations (walk-in customers)
6. **Customers** - Limited access to own data

### Super Admin Capabilities
- ✅ See all stats in dashboard
- ✅ Add / Modify Products
- ✅ Add / Modify Customers
- ✅ Add / Modify Stores
- ✅ Record Sale
- ✅ Add / Create / Assign routes to stores
- ✅ Record Transaction
- ✅ Add or remove store for a customer
- ✅ See / Modify all transactions
- ✅ See / Modify all sales
- ✅ Daily Report page
- ✅ Company settings
- ✅ Access Control Page
  - Control all user access
  - Enable/Disable user accounts
  - Customer Control Section (Enable/Disable customers)
  - Store Control Section (Enable/Disable stores)
- ✅ Enable/Disable Customers (cascades to disable their stores)
- ✅ Enable/Disable Stores
- ✅ Add Opening Balance to Stores
- ✅ Edit Store Balance manually (logged as Balance correction)
- ✅ Activity History (all users)
- ✅ Transfer stores between customers

### Managers Capabilities
- ✅ See stats in dashboard
- ✅ Add / Modify Customers
- ✅ Add Stores (with store photo upload)
- ✅ See / Modify all transactions
- ✅ See / Modify all sales
- ✅ Comprehensive Reports (Daily, Sales, Orders, Agent/Marketer Performance, Product, Payment, Outstanding)
- ✅ Record Sale (for self or on behalf of other users - with permission control)
- ✅ Record Transaction (for self or on behalf of other users - with permission control)
- ✅ Create / Modify / Delete Orders (for self or on behalf of other users - with permission control)
- ✅ Access to all store types (configurable)
- ✅ Modify custom pricing for stores
- ✅ Confirm handovers from Agents, Marketers, and POS users
- ✅ Manage user permissions (enable/disable behalf-of recording per manager)
- ✅ Enable/Disable Customers (cascades to disable their stores)
- ✅ Enable/Disable Stores
- ✅ Add Opening Balance to Stores (configurable via Admin permission)
- ✅ Edit Store Balance manually (logged as Balance correction, configurable via Admin permission)

### Agents Capabilities
- ✅ See stats in dashboard
  - Total stores covered (daily)
  - Total sale recorded (daily)
  - Total cash collected (daily)
  - Total UPI collected (daily)
  - Next store in route with map
- ✅ Add Customers
- ✅ Add Stores
- ✅ See orders, Create sales for stores with orders
- ✅ Can see routes and customers in routes
- ✅ Record Sale (cannot edit/delete)
- ✅ Record Transaction (cannot edit/delete)
- ✅ See Customers and their stores
- ✅ See all their actions
- ✅ Start/manage route sessions
- ✅ Mark stores as visited
- ✅ Cancel orders with reasons
- ✅ Download route data for offline use
- ✅ Real-time location tracking during route sessions

### Marketers Capabilities
- ✅ See stats in dashboard
- ✅ Add / See Customers
- ✅ Add Stores
- ✅ Create / Modify / Delete Orders for accessible customers
- ✅ Access to specific store types (configurable)
- ✅ Record Transactions (cannot edit/delete)
- ✅ Have handoverables (cash/UPI collected)

### POS Capabilities
- ✅ See stats in dashboard
  - Total sales recorded (daily)
  - Total cash collected (daily)
  - Total UPI collected (daily)
  - Total handoverables (pending + cumulative)
- ✅ Record Sale (for walk-in customers)
  - Uses global "POS" customer
  - Access to all products
  - Cannot edit/delete sales
- ✅ View History
  - Daily grouped records
  - Handover status tracking
  - Mark as "Handed over to Manager"
- ✅ Have handoverables (cash/UPI collected)

### Customers Capabilities
- ✅ View their stores
- ✅ View outstanding amounts
- ✅ View sales history
- ✅ Create / Modify / Delete their own orders
- ✅ Receive notifications (push, future: WhatsApp)
- ✅ Report issues with order cancellations
- ✅ Upload Aadhar for KYC verification

---

## Authentication & User Management

### Sign Up Process

### User Registration Strategy

**Selected Approach: Option 1 (Secure Invitation-Based)**

**For Customers:**
- Self-register with email/password or Google Sign-In
- Immediate access to customer portal
- Can create orders, view stores, upload KYC

**For Staff (Agents/Marketers/Managers/POS):**
- Admin sends email invitation with unique token
- Invitation link contains pre-assigned role
- Register using invitation link
- Prevents unauthorized access to staff features

**Benefits:**
- Better security and access control
- No manual role promotion needed
- Clear separation between customers and staff
- Prevents unauthorized system access

### Authentication Methods
- Email & Password
- Google Sign-In

### User Account Features
- Password reset via email
- Account enable/disable by Admin
- Role assignment and modification by Admin
- Default permissions based on role
- Per-user permission overrides

---

## Products Management

### Product Information
- **Name**: Product name
- **Description**: Product description
- **SKU**: Stock Keeping Unit (unique identifier)
- **Base Price**: Default price for the product
- **Image**: Product image
- **Unit**: Unit of measurement (e.g., ML, L, KG, PCS)
- **Categories**: Product categorization
- **Groups**: Product grouping

> [!NOTE]
> No stock/inventory management is required in this system.

### Product-Store Type Access Control

Products can be configured to be accessible by specific store types:

```
|------------------------------------------------------------------------------|
| Product          | Store Type 1      | Store Type 2      | Store Type 3     |
|------------------------------------------------------------------------------|
| Product 1        | Yes/No            | Yes/No            | Yes/No           |
| Product 2        | Yes/No            | Yes/No            | Yes/No           |
|------------------------------------------------------------------------------|
```

When toggle is "Yes":
- Default price for that store type is shown next to toggle
- Admin can edit price by clicking pencil icon next to it
- This becomes the default price for all stores of that type

### Pricing Hierarchy

**3-Level Pricing System:**

1. **Base Price** (Product level)
   - Default price: ₹120 for 500ML product

2. **Store Type Default Price** (Store Type level)
   - Retail stores: ₹120 (same as base)
   - Wholesale stores: ₹130 (custom for this type)

3. **Store Custom Price** (Individual Store level)
   - Can override store type default
   - Requires permission to override
   - Admin can restrict override capability

**Example Flow:**
- Agent creates a store with type "Retail"
- Products available for "Retail" type are displayed
- Each product shows default price (₹120)
- If agent has override permission, can change to custom price
- If no override permission, default price is locked

---

## Customers Management

### Customer Information

**Basic Details:**
- Customer Name
- Customer Photo (optional, for easy identification)
  - Formats: JPG, PNG (max 5MB)
  - Can be updated anytime
  - Cannot change photo after KYC verification completed
- Customer Phone (only Admin can change after creation)
- Customer Email (used for login)
- Customer Address
- GST Number

**Financial:**
- Opening Balance (controlled by Admin permission)
- Total Outstanding (auto-calculated: sum of all store outstandings)

**KYC Verification:**

**Customer Upload Process:**
1. Customer clicks "Request KYC Verification" button
2. Popup appears with upload fields:
   - Live Photo (selfie)
   - Aadhar Front Image
   - Aadhar Back Image
   - Consent checkbox (mandatory)
3. Submit for verification
4. Status changes to "Pending Verification"

**Admin/Manager Verification:**
- Review uploaded documents
- **Approve**: Status → "Verified", customer photo locked
- **Reject**: Select reason or enter custom reason
  - Reasons: "Unclear Images", "Name Mismatch", "Invalid Document", "Other"
  - Customer receives notification with rejection reason
  - Customer can re-upload and reapply

**Verification Status:**
- Not Requested
- Pending Verification
- Verified
- Rejected (with reason)

### Credit Limit System

Credit limits are configured per Store Type and KYC status:

```
|------------------------------------------------------------------------------|
| Type         | Store Type 1  | Store Type 2  | Store Type 3               |
|------------------------------------------------------------------------------|
| KYC          | ₹5,000        | ₹10,000       | ₹7,500                     |
| Non-KYC      | ₹1,000        | ₹2,000        | ₹1,500                     |
|------------------------------------------------------------------------------|
```

- These are default values set by Admin
- Can be overridden manually per customer by Admin
- Credit limit applies per store

### Customer-Store Relationship
- **One customer → Many stores** (1:N relationship)
- **One store → One customer** (1:1 relationship)
- Admin can transfer stores between customers

### Customer Status Management

**Enable/Disable Customers:**

**Admin & Manager Control:**
- Admin and Managers can disable/enable any customer
- Disabling a customer automatically disables **all of their stores**

**When Customer is Disabled:**
- ❌ All their stores become inactive automatically
- ❌ Cannot record sales or transactions for any of their stores
- ❌ All their stores appear greyed out and unselectable in dropdowns
- ✅ Customer still visible in the Customers list with an "Inactive" badge
- ✅ Historical data and reports preserved
- ✅ Can be re-enabled anytime (stores must be re-enabled individually if needed)

**Re-enabling Customer:**
- Admin/Manager toggles "Enable" on the customer
- Customer becomes active, but stores remain inactive until individually re-enabled
- This allows re-enabling only specific stores of the customer

### POS Customer & Store

**Purpose:** Handle walk-in/counter sales without creating individual customer accounts

**Global POS Customer Configuration:**
- **Customer Name**: "POS"
- **Customer Type**: System-generated, cannot be deleted
- **Product Access**: Configurable by Admin (can restrict certain products)
- **Store Name**: Same as Company Name (from Company Settings)
- **Store Type**: POS/Counter (system type)
- **Outstanding**: NOT ALLOWED (must be fully paid)
- **No Default Pricing**: POS user manually enters prices

**POS Sale Recording:**
1. Select products and quantities
2. Manually enter price for each product (no auto-population)
3. Total is calculated automatically
4. Payment MUST equal total (Cash + UPI = Total)
5. Cannot save if payment doesn't match total
6. No outstanding allowed

**Usage:**
- POS users automatically record sales for this customer
- No need to select customer/store (auto-selected)
- Appears in all reports as "POS"
- All POS users share this single customer/store
- Flexible pricing for walk-in customers

---

## Stores Management

### Store Information

**Basic Details:**
- Business Name / Store Name
- Store Photo (optional, for easy identification)
  - Formats: JPG, PNG (max 5MB)
  - Can be updated anytime
- Address (text)
- Pinpoint Address (GPS coordinates from map selection)
- Store Phone
- Alternate Phone

**Business Details:**
- Store Type (Retail, Wholesale, etc.)
- Assigned Route (based on store type)
- Associated Customer (owner)

**Financial:**
- Outstanding Amount (specific to this store)
- Opening Balance (if user has permission)

**Pricing:**
- Custom pricing per product (if override permission granted)
- Defaults to Store Type pricing if no custom pricing

### Store Creation Flow

1. Select or create customer
2. Enter store details
3. Select Store Type → Available routes filter by type
4. Select Route from filtered list
5. Products available for Store Type are displayed with default prices
6. If user has override permission, can modify prices
7. If user has permission, can add Opening Balance
8. Save store

### Store Type Configuration

Admin configures store types with:
- Type name (e.g., Retail, Wholesale, Restaurant)
- Accessible products
- Default pricing per product
- Order type (Simple/Detailed)
- Auto-order capability
- Associated routes

### Store Status Management

**Enable/Disable Stores:**

**Admin & Manager Control:**
- Admin and Managers can disable/enable any store
- Disabled stores become inactive

**When Store is Disabled:**
- ❌ Cannot record sales for this store
- ❌ Cannot record transactions for this store
- ❌ Store appears in dropdowns (Sales/Orders/Transactions) but is greyed out, tagged "Inactive", and unselectable
- ❌ Pending orders are automatically cancelled
- ✅ Store still visible in reports (historical data)
- ✅ Outstanding balance preserved
- ✅ Can be re-enabled anytime

**Re-enabling Store:**
- Admin/Manager toggles "Enable" button
- Store becomes active immediately
- Appears in agent's accessible stores again
- Can create new orders
- Can record sales/transactions

**Use Cases:**
- Temporarily closed stores
- Stores under dispute
- Seasonal stores
- Stores being transferred to another customer

### Store Outstanding Balance Management

**Balance Correction (Admin & Manager with permission):**
- Admin (always) and Managers (if granted `can_edit_store_balance` permission) can manually edit a store's outstanding balance at any time.
- **Description shown**: "Balance correction"
- **Optional note**: A note field allows the user to explain the reason (e.g., "Write-off for damaged goods")
- The correction is logged as a ledger entry so it appears in the store's transaction history
- Corrections are visible to all users who can view the store's ledger

**Opening Balance (if user has `can_add_opening_balance` permission):**
- When creating a new store, the user can optionally enter an opening balance
- If the user does not have this permission, the opening balance defaults to ₹0
- Opening balance is reflected immediately in the store's outstanding amount

---

## Routes Management

### Route Structure

Routes are organized by Store Type:

```
|----------------------------------------------------------------------------------|
| Routes Page                                                                      |
|----------------------------------------------------------------------------------|
| <Store Type 1 (RETAIL)> | <Store Type 2> | <Store Type 3> |                    |
|----------------------------------------------------------------------------------|
|                                                      <Create Route> Button       |
|                                                                                  |
| |------------------------------------------------------------------------------| |
| | Route Name: DUMMY ROUTE                                                      | |
| | Number of Stores: 45                                                         | |
| | Total Outstanding: ₹1,25,000                                                 | |
| |                                                      <More Details> Button   | |
| |------------------------------------------------------------------------------| |
|                                                                                  |
| |------------------------------------------------------------------------------| |
| | Route Name: CITY CENTER ROUTE                                                | |
| | Number of Stores: 32                                                         | |
| | Total Outstanding: ₹85,000                                                   | |
| |                                                      <More Details> Button   | |
| |------------------------------------------------------------------------------| |
|----------------------------------------------------------------------------------|
```

### Route Assignment

**To Stores:**
- Routes are assigned when creating a store
- Route dropdown filters by selected Store Type
- Can be modified later by authorized users

**To Agents:**
- Agent access to routes is configured in Access Control:

```
|----------------------------------------------------------------------------------|
| Routes           | Agent 1   | Agent 2   | Agent 3   |                          |
|----------------------------------------------------------------------------------|
| <Store Type 1>   | Yes/No    | Yes/No    | Yes/No    |                          |
|   → Route 1      | Yes/No    | Yes/No    | Yes/No    |                          |
|   → Route 2      | Yes/No    | Yes/No    | Yes/No    |                          |
| <Store Type 2>   | Yes/No    | Yes/No    | Yes/No    |                          |
|   → Route 1      | Yes/No    | Yes/No    | Yes/No    |                          |
|----------------------------------------------------------------------------------|
```

### Route Sessions

**Multi-Agent Access:**
- Multiple agents can access the same route simultaneously
- All agents see real-time updates (stores visited, sales recorded)
- Prevents duplicate visits to same store

**Route Completion Tracking:**
- Completion % = (Stores Visited / Total Stores) × 100
- "Visited" includes both sales recorded AND marked as visited
- Displayed in Manager dashboard and Daily Reports

**Daily Store Status Reset:**
- All store "visited" statuses reset to "unvisited" at 00:00 (midnight)
- Applies to all stores in all routes
- Historical data preserved (yesterday's reports still show visited status)
- Fresh start for each day's operations

> [!NOTE]
> Routes are for navigation guidance only. Agents can record sales/transactions for ANY accessible customer/store, whether in a route or not, and can switch between routes anytime.

### Agent Route Navigation

When agent starts a route session:

**Dashboard Display:**
- Next nearest store (from route or orders)
- Store identification with colored badges:
  - 🔵 Session Store (from route)
  - 🟢 Order (store with pending order)
- Contact button
- Directions button (opens Google Maps)
- Action button with options:
  - Cancel Order (if active order exists)
  - Mark as Visited (with reason selection)
  - Record Sale
  - Record Transaction

**Map View:**
- Agent's current location (real-time)
- Next store location (pinpoint)
- Route visualization

**Mark as Visited Validation:**
- Agent location must be within 100m of store (configurable)
- Admin can enable/disable proximity check
- Prevents fake "mark as visited" actions
- Customer receives push notification when marked as visited

**Reasons for Mark as Visited (no sale):**
- Stock Available
- Other Bottle/Brand
- Other Reason

### Map Page (Admin/Manager Only)

**Purpose:** Real-time monitoring of all users and route visualization

**Access:** Super Admin and Managers only

**Features:**

**1. User Location Tracking**
- Real-time location of all active users
- Filter by user type:
  - All Users (Agents + Marketers + POS + Managers)
  - Agents Only
  - Marketers Only
  - POS Only
  - All (Users + Customers + Stores)

**2. Route Visualization**
- Select Store Type from dropdown
- Select Route from filtered list
- Map displays:
  - All stores in selected route
  - All agents with access to that route (layered view)
  - Route path/sequence

**3. Map Markers**

| Icon/Color | Meaning |
|------------|---------|
| 🏠 Red House | Company Location (headquarters) |
| 🟢 Green Pin | Visited Stores (today) |
| 🟠 Orange Pin | Stores with Pending Orders (not visited) |
| 🟡 Yellow Pin | Unvisited Stores (no order, not visited) |
| 🚚 Truck Icon | Agent Location (real-time) |
| 👤 Person Icon | Marketer Location (real-time) |

**4. Interactive Features**
- Click on store marker → View store details
  - Store name, type, outstanding
  - Last visit date/time
  - Assigned route
  - Quick actions: Call, Directions
- Click on user marker → View user details
  - User name, role
  - Current activity
  - Today's stats (sales, collections)
- Click on company marker → View company info

**5. Map Controls**
- Zoom in/out
- Center on company location
- Center on specific user
- Toggle marker layers (show/hide stores, users, routes)
- Refresh interval (auto-refresh every 30 seconds)

**6. Legend**
- Always visible legend explaining all markers
- Toggle visibility of each marker type

---

## Sales & Transactions

### Record Sale

**Purpose:** Record a sale transaction with products delivered and payment collected

**Flow:**
1. Select customer (from accessible customers)
2. Select store (inactive stores are highlighted but greyed out and disabled from selection)
3. Add products with quantities
4. Prices auto-populate (custom store price → store type price → base price)
5. Calculate total
6. Enter payment collected:
   - Cash amount
   - UPI amount
7. Outstanding calculation:
   - New Outstanding = Old Outstanding + (Total - Cash - UPI)
8. Save sale

**Offline Support:**
- Can record sales offline
- Syncs when internet connection restored
- Timestamp preserved for accurate reporting

**Location Validation:**
- Admin can enable proximity check (100m radius)
- Ensures agent is at store location when recording sale

**Order Fulfillment:**
- If store has active order, it's marked as "Delivered"
- Sale items and quantities shown in order summary
- No direct link between order and sale (latest sale = fulfillment)

### Record Transaction

**Purpose:** Record payment received (without product delivery)

**Flow:**
1. Select customer
2. Select store (inactive stores are highlighted but greyed out and disabled from selection)
3. Select date of payment
4. Enter payment received:
   - Cash amount
   - UPI amount
5. Outstanding calculation:
   - New Outstanding = Old Outstanding - (Cash + UPI)
6. Save transaction

**Offline Support:**
- Can record transactions offline
- Syncs when online
- Timestamp preserved

### Proxy Recording (Admin/Manager Feature)

**Purpose:** Allow Admin/Managers to record sales/transactions on behalf of other users

**Use Case:** When a user (e.g., Agent, Driver) cannot access the system but has made sales/collections

**How It Works:**

**Recording for Another User:**
1. Admin/Manager goes to Record Sale or Record Transaction
2. Additional field appears: "Record for user" dropdown
3. Options:
   - **Self** (default) - Record as own action
   - **For [User Name]** - Record on behalf of another user
4. Select user from dropdown (Agents, Marketers, POS)
5. Complete sale/transaction as normal
6. Save

**Record Attribution:**
- **Created By**: Admin/Manager name (who actually created the record)
- **Assigned To**: Selected user name (who the record is for)
- Appears in selected user's history as:
  ```
  Sale #12345
  Created by: Admin Rajesh (for you)
  Date: 2026-01-19 10:30 AM
  ```

**Handover Tracking:**
- Amount added to selected user's handoverables
- User sees it in their pending handoverables
- User can mark as "Handed over to Manager"
- Admin/Manager can also mark as collected directly:
  - Option 1: "Collected by me" (Admin marks immediately)
  - Option 2: "Pending from user" (User marks later)

**Permissions:**
- Only Admin and Managers can use proxy recording
- Can record for any user type (Agent, Marketer, POS)
- Cannot record for other Admins or Managers
- Cannot record for Customers

**Use Cases:**
- Driver/Agent calls in sales over phone
- Offline user's data entry by office staff
- Bulk data entry from paper records
- Emergency recording when user's device is unavailable

---

### Outstanding Calculation

**Store Level:**
- Each store has its own outstanding amount
- Outstanding = Previous Outstanding + Sales Total - Payments

**Customer Level:**
- Total Outstanding = Sum of all store outstandings
- Displayed in customer profile
- Read-only (calculated field)

### Payment Methods
- Cash
- UPI
- Future: Card, Credit

---

## Handover System (Cash/UPI Collection Tracking)

### Overview

**Purpose:** Track cash and UPI collections by users and manage handover to Managers/Admins

**Applicable To:**
- ✅ Agents (from sales and transactions)
- ✅ Marketers (from transactions)
- ✅ POS users (from sales)
- ✅ Managers (from sales and transactions)
- ❌ Customers (no collection capability)

### Handoverable Amount Calculation

**Daily Handoverables = Total Cash Collected + Total UPI Collected**

**Tracked Separately:**
- Cash handoverables
- UPI handoverables
- Calculated per day per user

**Cumulative Pending:**
- If not collected on Day 1, adds to Day 2 total
- Total Pending Handoverables = Sum of all uncollected days

> [!NOTE]
> Opening Balance is NOT included in handoverables. It's only for initial customer balance setup.

### Two-Step Handover Process

**Step 1: User Marks "Handed Over"**
- User goes to History page
- Clicks on a date group
- Sees all records for that day
- Clicks "Handed over to [Manager Name]" button
- Selects which Manager/Admin they handed over to
- Status changes to "Awaiting Confirmation"

**Step 2: Manager Confirms Receipt**
- Manager receives in-app notification:
  ```
  Agent Rajesh says they handed over:
  Cash: ₹3,000
  UPI: ₹1,000
  Date: 2026-01-19
  
  Did you receive this amount?
  [Yes, Confirm] [No, Reject]
  ```
- Manager can confirm in notification OR in Daily Sheet
- Once confirmed, amount is marked as collected
- User's pending handoverables are reduced

### History Page - Color-Coded Status

**Visual Indicators (Left Border Color):**

🔴 **Red** - Payment not handed over yet
- User hasn't marked as handed over
- Action required by user

🟠 **Orange** - Awaiting Manager confirmation
- User marked as handed over
- Manager hasn't confirmed yet

🟢 **Green** - Confirmed and collected
- Manager confirmed receipt
- Shows "Collected by [Manager Name]"

**Example Layout:**
```
┌─────────────────────────────────────────┐
│ 🔴 📅 2026-01-19                        │
│ Sales: 5 | Cash: ₹3,000 | UPI: ₹1,000   │
│ Status: ⏳ Not handed over              │
│ [Hand over to Manager ▼]                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🟠 📅 2026-01-18                        │
│ Sales: 3 | Cash: ₹2,000 | UPI: ₹500     │
│ Status: ⏳ Handed to Manager Rajesh     │
│ Awaiting confirmation...                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🟢 📅 2026-01-17                        │
│ Sales: 4 | Cash: ₹2,500 | UPI: ₹800     │
│ Status: ✅ Collected by Manager Rajesh  │
│ Confirmed on: 2026-01-18 10:30 AM       │
└─────────────────────────────────────────┘
```

**Clicking a Date:**
- Expands to show all sales/transaction records for that day
- Shows detailed breakdown
- Handover controls visible

### Daily Sheet - Collection Management

**Accessed By:** Managers and Admins

**Purpose:** Mark collections as received from users

**Layout:**

```
📅 2026-01-19 - Collections Overview

┌──────────────────────────────────────────────────────────────┐
│ Agent 001 (Rajesh Kumar)                                     │
│ ├─ Cash:  ₹3,000  ☐ Collected by: _______                   │
│ ├─ UPI:   ₹1,000  ☐ Collected by: _______                   │
│ └─ Status: 🟠 Handed over, awaiting confirmation             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Agent 002 (Priya Sharma)                                     │
│ ├─ Cash:  ₹5,000  ☐ Collected by: _______                   │
│ ├─ UPI:   ₹2,000  ☐ Collected by: _______                   │
│ └─ Status: 🔴 Pending handover                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Marketer 001 (Amit Patel)                                    │
│ ├─ Cash:  ₹0      ☐ Collected by: _______                   │
│ ├─ UPI:   ₹500    ☐ Collected by: _______                   │
│ └─ Status: 🔴 Pending handover                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ POS 001 (Counter User)                                       │
│ ├─ Cash:  ₹8,000  ☐ Collected by: _______                   │
│ ├─ UPI:   ₹3,500  ☐ Collected by: _______                   │
│ └─ Status: 🔴 Pending handover                               │
└──────────────────────────────────────────────────────────────┘
```

**Functionality:**
- Manager/Admin checks the checkbox next to Cash/UPI
- Their name auto-fills in "Collected by" field
- Once checked, checkbox becomes disabled
- Shows who collected the amount
- Cannot be unchecked (permanent record)
- Both Cash and UPI can be collected independently

### Partial Collection Feature

**Admin Setting:** Enable/Disable partial collections

**When Disabled (Default):**
- Single checkbox for full amount
- All-or-nothing collection
- Simpler, less confusion

**When Enabled:**
- Manager can enter partial amount collected
- Remaining amount stays pending
- More flexibility for real-world scenarios
- Example:
  ```
  Cash: ₹5,000
  ☐ Collect: [₹3,000] by: _______
  Remaining: ₹2,000 (pending)
  ```

### Dashboard Display

**Agent/Marketer/POS Dashboard:**
```
┌─────────────────────────────────────────┐
│ 💰 Today's Handoverables                │
│ Cash: ₹3,000 | UPI: ₹1,000              │
├─────────────────────────────────────────┤
│ ⏳ Total Pending Handoverables          │
│ Cash: ₹8,000 | UPI: ₹3,500              │
│ (Includes 3 days pending)               │
├─────────────────────────────────────────┤
│ ✅ Last Collection                      │
│ 2026-01-17 by Manager Rajesh            │
│ Cash: ₹2,500 | UPI: ₹800                │
└─────────────────────────────────────────┘
```

**Manager/Admin Dashboard:**
```
┌─────────────────────────────────────────┐
│ 📥 Pending Collection Requests          │
│ 5 users waiting for confirmation        │
│ Total: Cash ₹18,000 | UPI ₹7,500        │
│ [View Daily Sheet]                      │
└─────────────────────────────────────────┘
```

### Notifications

**To Manager (when user marks handed over):**
```
🔔 Collection Request
Agent Rajesh Kumar handed over:
💵 Cash: ₹3,000
📱 UPI: ₹1,000
📅 Date: 2026-01-19

Did you receive this amount?
[Confirm] [Reject]
```

**To User (when manager confirms):**
```
✅ Collection Confirmed
Manager Rajesh confirmed receipt of:
💵 Cash: ₹3,000
📱 UPI: ₹1,000
📅 Date: 2026-01-19
```

**To User (when manager rejects):**
```
❌ Collection Rejected
Manager Rajesh did not confirm receipt.
Please contact them directly.
```

---

## Orders Management

### Order Types

**1. Simple Order**
- Customer just indicates they need products
- No specific items/quantities
- Quick order placement

**2. Detailed Order**
- Customer selects specific products
- Specifies quantities for each product
- Detailed order information

**Configuration:**
- Admin configures order type per Store Type
- Can override for individual stores

```
|----------------------------------------------------------------------------------|
| Store Type       | Order Type                    | Auto Order                   |
|----------------------------------------------------------------------------------|
| <Type 1>         | Toggle: Simple/Detailed       | Toggle: Yes/No               |
| <Type 2>         | Toggle: Simple/Detailed       | Toggle: Yes/No               |
|----------------------------------------------------------------------------------|
```

### Auto Order Feature

**Purpose:** Automatically create recurring orders for customers

**Configuration:**
- Admin enables per Store Type
- Can override per store
- Customer configures:
  - Days of week for auto-order
  - For Simple: Just select days
  - For Detailed: Select days + quantities per product

**Execution:**
- System creates orders at 3:00 AM
- Orders marked as "Auto" (vs "Manual")
- Appears in orders list for fulfillment

### Order Constraints
- **One active order per store at a time**
- New order can only be placed after current order is fulfilled or cancelled

### Order Cancellation

**By Agent:**
1. Agent selects "Cancel Order" from action menu
2. Selects reason:
   - By Mistake
   - Stock Available
   - Other Brands
   - Other
3. Order cancelled
4. Customer receives push notification with:
   - Cancellation message
   - Disclaimer: "If you didn't cancel, please report"
   - Buttons: **Okay** | **Reorder** | **Report**

**Customer Response:**
- **Okay**: Acknowledges cancellation
- **Reorder**: Redirects to create order page (pre-filled if possible)
- **Report**: Shows reason selection form → Submits to Admin

**Admin Actions Page:**
- Shows all customer reports
- Filterable by date, customer, agent
- Admin can take action on reports

**By Customer:**
- Customers can cancel their own orders
- Same flow as agent cancellation
- No notification sent (self-initiated)

### Order Fulfillment

**Automatic Marking:**
- When agent creates a sale for a store with active order
- Order automatically marked as "Delivered"
- Sale details (items, quantities) shown in order summary
- No strict matching required (agent can deliver different items/quantities than ordered)

---

## Daily Reports

### Report Header - Summary Cards

**Financial Metrics:**
- 💰 Total Sales
- 💵 Total Cash Collected
- 📱 Total UPI Collected
- ⏳ Total Pending Amount

### Sales & Transactions Log

**Combined table showing all sales and transactions:**

| Time  | ID       | Name        | Type   | 500ML | Price | 1L | Price | 250ML | Price | Custom | Total | Cash | UPI | Old Bal | New Bal | Created By |
|-------|----------|-------------|--------|-------|-------|----|----|-------|-------|--------|-------|------|-----|---------|---------|------------|
| 11:55 | AP00064  | Tea Stall   | RETAIL | 10    | 120   | -  | -  | -     | -     | -      | 1200  | 500  | 200 | 100     | 600     | Agent001   |
| 10:00 | AP00242  | Tiffin Stall| RETAIL | -     | -     | -  | -  | -     | -     | -      | -     | 100  | -   | 100     | 0       | Agent010   |

**Columns:**
- Time: Transaction timestamp
- ID: Store ID
- Name: Store name
- Type: Store type
- Product columns: Quantity and price for each product
- Total: Total amount
- Cash/UPI: Payment collected
- Old Bal/New Bal: Outstanding before and after
- Created By: User who recorded the transaction

### User Performance Cards

**Displayed for all active participants (excluding customers):**

Each card shows:
- User name and role
- Total sales recorded
- Total cash collected
- Total UPI collected
- Total new stores added
- Total customers added
- Changes requested
- Other relevant actions

### Route Performance Section

**For each route:**
- Route name
- % Covered: (Visited stores / Total stores) × 100
- Stores Covered: Count
- Sales: Total sales amount
- Collected: Total payments
- Pending: Total outstanding

### Order Fulfillment Summary
- Total Manual Orders Fulfilled
- Total Auto Orders Fulfilled

### User Handover Status

**Below user performance cards, show handover status:**

```
┌──────────────────────────────────────────────────────────────┐
│ Agent 001 (Rajesh Kumar)                                     │
│ ├─ Cash:  ₹3,000  ☐ Collected by: _______                   │
│ ├─ UPI:   ₹1,000  ☐ Collected by: _______                   │
│ └─ Status: 🟠 Handed over, awaiting confirmation             │
└──────────────────────────────────────────────────────────────┘
```

**For Managers/Admins:**
- Can check boxes to mark as collected
- Name auto-fills when checked
- Once collected, checkbox disabled

**For Other Users:**
- View-only
- Shows collection status
- Shows who collected

### Date Selection
- Default: Today's data
- Date picker to view past days
- All metrics update based on selected date
- Handover status shown for selected date

### Export Options
- PDF export (formatted landscape/portrait)
- Excel export (future)
- Neat formatting for professional reports

### Layout
- **Landscape orientation recommended** for better data visibility

---

## Search & Filters

### Global Search

**Access:** All users (results filtered by permissions)

**Search Functionality:**
- Search bar in top navigation
- Search across:
  - Customers (by name, phone, email, ID)
  - Stores (by name, phone, address, ID)
  - Products (by name, SKU)
  - Users (Admin/Manager only)
  - Orders (by ID, customer name)
  - Sales (by ID, store name)

**Search Results:**
- Categorized by type (Customers, Stores, Products, etc.)
- Click to view details
- Quick actions available (Call, Directions, Record Sale, etc.)

### Filters

**Customer List Filters:**
- KYC Status (Verified, Pending, Not Requested, Rejected)
- Outstanding Amount (ranges)
- Store Type
- Route
- Last Order Date
- Created Date

**Store List Filters:**
- Store Type
- Route
- Status (Active, Disabled)
- Outstanding Amount (ranges)
- Last Visit Date
- Has Pending Order (Yes/No)

**Sales/Transaction Filters:**
- Date Range
- User (Created By)
- Customer
- Store
- Store Type
- Payment Method (Cash, UPI, Mixed)
- Amount Range

**Order Filters:**
- Status (Pending, Delivered, Cancelled)
- Order Type (Simple, Detailed, Auto, Manual)
- Store Type
- Date Range
- Created By

---

## Bulk Operations

**Access:** Admin and Managers only

### Bulk Customer Operations
- Bulk edit customer details
- Bulk KYC approval/rejection
- Bulk credit limit update
- Bulk export to Excel

### Bulk Store Operations
- Bulk route assignment
- Bulk enable/disable stores
- Bulk pricing updates
- Bulk export to Excel

### Bulk User Operations
- Bulk permission changes
- Bulk route access assignment
- Bulk enable/disable users
- Bulk invitation sending

### How It Works
1. Select multiple items (checkboxes)
2. Click "Bulk Actions" button
3. Select action from dropdown
4. Confirm changes
5. System processes in background
6. Notification when complete

---

## Analytics Dashboard

**Access:** Admin and Managers

### Overview Cards
- Total Sales (Today, Week, Month, Year)
- Total Collections (Cash + UPI)
- Total Outstanding
- Active Customers
- Active Stores
- Active Users
- Pending Orders
- Pending KYC Verifications

### Charts & Graphs

**Sales Analytics:**
- Sales trend (line chart - daily/weekly/monthly)
- Sales by Store Type (pie chart)
- Sales by Product (bar chart)
- Sales by Route (bar chart)

**Agent Performance:**
- Top performing agents (leaderboard)
- Agent-wise sales comparison (bar chart)
- Route completion rates (progress bars)
- Average sales per agent

**Customer Analytics:**
- Customers by KYC status (pie chart)
- Outstanding distribution (histogram)
- Top customers by sales volume
- Customer growth trend

**Store Analytics:**
- Stores by type (pie chart)
- Stores by outstanding range
- Most visited stores
- Least visited stores (needs attention)

**Product Analytics:**
- Top selling products
- Product-wise revenue
- Product sales trend

**Route Analytics:**
- Route efficiency metrics
- Route completion trends
- Route-wise sales comparison

### Time Period Selection
- Today
- Yesterday
- Last 7 Days
- Last 30 Days
- This Month
- Last Month
- Custom Date Range

### Export Analytics
- Export charts as images (PNG)
- Export data as Excel
- Generate PDF report

---

## Promotional Banners (Customer Dashboard)

**Purpose:** Display promotional content to customers based on their store type

**Access:** Admin creates and manages banners

### Banner Types

**1. Static Banner**
- Single image displayed
- Fixed position in customer dashboard
- Can have click action (link to product, offer page, etc.)

**2. Auto-Moving Banner (Carousel)**
- Multiple images rotate automatically
- Configurable transition time (3s, 5s, 10s)
- Manual navigation (prev/next buttons)
- Auto-pause on hover

### Banner Configuration

**Create Banner:**
- Upload image (JPG, PNG, max 2MB)
- Banner title
- Description (optional)
- Target Store Types (select multiple)
- Banner Type (Static/Carousel)
- Start Date & End Date (campaign duration)
- Click Action (optional):
  - Link to URL
  - Link to Product
  - Link to Offer Page
  - No Action
- Active/Inactive toggle

**Banner Display Logic:**
- Customer sees banners matching their store types
- Only active banners within date range shown
- Multiple banners shown in carousel if configured
- Static banners shown in dedicated section

**Banner Management:**
- List all banners
- Edit banner
- Duplicate banner (for similar campaigns)
- Delete banner
- View analytics (impressions, clicks)

### Customer View
- Banners displayed prominently on dashboard
- Responsive design (mobile/desktop)
- Smooth transitions
- Click tracking for analytics

---

## Audit Trail

**Purpose:** Track all system changes for accountability and security

**Access:** Admin only

### What is Logged

**User Actions:**
- Login/Logout
- Failed login attempts
- Password changes
- Role changes
- Permission changes
- Account enable/disable

**Data Modifications:**
- Customer created/edited/deleted
- Store created/edited/deleted/enabled/disabled
- Product created/edited/deleted
- Sale created/edited/deleted
- Transaction created/edited/deleted
- Order created/edited/cancelled
- Price changes (product, store type, custom)
- Route created/edited/deleted
- KYC approval/rejection

**System Events:**
- Daily store status reset
- Auto-order creation
- Bulk operations
- Data exports
- Settings changes

### Audit Log Details

**Each log entry contains:**
- Timestamp (date & time)
- User (who performed the action)
- Action Type (Create, Edit, Delete, etc.)
- Entity Type (Customer, Store, Product, etc.)
- Entity ID
- Changes Made (before & after values)
- IP Address
- Device Information

### Audit Trail UI

**Features:**
- Searchable by user, action type, entity type
- Filterable by date range
- Sortable by any column
- Export to Excel/PDF
- Detailed view for each entry
- Compare before/after values

**Use Cases:**
- Security audits
- Compliance reporting
- Dispute resolution
- Error tracking
- Performance monitoring

---

## Access Control System

### Permission Matrix - Sales & Transactions

**Default permissions by role:**

```
|----------------------------------------------------------------------------------|
| User Type    | Sale Records                  | Transaction Records              |
|----------------------------------------------------------------------------------|
|              | Create | Edit   | Delete       | Create | Edit   | Delete       |
|----------------------------------------------------------------------------------|
| Managers     | ✅     | ✅     | ✅           | ✅     | ✅     | ✅           |
| Marketers    | ❌     | ❌     | ❌           | ✅     | ❌     | ❌           |
| Agents       | ✅     | ❌     | ❌           | ✅     | ❌     | ❌           |
| Customers    | ❌     | ❌     | ❌           | ❌     | ❌     | ❌           |
|----------------------------------------------------------------------------------|
```

### Permission Matrix - Store Type Access

**Default access by role:**

```
|----------------------------------------------------------------------------------|
| User Type    | <Store Type 1> | <Store Type 2> | <Store Type 3>              |
|----------------------------------------------------------------------------------|
| Managers     | ✅             | ✅             | ✅                          |
| Marketers    | ❌             | ✅             | ❌                          |
| Agents       | ✅             | ❌             | ✅                          |
|----------------------------------------------------------------------------------|
```

### Permission Matrix - Orders

**Default permissions:**

```
|----------------------------------------------------------------------------------|
| User Type    | Orders                                                            |
|----------------------------------------------------------------------------------|
|              | Create         | Modify         | Delete                         |
|----------------------------------------------------------------------------------|
| Managers     | ✅             | ✅             | ✅                             |
| Marketers    | ✅             | ✅             | ✅                             |
| Agents       | ❌             | ❌             | ❌                             |
| Customers    | ✅             | ✅             | ✅                             |
|----------------------------------------------------------------------------------|
```

### Order Type Configuration

**Per Store Type:**

```
|----------------------------------------------------------------------------------|
| Store Type   | Order Type                    | Auto Order                       |
|----------------------------------------------------------------------------------|
| <Type 1>     | Toggle: Simple/Detailed       | Toggle: Yes/No                   |
| <Type 2>     | Toggle: Simple/Detailed       | Toggle: Yes/No                   |
|----------------------------------------------------------------------------------|
```

- Admin can override for individual stores
- Affects what customers see when creating orders

### Additional Permissions (Toggle-Based)

**Controlled by Admin per user (toggle on/off):**

| Permission | Key | Description |
|---|---|---|
| Price Override | `price_override` | Can override product pricing when recording sales |
| Record on Behalf | `record_behalf` | Can record sales/transactions on behalf of other users |
| Create Customers | `create_customers` | Can create new customer records |
| Create Stores | `create_stores` | Can create new store records |
| Edit Balance | `edit_balance` | Can manually adjust store outstanding balance (logged in Balance Adjustment log) |
| Opening Balance | `opening_balance` | Can set opening balance when creating a store (+ or - values supported) |

- Super Admin always has all permissions regardless of toggles
- Permissions are managed per-user in the Access Control → User Permissions panel
- Each permission can be independently enabled/disabled

### User-Specific Overrides

**Access Control UI:**
1. View default permission matrix
2. Click on user type (e.g., "Managers")
3. See list of all users with that role
4. Search functionality
5. Click individual user to override specific permissions
6. Changes apply only to that user

### Account Control
- **Enable/Disable Users**: Admin can turn user accounts on/off
- **Auth-level ban**: Disabling a user sets a ban at the authentication level (100-year ban duration)
- **Active session termination**: Already logged-in users are force-signed-out when their profile is marked inactive (checked on every page load)
- **Re-enabling**: Removes the auth ban, user can log in again immediately
- **Disabled users**: Cannot access system, see "Contact Admin" message

---

## Activity History

### Logging Scope
- **All user actions** are logged
- **Permanent storage** (no automatic deletion)
- **Timestamp** for each action
- **User identification** (who performed action)
- **Action details** (what was done)

### Viewable By
- Super Admin: All activity
- Managers: All activity
- Other roles: Cannot access activity history

### Activity Types Logged
- User login/logout
- Customer created/modified
- Store created/modified/transferred
- Product created/modified
- Sale recorded/edited/deleted
- Transaction recorded/edited/deleted
- Order created/modified/cancelled
- Route session started/ended
- Store marked as visited
- Permission changes
- Settings changes
- Any other system actions

### Activity History UI
- Filterable by:
  - User
  - Action type
  - Date range
  - Entity (customer, store, product, etc.)
- Searchable
- Exportable
- Detailed view for each activity

---

## Notifications

### Notification Types

**Push Notifications (Primary):**
- Order created
- Order cancelled (by agent)
- Order delivered (sale recorded)
- Store marked as visited
- Payment received
- KYC verification status
- System announcements

**Future: WhatsApp Integration**
- Same notification types
- Configurable per customer preference

### Customer Notifications

**Order Cancelled by Agent:**
```
Your order has been cancelled by our delivery agent.
Reason: [Stock Available / By Mistake / Other Brands]

If you didn't request this cancellation, please report to customer care.

[Okay] [Reorder] [Report]
```

**Store Marked as Visited (No Sale):**
```
Our delivery agent visited your store but no sale was recorded.
If the agent didn't visit your store, please contact customer care.

[Call Customer Care] [Okay]
```

**Order Delivered:**
```
Your order has been delivered!
Items: [Product list with quantities]
Total: ₹[amount]
Paid: ₹[amount]
Outstanding: ₹[amount]

[View Details]
```

**KYC Verification Status:**
```
✅ KYC Approved
Your KYC verification has been approved!
You can now enjoy higher credit limits.
```

```
❌ KYC Rejected
Your KYC verification was rejected.
Reason: [Unclear Images / Name Mismatch / etc.]

Please re-upload clear documents and try again.
[Upload Again]
```

### Agent Notifications

**Handover Confirmed:**
```
✅ Collection Confirmed
Manager Rajesh confirmed receipt of:
💵 Cash: ₹3,000
📱 UPI: ₹1,000
📅 Date: 2026-01-19
```

**Handover Rejected:**
```
❌ Collection Rejected
Manager Rajesh did not confirm receipt.
Please contact them directly.
```

**Admin Announcements:**
```
📢 System Announcement
[Admin message content]

From: Admin Name
Date: 2026-01-19
```

> [!NOTE]
> Agent notifications infrastructure is in place for future expansion. Additional notification types can be enabled as needed.

### Notification Settings
- Admin can configure which events trigger notifications
- Per-event enable/disable
- Template customization

---

## Customer Portal Features

### Dashboard
- View all stores
- View total outstanding across all stores
- Promotional banners (based on store types)
- Quick actions: Create Order, View History, Call Agent

### Sales History
- List of all sales for customer's stores
- Filter by store, date range
- View details: Products, quantities, prices, payments
- Download invoice (future)

### Transaction History
- List of all payments made
- Filter by store, date range
- View details: Amount, payment method, date
- Download receipt (future)

### Call Agent Button
- Prominent "Call Agent" button on dashboard
- Calls default customer care number (configured by Admin in settings)
- Admin sets this number in Company Settings
- Same number for all customers (centralized support)

### Order Management
- Create new orders (if allowed for store type)
- View pending orders
- View order history
- Cancel orders (if allowed)
- Reorder from history

### KYC Management
- Upload KYC documents
- View KYC status
- Re-upload if rejected
- View rejection reason

### Store Management
- View all owned stores
- View store details (address, phone, outstanding)
- View store photo
- Cannot edit stores (contact admin)

---

## Company Settings

### Basic Information
- Company Name
- GST Number
- Logo (image upload)
- Address
- Customer Care Number (for "Call Agent" button in customer portal)

### Credit Limit Configuration

**Per Store Type and KYC Status:**

```
|----------------------------------------------------------------------------------|
| Type         | Store Type 1  | Store Type 2  | Store Type 3                   |
|----------------------------------------------------------------------------------|
| KYC          | ₹5,000        | ₹10,000       | ₹7,500                         |
| Non-KYC      | ₹1,000        | ₹2,000        | ₹1,500                         |
|----------------------------------------------------------------------------------|
```

### Feature Toggles

**Location Validation:**
- Enable/Disable proximity check for sales
- Enable/Disable proximity check for mark as visited
- Proximity radius setting (default: 100m)

**Auto Order:**
- Enable/Disable globally
- Configure per store type

**Notifications:**
- Enable/Disable push notifications
- Configure per event type

**Handover System:**
- Enable/Disable partial collections for Managers
- Default: Disabled (all-or-nothing collection)
- When enabled: Managers can collect partial amounts

### Store Types Management
- Add/Edit/Delete store types
- Configure accessible products per type
- Set default pricing per type
- Set order type per type

### Product Categories & Groups
- Manage product categories
- Manage product groups
- Organize products for better management

### System Preferences
- Date format
- Currency symbol
- Time zone
- Language (future)

---

## Technical Stack

### Frontend
- **Framework**: React with Next.js or Vite
- **Styling**: Vanilla CSS (premium, modern design)
- **Mobile**: Responsive web app → Future: Capacitor for APK
- **Maps**: Free mapping service (OpenStreetMap / Leaflet)
- **Offline**: Service Workers for offline capability

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for images)
- **Real-time**: Supabase Realtime (for route updates)

### Key Features
- **Offline-First**: Service workers for offline data capture
- **Real-Time Sync**: Automatic sync when online
- **Location Services**: Geolocation API for agent tracking
- **Push Notifications**: Web Push API (future: FCM for mobile)

### Data Sync Strategy
- **Offline Actions**: Queued locally with timestamps
- **Online Sync**: Automatic background sync
- **Conflict Resolution**: Timestamp-based (latest wins)
- **Sync Priority**: Sales → Transactions → Other actions

### Security
- **Authentication**: Email/Password + Google OAuth
- **Authorization**: Row-Level Security (RLS) in Supabase
- **Role-Based Access**: Enforced at database level
- **Data Encryption**: HTTPS, encrypted storage

---

## Next Steps

1. ✅ Requirements Documentation (This document)
2. ⏳ Database Schema Design
3. ⏳ API Endpoints Specification
4. ⏳ UI/UX Wireframes
5. ⏳ Implementation Plan
6. ⏳ Development Phase
7. ⏳ Testing Phase
8. ⏳ Deployment

---

**Document Version**: 3.0
**Last Updated**: 2026-01-19
**Status**: Comprehensive Update - Ready for Review

## Changelog

### Version 3.0 (2026-01-19)
**Major Additions & Enhancements:**

1. **Authentication Strategy**
   - Selected invitation-based registration (Option 1)
   - Customers self-register
   - Staff receive email invitations with role pre-assigned
   - Enhanced security and access control

2. **Customer & Store Photos**
   - Customer photo upload (optional, max 5MB)
   - Store photo upload (optional, max 5MB)
   - Photo locked after KYC verification
   - Easy visual identification

3. **Enhanced KYC Verification**
   - Multi-document upload (Live Photo, Aadhar Front, Aadhar Back)
   - Admin/Manager approval workflow
   - Rejection with reasons
   - Re-upload capability
   - Status tracking (Not Requested, Pending, Verified, Rejected)

4. **POS Improvements**
   - Manual price entry (no auto-population)
   - Admin-configurable product access
   - No outstanding allowed (must be fully paid)
   - Flexible pricing for walk-in customers

5. **Map Page (Admin/Manager)**
   - Real-time user location tracking
   - Route visualization with store markers
   - Color-coded markers (🏠 Company, 🟢 Visited, 🟠 Ordered, 🟡 Unvisited)
   - User icons (🚚 Agent, 👤 Marketer)
   - Interactive features (click markers for details)
   - Filter by user type and route

6. **Proxy Recording**
   - Admin/Manager can record sales/transactions for other users
   - Proper attribution (Created By vs Assigned To)
   - Handover tracking for proxy records
   - Use cases: Phone-in sales, offline data entry

7. **Store Status Management**
   - Admin can disable/enable stores
   - Disabled stores: No sales, no transactions, orders cancelled
   - Historical data preserved
   - Re-enable anytime

8. **Daily Store Status Reset**
   - All stores reset to "unvisited" at 00:00 midnight
   - Fresh start each day
   - Historical data preserved for reporting

9. **Route Flexibility**
   - Routes are navigation guides only
   - Agents can record sales for ANY accessible customer/store
   - Can switch between routes anytime
   - Not restricted to route stores

10. **Search & Filters**
    - Global search across customers, stores, products, users, orders, sales
    - Comprehensive filters for all list views
    - Quick actions from search results

11. **Bulk Operations**
    - Bulk customer/store/user operations
    - Bulk KYC approval/rejection
    - Bulk route assignment
    - Bulk enable/disable
    - Background processing with notifications

12. **Analytics Dashboard**
    - Overview cards (sales, collections, outstanding, etc.)
    - Charts & graphs (sales trends, agent performance, customer analytics)
    - Time period selection
    - Export as PNG/Excel/PDF

13. **Promotional Banners**
    - Static and carousel banners
    - Target by store type
    - Campaign duration (start/end dates)
    - Click actions (links, products, offers)
    - Analytics (impressions, clicks)

14. **Audit Trail**
    - Complete logging of all system actions
    - User actions, data modifications, system events
    - Before/after values for changes
    - Searchable, filterable, exportable
    - Security and compliance

15. **Enhanced Notifications**
    - Agent notifications (handover confirmed/rejected, announcements)
    - KYC status notifications
    - Order notifications
    - In-app notification system

16. **Customer Portal Features**
    - **Navigation**: Home | Sales | Order+ | Transactions | Profile
    - **Home Page**: Dashboard with stats, promotional banners, quick actions
    - **Sales Page**: View all recorded deliveries (not orders)
      - Shows actual delivered items with custom pricing
      - Non-clickable cards with full details (Sale ID, Agent, Items table, Payments)
      - Outstanding balance displayed
      - Date range filters
    - **Order+ Page**: Create new orders (Simple/Detailed based on store type)
      - Only ONE active order at a time (Auto OR Manual)
    - **Transactions Page**: Complete financial history
      - Table format: Date, Description, Sale Amount, Paid, Old Balance, New Balance
      - Two types: "Delivery" (from Record Sale) and "Payment" (from Record Payment)
      - Clicking Sale Amount navigates to that sale in Sales page
      - Outstanding balance displayed
      - Filters: Date range, Type (All/Delivery/Payment)
    - **Profile Page**: Personal info, stores summary, settings
      - KYC verification indicator (✅ green checkmark next to name)
      - KYC done by agents only (not visible to customers)
      - Phone number read-only (contact admin to change)
    - **Store Profile**: Store details, financial summary (KYC only), items breakdown
      - Credit Limit section visible only to KYC-verified customers
      - Non-KYC customers don't see credit limit concept
    - **Call Agent**: Centralized customer care number button

17. **Company Settings**
    - Customer care number for customer portal
    - All existing settings preserved

### Version 2.0 (2026-01-19)
**Major Additions:**

1. **POS Role Added**
   - New user role for Point of Sale operations
   - Dashboard with sales stats and handoverables
   - Record sales for walk-in customers
   - History page with handover tracking
   - Uses global "POS" customer/store

2. **Handover System (Cash/UPI Collection Tracking)**
   - Two-step handover process (User marks → Manager confirms)
   - Color-coded history page (Red/Orange/Green status)
   - Daily Sheet for collection management
   - Cumulative pending handoverables tracking
   - In-app notifications for handover requests
   - Partial collection feature (admin toggle)
   - Dashboard widgets for all roles
   - Applicable to: Agents, Marketers, POS, Managers

3. **POS Customer & Store**
   - Global "POS" customer for walk-in sales
   - Store name same as Company Name
   - All products accessible
   - Shared by all POS users

4. **Updated Permissions**
   - Marketers can record transactions (have handoverables)
   - Managers can collect handovers
   - Admin can enable/disable partial collections

5. **Company Settings**
   - Added handover system toggle for partial collections

### Version 1.0 (2026-01-19)
- Initial requirements documentation
- 6 user roles (Super Admin, Managers, Agents, Marketers, POS, Customers)
- Complete system architecture
- All core features documented

---

**Total Features Documented:** 22 major sections, 100+ sub-features
**Total Pages:** ~60 pages (estimated)
**Ready for:** Database Schema Design, UI/UX Wireframes, Implementation Planning
