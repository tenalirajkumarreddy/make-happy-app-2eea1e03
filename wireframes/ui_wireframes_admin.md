# Admin Panel (APK) - UI/UX Wireframes

## Overview

**Target Users:** Super Admin, Manager
**Platform:** Mobile Admin APK (Android)
**Design Principles:**
- Dashboard-first with at-a-glance KPIs
- Quick action navigation to all admin functions
- Full CRUD for sales, orders, inventory, purchases
- Pull-to-refresh on all list screens
- Card-based lists with action buttons

---

## Navigation Structure

### Gradient Header Bar (Page-Specific, Per-Screen)
Each page has a gradient header (`bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700`) with:
- **Left:** Page title + subtitle
- **Right (optional):** Single action button (Record/Create/New/Adjust)

### Bottom Navigation Bar (MobileApp Layout)
```
┌─────────────────────────────────────────────────────┐
│  [🏠]  [📋]  [🛒]  [👤]                            │
│  Home  Orders  Sales  Profile                       │
└─────────────────────────────────────────────────────┘
```

---

## 1. Admin Dashboard (Home)

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Hello, Rajesh              [🔄]              ▓  │
│  ▓  Manager | May 26, 2026                       ▓  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 Today's Revenue                          │   │
│  │  ₹45,230                                    │   │
│  │  ─────────────────────────────────────────   │   │
│  │  Cash: ₹32,400  │  UPI: ₹12,830             │   │
│  │                               🏷️ 18 sales    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 💳 Out-  │ │ 📦 Pending│ │ ⚠️ Low   │           │
│  │ standing │ │ Orders   │ │ Stock    │           │
│  │          │ │          │ │          │           │
│  │ ₹12,500  │ │    3     │ │    7     │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ⚡ Quick Actions                            │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │   │
│  │  │💰    │ │📋    │ │💳    │ │📊    │       │   │
│  │  │Sales │ │Orders│ │Paymts│ │Rprts │       │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘       │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │   │
│  │  │📦    │ │🏪    │ │👥    │ │🔧    │       │   │
│  │  │Invent│ │Stores│ │Custmr│ │Tools │       │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🕐 Recent Sales                             │   │
│  │  ─────────────────────────────────────────   │   │
│  │  Store A - #SALE-0012          ₹4,200 │   │
│  │  10 min ago                               │   │
│  │  Store B - #SALE-0011          ₹2,800 │   │
│  │  25 min ago                               │   │
│  │  Store C - #SALE-0010          ₹6,500 │   │
│  │  1h ago                                   │   │
│  │  ...                                      │   │
│  │  [View All →]                              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ⏳ Pending Expenses                         │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🟢 Food - Rajesh              ₹2,500 │   │
│  │  2 days ago                    📎 1   │   │
│  │  [Approve] [Reject]                        │   │
│  │                                             │   │
│  │  🔵 Fuel - Amit               ₹3,200 │   │
│  │  3 days ago                    📎 0   │   │
│  │  [Approve] [Reject]                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🛠️ Tools                                    │   │
│  │  ┌──────────────────┐ ┌──────────────────┐   │   │
│  │  │ 📈 Analytics      │ │ ⚙️ Settings      │   │
│  │  └──────────────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Revenue card: Today's total + Cash/UPI split + sale count
- Mini stat grid: Outstanding amount, pending orders, low stock count (alert when >0)
- Quick actions: 8-button grid (Sales, Orders, Payments, Reports, Inventory, Stores, Customers, Products)
- Recent sales: Last 5 items, tap row to view details
- Pending expenses: Approve/Reject inline with confirm dialog
- Refresh: Manual button in header calls `invalidateQueries` on dashboard queries

---

