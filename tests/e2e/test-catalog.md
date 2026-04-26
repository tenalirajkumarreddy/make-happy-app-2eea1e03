# Comprehensive E2E Test Catalog
## Cross-Role Multi-User Testing Framework

---

## 📋 Test Philosophy

**Testing Scope:**
- ✅ Cross-role simultaneous user interactions
- ✅ Data flow between roles (real-time and async)
- ✅ Permission boundaries and data isolation
- ✅ Complete business workflows spanning multiple roles
- ✅ Data integrity and consistency across users
- ✅ Real-time sync behavior
- ✅ Edge cases and race conditions

**Testing Approach:**
- Page-wise action catalog
- Role-permission matrix
- Data flow diagrams
- Workflow scenarios
- Regression test suite

---

## 🎭 Role Definitions & Test Accounts

| Role | Phone | OTP | Default Warehouse | Description |
|------|-------|-----|-------------------|-------------|
| **super_admin** | +917997222262 | 000000 | ALL | Full system access |
| **manager** | +916305295757 | 000000 | Warehouse A | Warehouse-scoped admin |
| **agent** | +919494910007 | 000000 | Route-based | Field sales with routes |
| **marketer** | +919879879870 | 000000 | N/A | Sales with order creation |
| **operator** | +918888888888 | 000000 | POS Only | POS + Inventory + Attendance |
| **customer** | +919090909090 | 000000 | N/A | Self-service portal |

---

## 📑 Page Catalog with Actions & Data Flow

### 1. **Sales Page** (`/sales`)
**Accessible Roles:** super_admin, manager, agent, operator

#### Actions by Role:

**Operator (POS Terminal):**
- ✅ Create sale with full payment (no credit allowed)
- ✅ Store locked to POS (ID: 00000000-0000-0000-0000-000000000001)
- ✅ View products from POS warehouse
- ✅ Record sale via `record_sale` RPC
- ✅ Generate receipt
- ❌ Cannot modify store (locked)
- ❌ Cannot create credit sales
- ❌ Cannot view other warehouses

**Agent (Field Sales):**
- ✅ Create sale with credit option
- ✅ Select any store on their route
- ✅ View customer outstanding
- ✅ GPS proximity check before sale
- ✅ Record sale via `record_sale` RPC
- ✅ Schedule delivery

**Manager:**
- ✅ Create/modify sales
- ✅ Credit approval override
- ✅ View all warehouse sales
- ✅ Filter by warehouse/store/agent
- ✅ Export sales data

**super_admin:**
- ✅ All manager capabilities
- ✅ Cross-warehouse analytics
- ✅ Bulk operations

#### Data Flow:
```
Sale Created
    ↓
triggers `record_sale` RPC
    ↓
├── Updates: sale_records
├── Updates: customer (outstanding_balance)
├── Updates: store (balance)
├── Updates: inventory (quantity) via BOM
├── Creates: transactions (if payment)
├── Creates: invoices (if enabled)
└── Creates: activity_log
    ↓
Realtime Notification → Dashboard updates for ALL roles
```

#### Cross-Role Test Scenarios:
1. **TC-SALE-01**: Agent creates credit sale → Manager sees outstanding increase
2. **TC-SALE-02**: Operator creates cash sale → Inventory updates → Manager sees stock change
3. **TC-SALE-03**: Multiple simultaneous sales → No race conditions on inventory
4. **TC-SALE-04**: Agent sale with insufficient stock → Proper error handling

---

### 2. **Inventory Page** (`/inventory`)
**Accessible Roles:** super_admin, manager, operator

#### Actions by Role:

**Operator:**
- ✅ View inventory (POS warehouse only)
- ✅ View product details
- ✅ View stock alerts
- ❌ Cannot modify stock
- ❌ Cannot view other warehouses

**Manager:**
- ✅ View all warehouse inventory
- ✅ Filter by warehouse
- ✅ View stock transfers
- ✅ View production batches
- ✅ Create stock adjustments

**super_admin:**
- ✅ All manager capabilities
- ✅ Low stock alerts across warehouses
- ✅ Inventory valuation reports

#### Data Flow:
```
Stock Change (Transfer/Production/Sale)
    ↓
├── Updates: inventory.quantities
├── Updates: raw_materials (if production)
├── Creates: stock_transfer_records (if transfer)
└── Creates: activity_log
    ↓
Realtime → Inventory page updates for authorized roles
```

