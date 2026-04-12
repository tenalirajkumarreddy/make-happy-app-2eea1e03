# Page Interaction Flows
## Visual Guide to Page Relationships and Data Flows

**Purpose:** Understand how pages interact, what data they share, and the impact of changes

---

## 🔄 Core Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE DATABASE                          │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│   sales     │  customers  │   stores    │     products          │
├─────────────┴─────────────┴─────────────┴───────────────────────┤
│  stock_movements  │  handovers  │  transactions  │  orders       │
├─────────────────────────────────────────────────────────────────┤
│  audit_log  │  receipts  │  route_sessions  │  offline_queue    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Realtime Subscriptions
                              │ RPC Functions
                              │ Edge Functions
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REACT FRONTEND                             │
├─────────────────────────────────────────────────────────────────┤
│  Auth Layer → Role-Based Routing → Page Guards                   │
├─────────────────────────────────────────────────────────────────┤
│  Shared State (AuthContext) → Role-Specific Dashboards          │
├─────────────────────────────────────────────────────────────────┤
│  Component Hierarchy → Data Fetching → Caching (React Query)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Master Page Relationship Map

```
                                        ┌─────────────────┐
                                        │   /auth         │
                                        │   Login/OTP     │
                                        └────────┬────────┘
                                                 │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ▼                              ▼                              ▼
        ┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
        │   Super Admin     │          │     Manager       │          │      Agent        │
        │   (/admin/*)      │          │   (/manager/*)    │          │    (/agent/*)     │
        └─────────┬─────────┘          └─────────┬─────────┘          └─────────┬─────────┘
                  │                              │                              │
    ┌─────────────┼─────────────┐    ┌──────────┼──────────┐       ┌───────────┼───────────┐
    │             │             │    │          │          │       │           │           │
    ▼             ▼             ▼    ▼          ▼          ▼       ▼           ▼           ▼
┌──────┐     ┌──────┐     ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  ┌──────┐  ┌──────┐
│Access │     │Staff │     │Audit │ │Sales │ │Inv.  │ │Report│ │Routes│  │Record│  │Scan  │
│Control│     │Dir.  │     │Logs  │ │      │ │      │ │      │ │      │  │Sale  │  │      │
└──┬────┘     └──┬───┘     └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘  └──┬───┘  └──┬───┘
   │             │            │       │       │       │       │        │         │
   │             │            │       │       │       │       │        │         │
   └─────────────┴────────────┴───────┴───────┴───────┴───────┴────────┴─────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │   Shared Data & Services         │
                    │   • customers, stores, products    │
                    │   • sales, transactions          │
                    │   • stock, handovers             │
                    └──────────────────────────────────┘
```

---

## 🎯 Sales Recording Flow

```
User Journey: Recording a Sale

Step 1: Navigate to Sales Page
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dashboard  │────▶│   /sales    │────▶│  Load Form  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Fetch Data: │
                                        │ • stores    │
                                        │ • products  │
                                        │ • stock     │
                                        └──────┬──────┘
                                               │
                                               ▼
Step 2: Select Store                    ┌─────────────┐
┌─────────────┐                        │ Store       │
│ Store       │◀───────────────────────│ Selector    │
│ Selector    │    Search/Select       │ (Async)     │
└──────┬──────┘                        └─────────────┘
       │
       ▼
┌─────────────┐
│ Fetch Store │
│ Details:    │
│ • outstanding│
│ • credit_limit│
│ • address   │
└─────────────┘

Step 3: Add Products
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Product     │────▶│  Check      │────▶│  Add to     │
│ Search      │     │  Stock      │     │  Cart       │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Cart State │
                                        │  (Local)    │
                                        └─────────────┘
                                               │
                                               ▼
Step 4: Enter Payment                 ┌─────────────┐
┌─────────────┐                       │ Validate    │
│ Payment     │◀─────────────────────│ Payment     │
│ Inputs      │    Cash + UPI         │ Split       │
└──────┬──────┘                       └─────────────┘
       │
       ▼
┌─────────────┐
│ Calculate   │
│ Outstanding │
│ Preview     │
└──────┬──────┘
       │
       ▼
Step 5: Submit Sale                   ┌─────────────┐     ┌─────────────┐
┌─────────────┐                      │ record_sale │────▶│  Database   │
│ Submit      │─────────────────────▶│ RPC         │     │  Triggers   │
│ Button      │                      └─────────────┘     └──────┬──────┘
└─────────────┘                                                  │
                                                                 ▼
                                                          ┌─────────────┐
                                                          │ • Deduct    │
                                                          │   stock     │
                                                          │ • Update    │
                                                          │   store     │
                                                          │ • Create    │
                                                          │   receipt   │
                                                          │ • Audit log │
                                                          └──────┬──────┘
                                                                 │
                                                                 ▼
                                                          ┌─────────────┐
                                                          │ Success     │
                                                          │ Response    │
                                                          └──────┬──────┘
                                                                 │
                                                                 ▼
                                                          ┌─────────────┐
                                                          │ Show        │
                                                          │ Receipt     │
                                                          └─────────────┘

Impact Chain:
• sales ← new record
• sale_items ← line items
• stores.outstanding ← updated
• staff_stock ← deducted
• stock_movements ← new entry
• receipts ← generated
• audit_log ← entry created
• analytics_cache ← invalidated
```