## 2. Admin Sales

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Sales           [➕ Record]  ▓                 │
│  ▓  All recorded sales                             │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 Search sale ID or store...               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Payment: [All Payments ▼]                    │   │
│  ───────────────────────────────────────────────│   │
│  │ [All time] [Today] [Week] [Month] [Custom]  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (When Custom selected: show 2 date inputs)         │
│  ┌──────────┐ ┌──────────┐                          │
│  │ From:    │ │ To:      │                          │
│  │ [date  ] │ │ [date  ] │                          │
│  └──────────┘ └──────────┘                          │
│                                                     │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ Store: [All ▼]    │ │ Customer: [All ▼] │          │
│  └──────────────────┘ └──────────────────┘          │
│  ┌─────────────────────────────────────────────┐   │
│  │ Agent: [All Agents ▼]                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (When any filter active: [✕ Clear Filters])        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 #SALE-0012                              │   │
│  │  Store A, Sector 5                          │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Coke 500ml x 2, Bread x 1... +2 more  │   │
│  │                                             │   │
│  │  🏷️ ₹4,200     [Cash] [UPI]                │   │
│  │  👤 Rajesh            10 min ago            │   │
│  │                                             │   │
│  │  [🧾 Receipt]  [👁️ View]  [🔄 Return]       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 #SALE-0011                              │   │
│  │  Store B, Main Road                         │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Water 1L x 6, Chips x 3               │   │
│  │                                             │   │
│  │  🏷️ ₹2,800     [Cash]                      │   │
│  │  👤 Amit              25 min ago            │   │
│  │                                             │   │
│  │  [🧾 Receipt]  [👁️ View]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Load More (2 of 15 total)]                        │
└─────────────────────────────────────────────────────┘
```

**Card Action Behavior:**
| Button | Action |
|--------|--------|
| Receipt | Navigate to `/transactions?receipt={id}` |
| View | Opens detail modal (Dialog) |
| Return | Opens return modal (only when outstanding > 0) |

**Detail Modal:**
```
┌─────────────────────────────────────────────────────┐
│  Sale Details                                  [✕]  │
│  ────────────────────────────────────────────────   │
│  Sale ID:       #SALE-0012                           │
│  Store:         Store A, Sector 5                    │
│  Date:          26 May 2026, 10:30 AM                │
│                                                     │
│  ── Items ──                                         │
│  SKU       Item          Qty   Price    Total        │
│  ------------------------------------------------   │
│  COKE500  Coke 500ml      2   ₹40     ₹80           │
│  BRD-WHT  Bread White     1   ₹45     ₹45           │
│  CHP-SLT  Chips Salt      1   ₹20     ₹20           │
│  (2 more items...)                                    │
│                                                     │
│  ── Payment Summary ──                                │
│  Total:         ₹4,200                                │
│  Cash:          ₹3,000                                │
│  UPI:           ₹1,200                                │
│  Outstanding:   ₹0                                    │
│                                                     │
│  👤 Recorded by: Rajesh                              │
│                                                     │
│  [🧾 Receipt]  [👁️ View Full]  [🔄 Process Return]  │
└─────────────────────────────────────────────────────┘
```

**Applied Patterns:**
- Pull-to-refresh (resets to page 1)
- Page-based pagination, 20 per page, "Load More (X of Y total)"
- Search bar with debounce
- Date chip selector + custom range
- Payment filter, store, customer, agent filters

---

## 3. Admin Orders

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Orders           [➕ Create] ▓                   │
│  ▓  Manage all orders                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 Search order ID or store...              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────┐ ┌──────────┐                          │
│  │ From:    │ │ To:      │                          │
│  │ [date  ] │ │ [date  ] │                          │
│  └──────────┘ └──────────┘                          │
│                                                     │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ Status: [All ▼]   │ │ Customer: [All ▼]│          │
│  └──────────────────┘ └──────────────────┘          │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ Store: [All ▼]    │ │ Assigned: [All ▼]│          │
│  └──────────────────┘ └──────────────────┘          │
│                                                     │
│  (When any filter active: [✕ Clear Filters])        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🟢 Delivered]                              │   │
│  │  #ORD-0045                                  │   │
│  │  Store C, Industrial Area                    │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Flour 5kg x 2, Oil 1L x 3             │   │
│  │                                             │   │
│  │  📦 5 items          🕐 2h ago           │   │
│  │  💰 ₹3,450                                  │   │
│  │                                             │   │
│  │  [👁️ View]  [🧾 Proforma]  [✏️ Details]     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🟡 Pending]                                │   │
│  │  #ORD-0046                                  │   │
│  │  Store A, Sector 5                           │   │
│  │  ─────────────────────────────────────────   │   │
│  │  📝 "Need 10 packets of sugar urgently"     │   │
│  │                                             │   │
│  │  📦 1 item           🕐 30 min ago        │   │
│  │  💰 ₹450                                    │   │
│  │                                             │   │
│  │  [👁️ View]  [✅ Deliver]  [✕ Cancel]        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Load More (4 of 28 total)]                        │
└─────────────────────────────────────────────────────┘
```

