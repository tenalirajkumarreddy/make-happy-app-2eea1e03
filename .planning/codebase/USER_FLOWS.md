# BizManager User Flows Analysis

**Analysis Date:** 2026-04-12

---

## 1. Authentication Flow

### Overview
Dual authentication system supporting both staff (email/password) and customer (phone OTP) login with automatic role resolution.

### Component Chain
```
Auth.tsx → AuthContext.tsx → Supabase Auth → Edge Functions
```

### Flow Steps

#### Staff Authentication (Email/Password)
1. **Entry Point:** `src/pages/Auth.tsx` (lines 569-593)
2. User clicks "Continue with Google" or enters credentials
3. `supabase.auth.signInWithOAuth()` or `signInWithPassword()` called
4. **Role Resolution:** `supabase/functions/resolve-user-identity/index.ts`
   - Checks `staff_directory` by email/phone
   - Checks `staff_invitations` for pending invites
   - Updates `user_roles` table with resolved role
   - Upserts `profiles` with user metadata
5. **AuthContext** (`src/contexts/AuthContext.tsx`, lines 36-67):
   - Fetches role from `user_roles` table
   - Fetches profile from `profiles` table
   - Fetches customer link from `customers` table
   - Redirects to role-specific dashboard

#### Customer Authentication (Phone OTP)
1. **Entry Point:** `src/pages/Auth.tsx` (lines 243-334)
2. User enters phone number → `handleSendOtp()`
3. **Edge Function:** `supabase/functions/send-otp-opensms/index.ts`
   - Sends OTP via OpenSMS API
   - Returns session_token
4. User enters OTP → `handleVerifyOtp()`
5. **Edge Function:** `supabase/functions/verify-otp-opensms/index.ts`
   - Verifies OTP
   - Calls `resolve-user-identity` for role/customer resolution
   - Sets Supabase session
6. If new customer: Redirects to registration flow (lines 388-412)
7. If existing customer: Redirects to CustomerPortal

### Key Tables
- `auth.users` - Supabase auth users
- `user_roles` - Role assignments (super_admin, manager, agent, marketer, pos, customer)
- `profiles` - User profile data
- `customers` - Customer records linked to auth.users
- `staff_directory` - Staff records for role resolution
- `staff_invitations` - Pending staff invites

### Edge Functions
- `send-otp-opensms` - Send OTP to phone
- `verify-otp-opensms` - Verify OTP code
- `resolve-user-identity` - Resolve user role and identity
- `invite-staff` - Super admin staff invitation

---

## 2. Sales Recording Flow

### Overview
Atomic sale recording with credit limit validation, offline queue support, and proximity checks for agents.

### Component Chain (Web)
```
Sales.tsx → record_sale RPC → Database Triggers
```

### Component Chain (Mobile)
```
AgentRecord.tsx → proximity check → record_sale RPC
```

### Flow Steps

#### Web Flow (`src/pages/Sales.tsx`)
1. **Entry Point:** Lines 95-1052
2. **Store Selection:**
   - POS users: Auto-locked to POS_STORE_ID (line 62)
   - Others: Dropdown + QR scanner (lines 871-881)
3. **Product Selection:**
   - Fetches available products by store_type_id (lines 224-264)
   - Applies pricing hierarchy: store_pricing > store_type_pricing > base_price
4. **Payment Entry:**
   - Cash + UPI amounts (lines 996-998)
   - Real-time outstanding calculation (lines 301-313)
5. **Credit Limit Check:**
   - Uses `resolveCreditLimit()` from `src/lib/creditLimit.ts`
   - Blocks if credit exceeded (lines 1009-1015)
6. **Proximity Check** (Agents only, lines 396-407):
   - Imports `checkProximity` from `src/lib/proximity.ts`
   - Validates GPS location within range
7. **Offline Queue Check** (lines 417-464):
   - If offline: Queues to IndexedDB via `addToQueue()`
   - If online: Proceeds to RPC
8. **Atomic Recording** (lines 466-506):
   - Generates display_id via `generate_display_id` RPC
   - Calls `record_sale` RPC with all sale data
   - RPC handles: insert sale + items, update outstanding, deliver orders