---

## 🔄 Stock Management Flow

```
Scenario: Stock Transfer

┌─────────────┐
│ Manager     │
│ Opens       │
│ Inventory   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ View Stock  │────▶│ Filter by   │
│ Table       │     │ Warehouse   │
└─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ Select      │
│ Transfer    │
│ Action      │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Transfer    │────▶│ Validate    │────▶│ Create      │
│ Form        │     │ Stock       │     │ Transfer    │
│ • From      │     │ • Sufficient│     │ Record      │
│ • To        │     │ • Valid     │     │             │
│ • Product   │     │   locations │     │             │
│ • Qty       │     │             │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Source:     │
                                        │ Deduct      │
                                        │ immediately │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Notify      │
                                        │ Recipient   │
                                        └─────────────┘
                                               │
                                               ▼
┌─────────────┐                       ┌─────────────┐
│ Recipient   │◀─────────────────────│ Confirm     │
│ Confirms    │    Push notification  │ Receipt     │
└──────┬──────┘                       └─────────────┘
       │
       ▼
┌─────────────┐
│ Destination:│
│ Add stock   │
└─────────────┘

Database Updates:
• staff_stock (source): quantity -= transfer_qty
• staff_stock (dest): quantity += transfer_qty (on confirm)
• stock_transfers: status = 'confirmed'
• stock_movements: 2 entries (out, in)
• notifications: created for recipient
```

---

## 🚚 Route Management Flow

```
Daily Route Flow

┌─────────────┐
│ Morning:    │
│ Agent opens │
│ Dashboard   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ View Today's│────▶│ Load Route  │
│ Route       │     │ Session     │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Fetch:      │
                    │ • stores    │
                    │ • sequence  │
                    │ • orders    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Check GPS   │
                    │ Permission  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │ Start    │     │ Optimize │     │ View Map │
   │ Route    │     │ Order    │     │          │
   └────┬─────┘     └────┬─────┘     └────┬─────┘
        │                │                │
        ▼                ▼                ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │ Navigate │     │ Call     │     │ Show     │
   │ to Store │     │ Distance │     │ Markers  │
   │ #1       │     │ API      │     │          │
   └────┬─────┘     └────┬─────┘     └──────────┘
        │                │
        ▼                ▼
   ┌──────────┐     ┌──────────┐
   │ At Store │     │ New      │
   │          │     │ Sequence │
   └────┬─────┘     └────┬─────┘
        │                │
        ▼                │
   ┌──────────┐          │
   │ Actions: │          │
   │ • Mark   │◀─────────┘
   │   visited│
   │ • Record │
   │   sale   │
   │ • Take   │
   │   order  │
   │ • Add    │
   │   note   │
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │ Capture  │
   │ GPS      │
   │ Location │
   └────┬─────┘
        │
        ▼
   ┌──────────┐     ┌──────────┐
   │ Sync to  │────▶│ Update   │
   │ Server   │     │ Route    │
   │          │     │ Progress │
   └──────────┘     └────┬─────┘
                         │
                         ▼
                   ┌──────────┐
                   │ Next     │
                   │ Store?   │
                   └────┬─────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            Yes                       No
            │                         │
            ▼                         ▼
      ┌──────────┐              ┌──────────┐
      │ Navigate │              │ End      │
      │ to Next  │              │ Route    │
      └──────────┘              └──────────┘

Data Flow:
• route_sessions: created on start
• location_pings: continuous tracking
• route_stores: updated on each visit
• sales: linked to route_session_id
• orders: linked to store/route
```