**Status Color Codes:**
| Status | Color | Badge |
|--------|-------|-------|
| Pending | 🟡 Amber | Dot |
| Confirmed | 🔵 Blue | Dot |
| Delivered | 🟢 Green | Dot |
| Cancelled | 🔴 Red | Dot |

**Card Action Behavior (permission-gated):**
| Button | Visible When | Action |
|--------|-------------|--------|
| View | Always | Opens detail modal |
| Proforma | Pending/Confirmed | Opens `ProformaView` dialog |
| Deliver | Pending + `fulfill_orders` permission | Opens fulfill payment dialog |
| Cancel | Pending/Confirmed + `cancel_orders` permission | Opens cancel confirm dialog |
| Details | Delivered/Cancelled | Opens detail modal with edit |

**Fulfill Payment Dialog:**
```
┌─────────────────────────────────────────────────────┐
│  Record Payment & Deliver                     [✕]  │
│  ────────────────────────────────────────────────   │
│  Order: #ORD-0046                                   │
│  Customer: Store A, Sector 5                        │
│  Total: ₹450                                        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 💵 Cash Amount                                │   │
│  │ [ ₹________ ]                                │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 📱 UPI Amount                                │   │
│  │ [ ₹________ ]                                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Items Summary:                                     │
│  Sugar 1kg x 10 = ₹450                              │
│  ────────────────────────────────────────────────   │
│  Total Collected:                   ₹450            │
│                                                     │
│  [Record Sale & Deliver]                            │
└─────────────────────────────────────────────────────┘
```

**Additional Dialogs:**
- **Transfer Order:** Staff select list, triggers `record_sale` RPC transfer
- **Cancel Confirmation:** Optional text input for cancellation reason
- **Proforma View:** Read-only invoice preview

**Applied Patterns:**
- Pull-to-refresh
- Page-based pagination (20/page)
- Search bar, date range, status/customer/store/assigned filters
- Dialog chain: View → Fulfill → Confirm

---