#### Cross-Role Test Scenarios:
1. **TC-INV-01**: Manager transfers stock → Operator sees updated quantities
2. **TC-INV-02**: Production batch completed → Inventory updates → All roles see changes
3. **TC-INV-03**: Low stock alert → Manager receives notification

---

### 3. **Customers Page** (`/customers`)
**Accessible Roles:** super_admin, manager, agent

#### Actions by Role:

**Agent:**
- ✅ View assigned customers
- ✅ Create new customer (if on route)
- ✅ Update customer details
- ✅ View customer outstanding
- ❌ Cannot view unassigned customers

**Manager:**
- ✅ View all customers in warehouse
- ✅ Create/modify customers
- ✅ View customer analytics
- ✅ Bulk customer operations

**super_admin:**
- ✅ View all customers across warehouses
- ✅ Cross-warehouse customer analytics

#### Data Flow:
```
Customer Created/Modified
    ↓
├── Creates/Updates: customers table
├── Creates: customer_warehouse_link (if warehouse-scoped)
├── Updates: customer_balance (if sale)
└── Creates: activity_log
    ↓
Realtime → Customer lists update for authorized users
```

#### Cross-Role Test Scenarios:
1. **TC-CUST-01**: Agent creates customer → Manager sees new customer
2. **TC-CUST-02**: Customer balance changes via sale → Agent sees updated outstanding
3. **TC-CUST-03**: Manager updates customer → Agent sees changes

---

### 4. **Orders Page** (`/orders`)
**Accessible Roles:** super_admin, manager, agent, marketer
**Blocked for:** operator

#### Actions by Role:

**Marketer:**
- ✅ Create orders for any customer
- ✅ Schedule delivery
- ✅ View order status
- ✅ Cancel orders

**Agent:**
- ✅ View orders for route customers
- ✅ Convert order to sale
- ✅ Update delivery status

**Manager:**
- ✅ View all orders
- ✅ Approve/reject orders
- ✅ Assign to agents
- ✅ Order analytics

#### Data Flow:
```
Order Created (Marketer)
    ↓
├── Creates: orders table entry
├── Creates: order_items
└── Creates: activity_log + notifications
    ↓
Agent sees order in dashboard
    ↓
Agent converts to Sale
    ↓
Order status: 'converted' → Links to sale
```

#### Cross-Role Test Scenarios:
1. **TC-ORDER-01**: Marketer creates order → Agent sees in dashboard → Converts to sale
2. **TC-ORDER-02**: Agent converts order → Marketer sees status change
3. **TC-ORDER-03**: Operator tries to access orders → Gets 403/block

---

### 5. **Attendance Page** (`/attendance`)
**Accessible Roles:** super_admin, manager, operator

#### Actions by Role:

**Operator:**
- ✅ Mark self attendance (check-in/check-out)
- ✅ View own attendance history
- ✅ View attendance reports (self)
- ❌ Cannot mark others' attendance

**Manager:**
- ✅ View all staff attendance
- ✅ Mark attendance for staff
- ✅ Generate attendance reports
- ✅ Export attendance data
- ✅ Approve/reject attendance corrections

**super_admin:**
- ✅ All manager capabilities
- ✅ Cross-warehouse attendance
- ✅ Attendance analytics

#### Data Flow:
```
Attendance Marked
    ↓
├── Creates/Updates: attendance_records
├── Updates: worker_attendance_summary
└── Creates: activity_log
    ↓
Realtime → Attendance dashboard updates
```

#### Cross-Role Test Scenarios:
1. **TC-ATT-01**: Operator marks attendance → Manager sees real-time update
2. **TC-ATT-02**: Manager marks attendance for staff → Staff sees in history
3. **TC-ATT-03**: Multiple check-ins → System prevents duplicates

---

### 6. **HR Staff Page** (`/hr/staff`)
**Accessible Roles:** super_admin, manager, operator

#### Actions by Role:

**Operator:**
- ✅ View staff directory (read-only)
- ✅ View worker details
- ❌ Cannot modify staff
- ❌ Cannot change roles

**Manager:**
- ✅ View all staff
- ✅ Create staff entries
- ✅ Update staff details
- ✅ Assign to warehouses
- ❌ Cannot modify super_admin

**super_admin:**
- ✅ Full CRUD on all staff
- ✅ Role assignments
- ✅ Staff invitations
- ✅ Permission management

#### Cross-Role Test Scenarios:
1. **TC-HR-01**: Manager creates staff → Operator sees in directory
2. **TC-HR-02**: Operator tries to modify staff → Permission denied
3. **TC-HR-03**: super_admin changes role → All pages update for that user

