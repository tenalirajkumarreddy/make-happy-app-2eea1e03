# BizManager Business Flows

**Analysis Date:** 2026-04-19

---

## 1. Sales Recording Flow

### Web Flow (`src/pages/Sales.tsx`)

**Step-by-Step:**
1. **Open Record Dialog** - Check permissions: price_override, record_behalf
2. **Store Selection** - POS users locked to POS store; others select from accessible stores
3. **Display Pending Orders** - Query orders with status='pending' for selected store
4. **Product Selection** - Fetch store_type_products matrix; apply pricing hierarchy
5. **Payment Entry** - Cash + UPI inputs; calculate outstanding = total - cash - upi
6. **Credit Validation** - Resolve limit from customer override or store_type; block if exceeded
7. **Submit Sale** - If offline: queue; if online: RPC record_sale()
8. **Post-Sale** - Invalidate caches, send notifications, log activity

### Mobile Flow (`src/mobile/pages/agent/AgentRecord.tsx`)

**Components:**
- StorePickerSheet for store selection
- Product grid with +/- quantity controls
- Confirmation dialog with summary
- Proximity check for GPS validation
- Offline queue support

---

## 2. Payment Collection Flow

### Web Flow (`src/pages/Transactions.tsx`)

**Process:**
1. Select store (respects route/store-type access matrix)
2. Enter payment: Cash input + UPI input
3. Calculate total_payment = cash + upi
4. Preview balance: new_outstanding = old - total_payment
5. Submit: If offline queue; if online RPC record_transaction()
6. Backdate handling: Rebuild running balances for all transactions

### Key Validation
- Store must have linked customer
- Payment amount must be positive
- Cash and UPI cannot be negative

---

## 3. Route Visit Flow

**Components:** `src/hooks/useRouteSession.ts`, `src/mobile/pages/agent/AgentRoutes.tsx`

**Flow:**
1. **Start Session** - Get GPS; insert route_sessions with status='active'
2. **Navigate Route** - Display stores in order with outstanding and distance
3. **Store Check-In** - Get GPS; insert store_visits with lat/lng
4. **Actions** - Visit, Record Sale, Collect Payment
5. **End Session** - Get GPS; update route_sessions status='completed'

**Data Tracked:**
- route_sessions: agent movements
- store_visits: individual store check-ins
- Used for visit compliance and completion rates

---

## 4. Order Fulfillment Flow

**Components:** `src/pages/Orders.tsx`, `src/components/orders/OrderFulfillmentDialog.tsx`

**States:**
- pending -> delivered (auto on sale OR manual)
- pending -> cancelled

**Process:**
1. Create order: simple (note) or detailed (products)
2. Credit check for detailed orders: check_store_credit_limit RPC
3. Auto-delivery: RPC record_sale() updates pending orders to delivered
4. Manual fulfillment: Convert order_items to sale_items via dialog
5. Cancellation: Record reason; notify customer if linked

---

## 5. Inventory Stock Flow

**Components:** `src/pages/Inventory.tsx`, `src/hooks/inventory/`

**Stock Sources:**
- product_stock (warehouse level)
- staff_stock (agent/marketer holdings)

**Transfer Types by Role:**
- super_admin: All types including warehouse_to_warehouse
- manager: warehouse_to_staff, staff_to_warehouse, staff_to_staff
- pos: warehouse_to_staff, staff_to_staff
- agent/marketer: staff_to_warehouse, staff_to_staff only

**Return Workflow:**
1. Staff initiates staff_to_warehouse return
2. Manager reviews pending returns
3. Approve/Reject with actual_quantity vs requested
4. Discrepancy handling: flag or write-off

---

## 6. Handover/Cash Management Flow

**Components:** `src/pages/Handovers.tsx`

**Balance Calculation:**
```
not_handed_over = sales_total + received_confirmed - sent_confirmed - sent_pending
```

**Handover States:**
- awaiting_confirmation
- confirmed
- rejected
- cancelled

**Process:**
1. Select recipient staff
2. Enter amount (cash + UPI split)
3. Validation: partial_collections setting; max balance check
4. RPC create_handover()
5. Receiver confirms/rejects
6. Sender can cancel pending handovers

**Expense Claims:**
- Submit: category, amount, description, receipt photo
- Status: pending -> approved/rejected
- Approved amount can differ from claimed
- Approved expenses deducted from handover balance

---

## 7. User Onboarding Flows

### Staff Onboarding

**Edge Function:** `supabase/functions/invite-staff/index.ts`

**Process:**
1. Admin enters: email, phone, full_name, role, warehouse_ids
2. Create auth user, profile, user_roles
3. Send invitation email/SMS
4. First login: Set password
5. Mobile permissions setup: location, camera, notifications

### Customer Onboarding

**Auth Flow:** Firebase Phone OTP -> Supabase Token Exchange

**Process:**
1. Phone verification via Firebase
2. Exchange for Supabase token via edge function
3. Create customer record linked to auth user
4. KYC submission: selfie, Aadhar front/back
5. KYC review: pending -> verified/rejected (affects credit limits)

---

## 8. Credit Limit Resolution Flow

**Components:** `src/lib/creditLimit.ts`

**Hierarchy:**
1. customer.credit_limit_override (highest priority)
2. store_type.credit_limit_kyc (if KYC verified)
3. store_type.credit_limit_no_kyc (default)

**Validation Points:**
- Order creation (detailed orders)
- Sale recording
- RPC record_sale() enforces at database level

---

## 9. Offline Queue Flow

**Components:** `src/lib/offlineQueue.ts`, `src/hooks/useOnlineStatus.ts`

**Process:**
1. Check navigator.onLine before operations
2. If offline: Queue in IndexedDB with business key deduplication
3. When online: Process queue sequentially
4. Types: sale, transaction, customer, store, etc.

---

*Business flows analysis: 2026-04-19*