## 4. Admin Transactions

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Transactions         [➕ Record] ▓              │
│  ▓  Payment records                                 │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 Search payment ID or store...            │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Payment: [All Payments ▼]                    │   │
│  ───────────────────────────────────────────────│   │
│  │ [All time] [Today] [Week] [Month] [Custom]  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (When Custom: show date from/to)                   │
│                                                     │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ Store: [All ▼]    │ │ Customer: [All ▼] │          │
│  └──────────────────┘ └──────────────────┘          │
│  ┌─────────────────────────────────────────────┐   │
│  │ Agent: [All Agents ▼]                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  #PAY-0089                                  │   │
│  │  Store A, Sector 5                          │   │
│  │  ─────────────────────────────────────────   │   │
│  │  💰 ₹3,000          [Cash]                  │   │
│  │                                             │   │
│  │  💳 Balance: ₹12,500 → ₹9,500  [🟢 -₹3K]   │   │
│  │                                             │   │
│  │  👤 Rajesh                 45 min ago       │   │
│  │                                             │   │
│  │  [👁️ View]  [🧾 Receipt]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  #PAY-0088                                  │   │
│  │  Store B, Main Road                         │   │
│  │  ─────────────────────────────────────────   │   │
│  │  💰 ₹2,000          [UPI]                   │   │
│  │                                             │   │
│  │  💳 Balance: ₹8,500 → ₹6,500  [🟢 -₹2K]   │   │
│  │                                             │   │
│  │  👤 Amit                   1h ago           │   │
│  │                                             │   │
│  │  [👁️ View]  [🧾 Receipt]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Load More (3 of 42 total)]                        │
└─────────────────────────────────────────────────────┘
```

**Card Action Behavior:**
| Button | Action |
|--------|--------|
| View | Opens detail modal |
| Receipt | Navigate to `/transactions?receipt={id}` |

**Detail Modal:**
```
┌─────────────────────────────────────────────────────┐
│  Payment Details                              [✕]  │
│  ────────────────────────────────────────────────   │
│  Payment ID:    #PAY-0089                            │
│  Store:         Store A, Sector 5                    │
│  Date:          26 May 2026, 10:30 AM                │
│                                                     │
│  ── Amounts ──                                       │
│  Amount Paid:               ₹3,000                   │
│  Cash:                       ₹3,000                  │
│  UPI:                        ₹0                      │
│                                                     │
│  ── Outstanding Balance ──                            │
│  Previous:                   ₹12,500                 │
│  Paid:                       -₹3,000                 │
│  New Balance:                ₹9,500                  │
│                                                     │
│  👤 Recorded by: Rajesh                              │
│                                                     │
│  [👁️ View Full]  [🧾 Receipt]                        │
└─────────────────────────────────────────────────────┘
```

**Applied Patterns:**
- Pull-to-refresh (resets to page 1)
- Page-based pagination (20/page)
- Same filter pattern as Sales (payment, date, store, customer, agent)
- Balance change indicator with color-coded badge

---

## 5. Admin Inventory

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Inventory           [➕ Adjust] ▓                │
│  ▓  Stock management                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 📦      │ │ ⚠️ Low  │ │ ❌ Out  │           │
│  │ 245     │ │   12     │ │    3     │           │
│  │ Total   │ │ Stock    │ │ of Stock │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 💰 Total Inventory Value: ₹12,45,000        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 Search product name or SKU...            │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Stock: [All Items ▼]                         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🥤 Coca-Cola 500ml                        │   │
│  │  SKU: COKE500   |   Beverages               │   │
│  │  ─────────────────────────────────────────   │   │
│  │  📦 Quantity:   [🟢 240 in stock]           │   │
│  │  💰 Unit Price: ₹40                         │   │
│  │  📊 Stock Value: ₹9,600                     │   │
│  │  📉 Reorder Level: 50                       │   │
│  │  Status: ✅ Sufficient                       │   │
│  │                                             │   │
│  │  [👁️ View]  [🛒 Purchase]  [↕️ Adjust]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🍞 Harvest Bread 400g                     │   │
│  │  SKU: BRD400   |   Bakery                   │   │
│  │  ─────────────────────────────────────────   │   │
│  │  📦 Quantity:   [🟠 30 in stock]            │   │
│  │  💰 Unit Price: ₹35                         │   │
│  │  📊 Stock Value: ₹1,050                     │   │
│  │  📉 Reorder Level: 40                       │   │
│  │  Status: ⚠️ Reorder Soon                     │   │
│  │                                             │   │
│  │  [👁️ View]  [🛒 Purchase]  [↕️ Adjust]      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Card Action Behavior:**
| Button | Action |
|--------|--------|
| View | Opens stock detail modal |
| Purchase | Navigate to `/purchases?product={id}` |
| Adjust | Navigate to `/inventory?adjust={productId}` |

**Quantity Color Coding:**
| Condition | Color |
|-----------|-------|
| Quantity > reorder level | 🟢 Green |
| Quantity ≤ reorder level | 🟠 Amber |
| Quantity = 0 | 🔴 Red |

**Applied Patterns:**
- Pull-to-refresh
- Static `.limit(200)` (no page-based pagination)
- Tappable stat boxes toggle stock filter
- Search bar, stock level filter

---

## 6. Admin Purchases

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Purchases          [➕ New] ▓                    │
│  ▓  Purchase orders                                  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 Search PO or vendor...                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Status: [All Purchases ▼]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🟡 Pending]                                │   │
│  │  #PO-0032                                   │   │
│  │  Vendor: Fresh Supplies Co.                  │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Coke 500ml x 50, Bread White x 20     │   │
│  │  📦 5 items           🕐 2h ago           │   │
│  │  💰 ₹4,500                                  │   │
│  │                                             │   │
│  │  [👁️ View]  [✅ Confirm]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🔵 Confirmed]                              │   │
│  │  #PO-0031                                   │   │
│  │  Vendor: Dairy Best Ltd.                     │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Milk 1L x 30, Butter 500g x 10        │   │
│  │  📦 3 items           🕐 1d ago           │   │
│  │  💰 ₹6,200                                  │   │
│  │                                             │   │
│  │  [👁️ View]  [🚚 Receive]                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [🟢 Received]                               │   │
│  │  #PO-0030                                   │   │
│  │  Vendor: Beverage World                      │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🛒 Juice Pack x 100                       │   │
│  │  📦 1 item            🕐 3d ago           │   │
│  │  💰 ₹8,000                                  │   │
│  │                                             │   │
│  │  [👁️ View]                                  │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Card Action Behavior:**
| Button | Visible When | Action |
|--------|-------------|--------|
| View | Always | Opens purchase detail modal |
| Confirm | Pending | Navigate to `/purchases?confirm={id}` |
| Receive | Confirmed | Navigate to `/purchases?receive={id}` |

**Status Color Codes:**
| Status | Color |
|--------|-------|
| Pending | 🟡 Amber |
| Confirmed | 🔵 Blue |
| Received | 🟢 Green |
| Cancelled | 🔴 Red |

**Applied Patterns:**
- Static `.limit(100)` (no page-based pagination)
- No pull-to-refresh
- Status filter dropdown only

---

## 7. Admin Handovers

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Handovers            [📋 Claims(3)] [🔄  ] [⚡]│
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ ⏳      │ │ ✅      │ │ 📊      │           │
│  │    8    │ │   15    │ │   23    │           │
│  │ Pending │ │ Confirmed│ │ Total   │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌──────────────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Staff: [All ▼]    │ │ From:   │ │ To:     │    │
│  └──────────────────┘ │ [date ] │ │ [date ] │    │
│                        └──────────┘ └──────────┘    │
│                                                     │
│  ┌──────────┬──────────┬──────────┬──────────┬────┐ │
│  │  📋 All  │ ⏳ Pending│ 🔄 Await.│ ✅ Conf. │ ❌ │ │
│  │         │          │          │          │ Rej│ │
│  └──────────┴──────────┴──────────┴──────────┴────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  👤 Rajesh Kumar → Amit Sharma              │   │
│  │  Cash Handover                               │   │
│  │  ─────────────────────────────────────────   │   │
│  │  💰 ₹15,000                                  │   │
│  │  💵 Cash: ₹12,000  📱 UPI: ₹3,000            │   │
│  │  Target: ₹18,000    🕐 2h ago               │   │
│  │  [🟢 Confirmed]                              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  👤 Amit Sharma → Priya Patel               │   │
│  │  Stock Handover                              │   │
│  │  ─────────────────────────────────────────   │   │
│  │  💰 ₹8,500                                   │   │
│  │  💵 Cash: ₹5,000   📱 UPI: ₹3,500            │   │
│  │  Target: ₹10,000   🕐 5h ago               │   │
│  │  [🟡 Pending]        [✅] [❌]              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Tabs at bottom:                                    │
│  ┌──────────┬──────────┬──────────┐                │
│  │ 📋      │ 💰      │ 📊      │                │
│  │ Handovers│ Expenses│ Income  │                │
│  └──────────┴──────────┴──────────┘                │
└─────────────────────────────────────────────────────┘
```