---

## 💰 Handover Flow

```
End-of-Day Handover

┌─────────────┐
│ Agent       │
│ Opens       │
│ Handovers   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ View        │────▶│ Calculate   │
│ Summary     │     │ Today's     │
│ Card        │     │ Sales       │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ RPC:        │
                    │ create_     │
                    │ handover()  │
                    │ Server-side │
                    │ calculation │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Fetches:    │
                    │ • Today's   │
                    │   sales     │
                    │ • Received  │
                    │   transfers │
                    │ • Sent      │
                    │   transfers │
                    │ • Expenses  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Validates:  │
                    │ • No        │
                    │   duplicate │
                    │   handover  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Select      │
                    │ Recipient   │
                    └─────────────┘
                           │
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Create      │────▶│ Insert to   │────▶│ Notify      │
│ Handover    │     │ handovers   │     │ Recipient   │
│ Button      │     │ table       │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Manager     │
                                        │ Dashboard   │
                                        │ Shows       │
                                        │ Pending     │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Actions:    │
                                        │ • Confirm   │
                                        │ • Reject    │
                                        │ • Request   │
                                        │   info      │
                                        └──────┬──────┘
                                               │
                          ┌────────────────────┴────────────────────┐
                          │                                         │
                          ▼                                         ▼
                   ┌──────────┐                              ┌──────────┐
                   │ Confirm  │                              │ Reject   │
                   │          │                              │          │
                   └────┬─────┘                              └────┬─────┘
                        │                                         │
                        ▼                                         ▼
                   ┌──────────┐                              ┌──────────┐
                   │ Update   │                              │ Update   │
                   │ Status = │                              │ Status = │
                   │ confirmed│                              │ rejected │
                   └────┬─────┘                              └────┬─────┘
                        │                                         │
                        ▼                                         ▼
                   ┌──────────┐                              ┌──────────┐
                   │ Notify   │                              │ Notify   │
                   │ Agent    │                              │ Agent    │
                   └──────────┘                              └──────────┘

Database Impact:
• handovers: new record
• notifications: created for recipient
• On confirm: Both parties' handover amounts updated
• Audit trail logged
```

---

## 📱 Customer Portal Flow

```
Customer Journey: Making a Payment

┌─────────────┐
│ Customer    │
│ Logs in via │
│ Phone OTP   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Firebase    │────▶│ Exchange    │
│ Auth        │     │ for         │
│ (Phone)     │     │ Supabase    │
└─────────────┘     │ Token       │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Redirect to │
                    │ Customer    │
                    │ Portal      │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ View        │
                    │ Outstanding │
                    │ Amount      │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Click       │
                    │ "Pay Now"   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Payment     │────▶│ Razorpay  │
                    │ Gateway     │     │ /Stripe   │
                    │ Integration │     │ Checkout  │
                    └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Customer    │
                                        │ Completes   │
                                        │ Payment     │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Webhook     │
                                        │ Callback    │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ record_     │
                                        │ transaction │
                                        │ RPC         │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Updates:    │
                                        │ • customer  │
                                        │   outstanding│
                                        │ • store     │
                                        │   outstanding│
                                        │ • receipt   │
                                        │ • audit_log │
                                        └──────┬──────
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Show        │
                                        │ Success +   │
                                        │ Receipt     │
                                        └─────────────┘
```

---

## 🔄 Offline Sync Flow

```
Offline Sale Recording (Agent)

┌─────────────┐
│ Agent       │
│ Records     │
│ Sale        │
│ (No         │
│ Network)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Detect      │
│ Offline     │
│ State       │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Queue in    │────▶│ Store in    │
│ IndexedDB   │     │ offlineQueue│
│ with        │     │ table       │
│ Context:    │     │             │
│ • Prices    │     │             │
│ • Credit    │     │             │
│   limit     │     │             │
│ • Stock     │     │             │
└─────────────┘     └─────────────┘
       │
       │ Network Restored
       ▼
┌─────────────┐     ┌─────────────┐
│ Sync Queue  │────▶│ Validate    │
│ Triggered   │     │ Context     │
└─────────────┘     └──────┬──────┘
                           │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Context  │    │ Context  │    │ Context  │
     │ Valid    │    │ Changed  │    │ Changed  │
     │          │    │ (Minor)  │    │ (Major)  │
     └────┬─────┘    └────┬─────┘    └────┬─────┘
          │               │               │
          ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Process  │    │ Adjust   │    │ Show     │
     │ Normally │    & Process │    │ Conflict │
     └──────────┘    └──────────┘    │ Resolver │
                                     └──────────┘

Conflict Types:
1. Price Changed → Auto-adjust line items
2. Credit Limit Exceeded → Require confirmation
3. Stock Unavailable → Offer alternatives
4. Store Inactive → Block sale
```