---

### 7. **Staff Directory** (`/staff`)
**Accessible Roles:** super_admin, manager

#### Actions:
- View all staff
- Create/edit staff profiles
- Assign roles
- Warehouse assignments

---

### 8. **Transactions Page** (`/transactions`)
**Accessible Roles:** super_admin, manager, agent
**Blocked for:** operator

#### Actions:
- View all transactions
- Filter by type (sale, payment, refund)
- Export transaction data
- Transaction reconciliation

#### Data Flow:
```
Payment Recorded
    ↓
├── Creates: transactions
├── Updates: customer_balance
├── Updates: store_balance
└── Creates: activity_log
```

---

### 9. **Reports Page** (`/reports`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Sales reports
- Inventory reports
- Customer reports
- Attendance reports
- Export to Excel/PDF

---

### 10. **Analytics Page** (`/analytics`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Dashboard metrics
- Trend analysis
- Comparative analytics
- Real-time statistics

---

### 11. **Access Control** (`/access-control`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Manage role permissions
- Assign custom permissions
- View permission audit log

---

### 12. **Products Page** (`/products`)
**Accessible Roles:** super_admin, manager
**Blocked for:** operator, agent, marketer

#### Actions:
- CRUD on products
- Manage BOMs
- Pricing
- Inventory linking

---

### 13. **Vendors Page** (`/vendors`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Vendor management
- Purchase orders
- Vendor payments

---

### 14. **Stores Page** (`/stores`)
**Accessible Roles:** super_admin, manager, agent

#### Actions:
- View stores
- Create/edit stores
- Assign to routes
- View store analytics

---

### 15. **Routes Page** (`/routes`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Route creation
- Store assignment
- Agent assignment
- Route optimization

---

### 16. **Handovers Page** (`/handovers`)
**Accessible Roles:** super_admin, manager, agent

#### Actions:
- Cash handover
- UPI reconciliation
- Daily closing

#### Data Flow:
```
Handover Created
    ↓
├── Creates: handover_records
├── Updates: staff_cash_accounts
├── Creates: income_entries
└── Notifications to managers
```

---

### 17. **Invoices Page** (`/invoices`)
**Accessible Roles:** super_admin, manager

#### Actions:
- Generate invoices
- View invoice history
- Download PDFs

---

### 18. **Settings Page** (`/settings`)
**Accessible Roles:** super_admin, manager

#### Actions:
- System configuration
- Notification settings
- Integration settings

---

### 19. **Customer Portal** (`/portal/*`)
**Accessible Roles:** customer

#### Actions:
- View own orders
- View own transactions
- View own profile
- Place orders (if enabled)

---

## 🔁 Complete Business Workflows

### Workflow 1: **Sale to Collection** (Multi-Role)
```
1. Agent creates SALE with credit (Agent)
   ↓
2. Customer balance increases (System)
   ↓
3. Manager sees outstanding report (Manager)
   ↓
4. Agent collects payment (Agent)
   ↓
5. Transaction recorded (System)
   ↓
6. Customer balance decreases (System)
   ↓
7. Agent creates handover (Agent)
   ↓
8. Manager approves handover (Manager)
   ↓
9. Income entry created (System)
```

**Test Scenarios:**
- TC-WF1-01: Complete flow with full payment
- TC-WF1-02: Complete flow with partial payments
- TC-WF1-03: Multiple agents, simultaneous sales

---

### Workflow 2: **Order to Delivery** (Multi-Role)
```
1. Marketer creates ORDER (Marketer)
   ↓
2. Order appears in Agent dashboard (Agent)
   ↓
3. Agent converts order to SALE (Agent)
   ↓
4. Delivery scheduled (Agent)
   ↓
5. Delivery completed (Agent)
   ↓
6. Customer receives notification (Customer)
   ↓
7. Customer views in portal (Customer)
```

---

### Workflow 3: **Stock Transfer** (Multi-Role)
```
1. Manager initiates stock transfer (Manager)
   ↓
2. Source warehouse inventory decreases (System)
   ↓
3. Transfer in transit (System)
   ↓
4. Destination warehouse receives (Manager/Agent)
   ↓
5. Destination inventory increases (System)
   ↓
6. Operator sees updated stock (Operator)
```

---