**Expenses Tab:**
```
┌─────────────────────────────────────────────────────┐
│  [➕ Submit Expense Claim]     [📥 CSV Export]      │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 ₹2,500               [🟡 Pending]        │   │
│  │  🍔 Food & Beverages                         │   │
│  │  Rajesh Kumar             2 days ago         │   │
│  │  "Client meeting lunch"                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 ₹3,200               [🟢 Approved]       │   │
│  │  ⛽ Fuel & Transport                         │   │
│  │  Amit Sharma              3 days ago         │   │
│  │  "Delivery trip fuel"                        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Income Tab (Admin View):**
```
┌─────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────┐   │
│  │  👤 Rajesh Kumar          💵 ₹45,000        │   │
│  │  Cash: ₹32,000  UPI: ₹13,000               │   │
│  │  Last reset: 26 May, 09:00 AM               │   │
│  │                              [🔄 Reset]     │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  👤 Amit Sharma            💵 ₹28,000        │   │
│  │  Cash: ₹20,000  UPI: ₹8,000                │   │
│  │  Last reset: 25 May, 06:00 PM               │   │
│  │                              [🔄 Reset]     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [🔄 Reset All Finalizers]                          │
└─────────────────────────────────────────────────────┘
```

**Applied Patterns:**
- Custom header (not `AdminPageHeader`) with claims badge, transfer, adjust buttons
- 3-tab layout (Handovers / Expenses / Income)
- Pull-to-refresh
- Staff balance snapshot (permission-gated)
- CSV export buttons
- Multiple dialog types: Handover Detail, Expense Review/Submit, Transfer, Adjust Holding, Reset All
- Extensive permission gating (`finalizer`, `submit_expenses`, `approve_expenses`, etc.)

---

## 8. POS Home (Shared Admin Access)

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Hello, Priya                       May 26      │
│  ▓  Warehouse: Main Warehouse                       │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🏪 Store A (STORE-001)                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  💰 Today's POS Sales                       │   │
│  │  ₹12,450                                    │   │
│  │  ─────────────────────────────────────────   │   │
│  │  Cash: ₹8,200  │  UPI: ₹4,250               │   │
│  │  🏷️ 6 sales                                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────┐ ┌──────────────────────┐ │
│  │  💰 Record Sale       │ │ 📋 View History      │ │
│  │  (Violet gradient)    │ │ (Emerald border)     │ │
│  └──────────────────────┘ └──────────────────────┘ │
│  ┌──────────────────────┐ ┌──────────────────────┐ │
│  │  🏭 Production        │ │ 📦 Inventory         │ │
│  │  (Gray border)        │ │ (Amber border)       │ │
│  └──────────────────────┘ └──────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ⏳ Pending Orders                           │   │
│  │  ─────────────────────────────────────────   │   │
│  │  🏪 Store C - ₹3,450    [🟡 Pending]        │   │
│  │  🏪 Store A - ₹1,200    [🟡 Pending]        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  📦 Stock Movements                          │   │
│  │  ─────────────────────────────────────────   │   │
│  │  ➕ In: Coke 500ml x 50    "Restock"  │   │
│  │  ➖ Out: Bread x 20         "Expired" │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  📋 Today's Orders                           │   │
│  │  ─────────────────────────────────────────   │   │
│  │  #ORD-0046  Store A   ₹450    [🟡 Pending]  │   │
│  │  #ORD-0045  Store C   ₹3,450  [🟢 Delivered] │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Purple gradient header (different from admin's blue)
- POS store assignment (from `useOperatorWarehouse`)
- Today's sales card with Cash/UPI split
- 2x2 quick action grid: Record Sale, View History, Production, Inventory
- Pending orders, stock movements, today's orders sections
- Auto-refetches every 60s (no manual refresh)

---

## Shared Component: AdminPageHeader

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓  Page Title               [➕ Action Label]  ▓  │
│  ▓  Subtitle text                                 ▓  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
└─────────────────────────────────────────────────────┘
```