#### Mobile Flow (`src/mobile/pages/agent/AgentRecord.tsx`)
1. **Entry Point:** Lines 50-855 (RecordSale component)
2. **Store Picker:** Uses `StorePickerSheet` component
3. **Product Cart:** +/- quantity buttons (lines 539-598)
4. **Proximity Validation:** Lines 277-297
   - Checks `company_settings.location_validation`
   - Calls `checkProximity()` from `src/lib/proximity.ts`
5. **Offline Handling:** Lines 318-333
   - Queues to offline storage via `addToQueue()`
   - Synced when back online via `useOnlineStatus.ts`
6. **Confirmation Dialog:** Lines 792-841
   - Review sale details before submission

### Key RPC Functions
- `record_sale()` - Atomic sale insertion with credit limit enforcement
- `generate_display_id()` - Generate display IDs (SALE-XXXXXX)
- `check_store_credit_limit()` - Pre-sale credit validation

### Offline Handling
- **Queue:** `src/lib/offlineQueue.ts` (lines 1-425)
- **Sync:** `src/hooks/useOnlineStatus.ts` (lines 129-263)
- **Dedupe:** Business key generation prevents duplicate sales

---

## 3. Transaction/Payment Flow

### Overview
Payment collection with automatic outstanding calculation and historical balance reconciliation.

### Component Chain
```
Transactions.tsx → record_transaction RPC → stores.outstanding update
```

### Flow Steps

#### Web Flow (`src/pages/Transactions.tsx`)
1. **Entry Point:** Lines 30-451
2. **Store Selection:** Lines 417-432
   - Dropdown with QR scanner option
   - Shows current outstanding balance
3. **Payment Entry:** Lines 433-436
   - Cash amount input
   - UPI amount input
   - Notes field (optional)
4. **Balance Preview:** Lines 437-440
   - Real-time calculation of new outstanding
   - Visual indicator if payment exceeds balance
5. **Offline Check:** Lines 170-194
   - Queues to offline storage if no network
6. **Atomic Recording:** Lines 196-244
   - Generates PAY-XXXXXX display_id
   - Calls `record_transaction` RPC
   - RPC handles: insert transaction, update store.outstanding

#### Backdated Transaction Handling
When `txnDate` is provided (admin only):
1. Fetches all sales and transactions for store
2. Rebuilds running balance chronologically
3. Updates all historical records with correct old/new outstanding
4. Sets final outstanding on store (lines 976-1031)

### Key RPC Functions
- `record_transaction()` - Atomic transaction insertion
- Updates `stores.outstanding` via database trigger

---

## 4. Order Management Flow

### Overview
Order creation, fulfillment, and cancellation with credit limit pre-checks.

### Component Chain
```
Orders.tsx → orders table → OrderFulfillmentDialog → record_sale RPC
```

### Flow Steps

#### Order Creation (`src/pages/Orders.tsx`)
1. **Entry Point:** Lines 66-641
2. **Customer Selection:** Lines 539-544
3. **Store Selection:** Lines 546-552
4. **Order Type:**
   - Simple: Text note only (lines 565-567)
   - Detailed: Products + quantities (lines 569-590)
5. **Credit Limit Check:** Lines 197-232
   - Calls `check_store_credit_limit` RPC
   - Blocks if would exceed limit
6. **Order Insert:** Lines 236-260
   - Generates ORD-XXXXXX display_id
   - Inserts to `orders` table
   - Inserts order_items for detailed orders

#### Order Fulfillment
1. **Trigger:** Click "Fulfill" on pending order
2. **OrderFulfillmentDialog:** `src/components/orders/OrderFulfillmentDialog.tsx`
3. **Fulfillment Process:**
   - Loads order details with items
   - Creates sale via `record_sale` RPC
   - Updates order status to "delivered"
   - Auto-matches to pending orders via sale trigger

#### Order Cancellation
1. **Trigger:** Click "Cancel" button
2. **Reason Selection:** Lines 618-626
3. **Status Update:** Lines 344-381
   - Sets status to "cancelled"
   - Records cancellation_reason and cancelled_by
   - Notifies customer if linked