### Workflow 4: **Production to Sale** (Multi-Role)
```
1. Manager creates production batch (Manager)
   ↓
2. Raw materials consumed (System)
   ↓
3. Finished goods inventory increases (System)
   ↓
4. Operator sees new stock (Operator)
   ↓
5. Operator sells product (Operator)
   ↓
6. Inventory decreases (System)
```

---

### Workflow 5: **Staff Onboarding** (Multi-Role)
```
1. super_admin invites staff (super_admin)
   ↓
2. Staff receives invitation (Edge Function)
   ↓
3. Staff logs in with phone (Staff)
   ↓
4. Account auto-linked to invitation (System)
   ↓
5. Role assigned automatically (System)
   ↓
6. Staff appears in directory (Manager/Operator)
```

---

## ⚡ Real-Time Sync Test Cases

### RTC-01: Simultaneous Data Modification
**Scenario:** Two managers try to update same customer
**Expected:** Last write wins or conflict error
**Test:**
1. Manager A opens customer edit
2. Manager B opens same customer edit
3. Manager A saves
4. Manager B saves
5. Verify data consistency

### RTC-02: Sale During Stock Transfer
**Scenario:** Sale created while stock transfer in progress
**Expected:** Proper inventory locking or error
**Test:**
1. Manager initiates stock transfer
2. Operator tries to sell transferred product
3. Verify proper handling

### RTC-03: Dashboard Updates
**Scenario:** Multiple users on dashboard
**Expected:** All see real-time updates
**Test:**
1. Manager A on dashboard
2. Manager B on dashboard
3. Agent creates sale
4. Verify both dashboards update

---

## 🚫 Permission Boundary Tests

### PB-01: Operator Store Isolation
**Test:** Operator tries to access non-POS store inventory
**Expected:** 403 error or empty results

### PB-02: Agent Route Isolation
**Test:** Agent tries to view customer not on route
**Expected:** 403 error or filtered results

### PB-03: Manager Warehouse Isolation
**Test:** Manager tries to access other warehouse data
**Expected:** Permission denied

### PB-04: Customer Data Access
**Test:** Customer tries to access other customer's data
**Expected:** 403 error

---

## 📊 Data Integrity Tests

### DI-01: Outstanding Balance Consistency
**Test:** Sum of all customer outstanding = Total outstanding report
**Verify:** After sales, payments, refunds

### DI-02: Inventory Balance
**Test:** Stock in - Stock out = Current stock
**Verify:** After sales, transfers, production

### DI-03: Cash Reconciliation
**Test:** Opening + Collections - Expenses = Closing
**Verify:** At day end

### DI-04: Transaction Consistency
**Test:** All transactions have matching sale/payment
**Verify:** Referential integrity

---

## 🔄 Regression Test Suite

### Critical Paths:
1. ✅ Login → Dashboard → Sales → Create Sale
2. ✅ Login → Inventory → View Stock
3. ✅ Login → Customers → View → Create
4. ✅ Login → Attendance → Mark
5. ✅ Login → Orders → Create → Convert to Sale
6. ✅ Login → Reports → Generate

### Cross-Role Integration:
1. ✅ Agent sale → Manager outstanding update
2. ✅ Marketer order → Agent conversion
3. ✅ Manager transfer → Operator view
4. ✅ Operator sale → Inventory update

---

## 📝 Test Execution Checklist

### Pre-Test Setup:
- [ ] All edge functions deployed
- [ ] Database migrations applied
- [ ] Test accounts configured with OTP 000000
- [ ] Browser contexts isolated per role
- [ ] Realtime subscriptions active

### Per-Page Testing:
- [ ] Page loads without errors
- [ ] All visible elements interactive
- [ ] Actions execute correctly
- [ ] Data persists correctly
- [ ] Real-time updates propagate
- [ ] Permission boundaries enforced
- [ ] Error handling graceful

### Post-Test Verification:
- [ ] Database state consistent
- [ ] No orphaned records
- [ ] Activity logs created
- [ ] Notifications sent
- [ ] Analytics updated

---

## 🎯 Priority Test Matrix

| Priority | Test Type | Coverage |
|----------|-----------|----------|
| **P0** | Critical workflows | Sale, Payment, Inventory, Login |
| **P1** | Cross-role sync | Data flow between 2+ roles |
| **P2** | Permission boundaries | Access control, isolation |
| **P3** | Edge cases | Race conditions, errors |
| **P4** | UI/UX | Layouts, responsiveness |

---

**Document Version:** 1.0
**Last Updated:** 2026-04-26
**Test Framework:** Playwright + Custom Multi-Agent System