**Props:** `title`, `subtitle`, `action` (label + icon + onClick)

---

## UI Pattern Summary

### Card List Pattern
```
┌─────────────────────────────────────────────┐
│  Display ID / Identifier                     │
│  Secondary info (store/vendor/customer)      │
│  ─────────────────────────────────────────   │
│  Item previews (up to 2, "+N more")          │
│  or requirement note for simple orders       │
│                                               │
│  💰 Amount     [Status Badge]                │
│  Recorder info           Timestamp           │
│                                               │
│  [Action 1]  [Action 2]  [Action 3]          │
└─────────────────────────────────────────────┘
```

### Filter Pattern
```
┌─────────────────────────────────────────────┐
│ 🔍 Search field                              │
│ ─────────────────────────────────────────   │
│ Select filter (first dimension)              │
│ Date chips: [All] [Today] [Week] [Month] [C.]│
│ ─────────────────────────────────────────   │
│ Select x2 (second dimension grid)            │
│ Select full-width (third dimension)          │
│ [✕ Clear Filters]                            │
└─────────────────────────────────────────────┘
```

### Detail Modal Pattern
```
┌─────────────────────────────────────────────┐
│  Entity Title                          [✕]  │
│  ────────────────────────────────────────   │
│  Key-value info section                     │
│                                               │
│  Table/list section                          │
│                                               │
│  Summary section                             │
│                                               │
│  Secondary info (recorder, etc.)            │
│                                               │
│  [Action 1]  [Action 2]  [Action 3]          │
└─────────────────────────────────────────────┘
```