---

## 📝 Audit Trail Flow

```
Any Data Change

┌─────────────┐
│ User        │
│ Action      │
│ (INSERT/    │
│ UPDATE/     │
│ DELETE)     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Database    │
│ Trigger     │
│ Fires       │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Capture:    │────▶│ Insert to   │
│ • Table     │     │ audit_log   │
│ • Record ID │     │             │
│ • Action    │     │             │
│ • Old       │     │             │
│   values    │     │             │
│ • New       │     │             │
│   values    │     │             │
│ • User ID   │     │             │
│ • Timestamp │     │             │
│ • IP        │     │             │
│ • User      │     │             │
│   Agent     │     │             │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Realtime    │
                    │ Broadcast   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Admin       │
                    │ Audit       │
                    │ Dashboard   │
                    │ Updates     │
                    └─────────────┘

Viewable in:
• AuditLogDashboard (/admin/audit)
• Activity page (/activity)
• Per-record history
```

---

## 🔄 Realtime Update Flow

```
Multi-User Scenario: Manager + Agent

Time ──────────────────────────────────────────────▶

Manager                Database                 Agent
   │                       │                       │
   │  1. Update product    │                       │
   │──────price───────────▶│                       │
   │                       │                       │
   │                       │  2. Broadcast         │
   │                       │────change────────────▶│
   │                       │                       │
   │                       │                       │  3. UI
   │                       │                       │    updates
   │                       │                       │    automatically
   │                       │                       │
   │                       │  4. Agent sees        │
   │                       │◀───new price──────────│
   │                       │                       │

Tables with Realtime:
• sales → Broadcast to dashboards
• handovers → Live handover updates
• stock_movements → Inventory updates
• notifications → Push notifications
• audit_log → Admin monitoring
```

---

## 🎯 Cross-Page Dependencies

### Critical Dependencies Map

```
If you change...                    These pages are affected...
─────────────────────────────────────────────────────────────────
/products
  └─► /sales (product selector)
  └─► /inventory (stock lookup)
  └─► /reports (product analytics)

/customers
  └─► /sales (store selector)
  └─► /routes (store assignments)
  └─► /handovers (outstanding calc)
  └─► /portal/* (customer views)

/sales
  └─► /inventory (stock deduction)
  └─► /handovers (amount calculation)
  └─► /customers (outstanding update)
  └─► /analytics (metrics update)

/stores
  └─► /routes (store inclusion)
  └─► /sales (store selector)
  └─► /customers (customer stores)

/user_roles
  └─► ALL PAGES (access control)
  └─► /access-control (permissions)

/handovers
  └─► /handovers (recipient view)
  └─► /reports (cash flow)
```

---

## 📊 Data Consistency Checkpoints

### Before Deploying Changes, Verify:

| Check | Method | Frequency |
|-------|--------|-----------|
| Sales total = Sum of items | Automated test | Every release |
| Outstanding = Sales - Payments | Reconciliation job | Daily |
| Stock = Initial + Transfers - Sales | Inventory audit | Weekly |
| Handover = Sum of sales ± transfers | Verification | End of day |
| Agent location on visit | GPS validation | Real-time |
| Receipt data matches sale | Automated check | Every sale |
| Audit log completeness | Automated scan | Daily |
| Offline queue integrity | Health check | Hourly |

---

## 🚀 Change Impact Assessment Template

When modifying a page, ask:

1. **What data does this page read?**
   - List all tables/APIs
   - Check for caching implications

2. **What data does this page write?**
   - List mutations
   - Identify trigger impacts

3. **Who else reads this data?**
   - Search for shared queries
   - Check subscription keys

4. **What happens on error?**
   - Define rollback behavior
   - Plan for offline scenarios

5. **Is this covered by tests?**
   - Update unit tests
   - Add E2E scenarios

6. **Does this need documentation?**
   - Update user guides
   - Notify support team

---

*This document should be reviewed monthly or after major releases*
*Last updated: 2026-04-12*