### Key Tables
- `orders` - Order headers
- `order_items` - Order line items
- `stores.outstanding` - Updated on fulfillment

---

## 5. Route/Agent Flow

### Overview
Route-based store management with GPS tracking, visit logging, and proximity enforcement.

### Component Chain
```
Routes.tsx → RouteSessionPanel → AgentRoutes.tsx → store_visits table
```

### Flow Steps

#### Route Management (`src/pages/Routes.tsx`)
1. **Entry Point:** Lines 22-211
2. **Store Type Tabs:** Lines 118-170
3. **Route Access Matrix:**
   - Agents see only routes in `agent_routes` with enabled=true
   - Falls back to all routes if no matrix entries (lines 54-69)
4. **Route Detail Navigation:** Lines 147-163

#### Mobile Agent Routes (`src/mobile/pages/agent/AgentRoutes.tsx`)
1. **Entry Point:** Lines 65-622
2. **Active Session:** `RouteSessionPanel` component
   - Start/end route sessions
   - GPS tracking while active
3. **Route List:** Lines 284-494
   - Shows store count, total outstanding, visit progress
   - Expands to show store list
4. **Store Visit Logging:**
   - Automatic on sale recording
   - Manual via store actions
5. **GPS Integration:**
   - Get current position (lines 210-218)
   - Calculate distance to stores (lines 195-208)
   - Sort orders by proximity

#### Visit Logging (Database)
- `route_sessions` table: Active session tracking
- `store_visits` table: Individual visit records with GPS coordinates

### Proximity Check (`src/lib/proximity.ts`)
- Checks if agent is within configured distance of store
- Returns `{ withinRange: boolean, message: string, skippedNoGps: boolean }`

---

## 6. Handover Flow

### Overview
Cash/UPI collection tracking between staff members with confirmation workflow.

### Component Chain
```
Handovers.tsx → handovers table → notifications
```

### Flow Steps

#### Create Handover (`src/pages/Handovers.tsx`)
1. **Entry Point:** Lines 35-1160
2. **Balance Calculation:** Lines 126-218
   - Sums sales (cash + upi) by recorded_by
   - Sums received handovers (confirmed)
   - Subtracts sent handovers (confirmed + pending)
   - Subtracts approved expenses
3. **Create Dialog:** Lines 994-1048
   - Select recipient staff member
   - Enter amount
   - Partial collection setting check (lines 1028-1033)
4. **Insert Handover:** Lines 299-326
   - Status: "awaiting_confirmation"
   - Notifies recipient

#### Confirm/Reject Handover
1. **Incoming List:** Lines 815-826
2. **Confirm:** Lines 329-358
   - Updates status to "confirmed"
   - Sets confirmed_by and confirmed_at
   - Notifies sender
3. **Reject:** Lines 360-383
   - Updates status to "rejected"
   - Notifies sender

#### Expense Claims
1. **Submit Claim:** Lines 421-475
   - Category, amount, description, receipt photo
   - Status: "pending"
2. **Review Claim:** Lines 477-532
   - Admin can approve/reject
   - Can adjust category and amount on approval

### Key Tables
- `handovers` - Handover records
- `expense_claims` - Expense claim records
- `expense_categories` - Configurable categories

---

## 7. Customer/Store Management Flow

### Overview
Customer onboarding with KYC verification and store assignment.

### Component Chain
```
Customers.tsx → customer insert → KycReviewDialog
Stores.tsx → store insert → CreateStoreWizard
```

### Flow Steps

#### Customer Creation (`src/pages/Customers.tsx`)
1. **Entry Point:** Lines 38-679
2. **Add Dialog:** Lines 612-641
   - Name (required)
   - Phone (required, validated)
   - Email (optional)
   - Address (optional)
   - Photo upload
3. **Duplicate Check:** Lines 99-106
   - Real-time phone duplicate detection
4. **Offline Queue:** Lines 138-162
   - Queues customer creation if offline
5. **Insert:** Lines 164-184
   - Generates CUST-XXXXXX display_id
   - Validates phone format