### Refresh Patterns

| Page | Mechanism |
|------|-----------|
| AdminHome | Manual refresh button (invalidation) |
| AdminSales | Pull-to-refresh + pagination reset |
| AdminOrders | Pull-to-refresh + pagination reset |
| AdminTransactions | Pull-to-refresh + pagination reset |
| AdminInventory | Pull-to-refresh |
| AdminPurchases | None |
| AdminHandovers | Pull-to-refresh |
| PosHome | Auto 60s interval |

### Pagination Patterns

| Page | Type | Size |
|------|------|------|
| AdminSales | Page-based | 20 |
| AdminOrders | Page-based | 20 |
| AdminTransactions | Page-based | 20 |
| AdminInventory | Static limit | 200 |
| AdminPurchases | Static limit | 100 |
| AdminHandovers | Static limit | 200 |

### Navigation Flows

```
Dashboard ──┬──> Sales ──> Record Sale
             │            └──> Sale Detail / Receipt / Return
             │
             ├──> Orders ──> Create Order
             │              └──> Order Detail / Fulfill / Cancel / Transfer
             │
             ├──> Transactions ──> Record Payment
             │                    └──> Txn Detail / Receipt
             │
             ├──> Inventory ──> Adjust Stock
             │                 └──> Stock Detail / Purchase
             │
             ├──> Purchases ──> New PO
             │                 └──> PO Detail / Confirm / Receive
             │
             ├──> Handovers ──> Claims / Transfer / Adjust
             │                 ├──> Handover Detail
             │                 ├──> Expense Review / Submit
             │                 └──> Income / Finalizer Mgmt
             │
             └──> POS ──> Record Sale / History / Production / Inventory