#### KYC Verification
1. **Customer KYC Upload:** Via mobile or customer portal
2. **Review Trigger:** Click KYC badge in customer list
3. **KycReviewDialog:** Lines 656-661
4. **Review Process:**
   - View uploaded documents
   - Approve: Set kyc_status to "verified"
   - Reject: Set to "rejected" with reason

#### Store Creation (`src/pages/Stores.tsx`)
1. **Entry Point:** Lines 32-587
2. **CreateStoreWizard:** Lines 542-547
3. **Fields:**
   - Name, customer, store type, route
   - Address, phone, GPS coordinates
   - Warehouse scoping (via WarehouseContext)
4. **CSV Import:** Lines 175-233
   - Bulk store creation from CSV

---

## 8. Real-time Sync Flow

### Overview
Role-optimized Supabase Realtime subscriptions for live data updates.

### Component Chain
```
useRealtimeSync.ts → Supabase Realtime → QueryClient invalidation
```

### Flow Steps (`src/hooks/useRealtimeSync.ts`)
1. **Initialization:** Lines 191-209
   - Subscribes based on user role
   - Shared channel for all subscribers
2. **Role-Based Table Subscriptions:** Lines 19-64
   - `super_admin`: All tables
   - `manager`: Operational tables
   - `agent`: Sales, routes, visits
   - `marketer`: Orders, customers
   - `pos`: Sales only
   - `customer`: Own orders only
3. **Payload Filtering:** Lines 117-140
   - Filters by recorded_by for sales/transactions
   - Filters by user_id for handovers
   - Prevents unrelated data invalidation
4. **Query Invalidation:** Lines 142-156
   - Maps table changes to React Query keys
   - Invalidates affected queries

### Table Query Mapping (Lines 67-97)
```typescript
sales → ["sales", "dashboard-stats", "agent-dashboard-stats", ...]
orders → ["orders", "store-orders", "mobile-marketer-orders", ...]
stores → ["stores", "customer-stores", "mobile-marketer-stores", ...]
handovers → ["handovers", "dashboard-stats"]
```

### Offline Sync Integration
- `useOnlineStatus.ts` manages online/offline state
- Auto-syncs queued actions when coming back online (lines 266-270)
- File upload sync for KYC documents (lines 59-127)

---

## Edge Functions Summary

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `send-otp-opensms` | Send SMS OTP to phone | No |
| `verify-otp-opensms` | Verify OTP and set session | No |
| `resolve-user-identity` | Resolve user role on login | Yes |
| `invite-staff` | Create staff accounts | super_admin |
| `firebase-phone-exchange` | Exchange Firebase token | Yes |
| `daily-handover-snapshot` | Scheduled: Daily handover reports | Service role |
| `daily-store-reset` | Scheduled: Reset daily balances | Service role |
| `auto-orders` | Scheduled: Auto-order generation | Service role |
| `toggle-user-ban` | Ban/unban users | super_admin |
| `expense-manager` | Expense claim processing | Yes |

---

## Key Database RPC Functions

| Function | Purpose | Called From |
|----------|---------|-------------|
| `record_sale()` | Atomic sale insertion | Sales.tsx, AgentRecord.tsx |
| `record_transaction()` | Atomic payment recording | Transactions.tsx, AgentRecord.tsx |
| `generate_display_id()` | Generate display IDs | Multiple pages |
| `check_store_credit_limit()` | Pre-sale credit check | Orders.tsx, Sales.tsx |

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  AuthContext → useAuth() hook for session/role                   │
│  React Query → Data fetching and caching                         │
│  OfflineQueue → IndexedDB for offline actions                   │
│  RealtimeSync → Supabase Realtime subscriptions                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Auth → User authentication                                    │
│  PostgREST → Table queries (RLS protected)                     │
│  Realtime → Change notifications                               │
│  Storage → File uploads (KYC docs, receipts)                  │
│  Edge Functions → Business logic, integrations                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Tables: sales, transactions, orders, customers, stores         │
│  RPC Functions: record_sale, record_transaction                │
│  Triggers: Outstanding recalculation, audit logging            │
│  RLS Policies: Row-level security per role                      │
└─────────────────────────────────────────────────────────────────┘
```

---

*User flows analysis completed: 2026-04-12*
