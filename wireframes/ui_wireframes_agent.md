# Agent Interface - UI/UX Wireframes

## Overview

**Target Users:** Field Agents (Van Sales)
**Platform:** Mobile-responsive web application
**Design Principles:** 
- Field-first design for on-the-go usage
- Quick access to record sales/payments
- Location-aware features
- Offline-capable with sync
- Minimal taps to complete tasks

---

## Navigation Structure

### Top Header Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Rajesh Kumar ▼] │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Company Logo + Name** (left)
- **Notification Bell** (right) - Badge shows unread count
- **Agent Profile** (right) - Name + Avatar dropdown

### Bottom Navigation Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Home Page (Dashboard)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Hello, Rajesh Kumar                                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 📦 Stores    │  │ 💰 Sales     │  │ 💵 Cash      │            │
│  │   Covered    │  │   Today      │  │  Collected   │            │
│  │              │  │              │  │              │            │
│  │    [12]      │  │   ₹25,000    │  │   ₹18,000    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 📱 UPI       │  │ ⏳ Pending   │  │ 💵 Cash      │            │
│  │  Collected   │  │  Handover    │  │  Handover    │            │
│  │              │  │              │  │              │            │
│  │   ₹7,000     │  │   ₹12,500    │  │   🟠 Pending │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────┐                                                  │
│  │ 📱 UPI       │                                                  │
│  │  Handover    │                                                  │
│  │              │                                                  │
│  │   🟢 Collected│                                                 │
│  └──────────────┘                                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🚚 Route Session Status                                    │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Active: Route A (RTE-001)                                  │   │
│  │  Started: 09:00 AM | Duration: 2h 30m                       │   │
│  │  Stores Visited: 5/12                                       │   │
│  │                                                             │   │
│  │  [End Route Session]                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Orders Section                                             │   │
│  │  Filter: [Store Type ▼] [Route ▼] [Show Only ▼]            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Next Order (Nearest)                                       │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Tea Stall - MG Road                          Retail        │   │
│  │  Rajesh Kumar (CUST-00456)                    Route A       │   │
│  │  123 MG Road, Bangalore - 560001                            │   │
│  │                                                             │   │
│  │  [📍 Navigate]                                 [📞 Call]    │   │
│  │                                      [More Details →]       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [View All Orders →]                                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Map - Navigation to Next Order                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │         📍 (Agent Location - moves as agent moves)          │   │
│  │                                                             │   │
│  │                    🗺️ Map View                              │   │
│  │                                                             │   │
│  │         📌 (Store Location - Tea Stall)                     │   │
│  │                                                             │   │
│  │  Distance: 1.2 km | ETA: 5 mins                            │   │
│  │                                                             │   │
│  │  [🗺️ Open in Google Maps for Detailed Navigation]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Components Breakdown

**1. Top Header**
- Company Logo + Name
- **Offline Mode Indicator**: 
  - 📡 Online (Green) - Connected to internet
  - 📡 Offline (Orange) - Working offline, will sync later
  - 📡 Syncing (Blue) - Uploading pending data
- Notification Bell with count
- Agent Profile dropdown

**2. Summary Cards (Top)**
- Stores Covered Today
- Sales Today (total amount)
- Cash Collected
- UPI Collected
- Pending Handover (cumulative)
- Cash Handover Status (color-coded: 🔴 Pending, 🟠 Handed Over, 🟢 Collected)
- UPI Handover Status (color-coded: 🔴 Pending, 🟠 Handed Over, 🟢 Collected)

**3. Route Session Status**
- Shows active route session details
- Route name and ID
- Start time and duration
- Stores visited count (e.g., 5/12)
- "End Route Session" button
- If no active session: "Start Route Session" button

**4. Orders Section**
- Filters: Store Type, Route, Show Only
- Next Order card shows nearest order by location
- Navigate button opens Google Maps
- Call button dials customer
- More Details navigates to customer profile

**5. Map Section**
- Shows agent's current location (updates as they move)
- Shows nearest order store location
- Distance and ETA
- Button to open detailed navigation in Google Maps

---

## 2. All Orders Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  All Orders                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Search: [🔍 Store name, customer, phone, ID...]           │   │
│  │  Filters: [Store Type ▼] [Route ▼] [Status ▼]              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order #ORD-012345                          🟠 Active       │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Tea Stall - MG Road (STR-00123)            Retail          │   │
│  │  Rajesh Kumar (CUST-00456)                  Route A         │   │
│  │  123 MG Road, Bangalore - 560001                            │   │
│  │  Distance: 1.2 km                                           │   │
│  │                                                             │   │
│  │  Items:                                                     │   │
│  │  • 500ML Water - 10 units                                   │   │
│  │  • 1L Water - 5 units                                       │   │
│  │                                                             │   │
│  │  [📍 Navigate]  [📞 Call]  [📝 Record Sale]  [❌ Cancel]    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order #ORD-012344                          🟢 Delivered    │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Restaurant - Koramangala (STR-00124)       Restaurant      │   │
│  │  Priya Sharma (CUST-00457)                  Route B         │   │
│  │  456 Koramangala, Bangalore - 560034                        │   │
│  │                                                             │   │
│  │  Delivered on: 2026-01-19 02:30 PM                          │   │
│  │  Sale: SALE-012344 | Amount: ₹1,680                         │   │
│  │                                                             │   │
│  │  [View Sale Details]                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More Orders]                                                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Order Actions:**
- **Active Orders**: Navigate, Call, Record Sale, Cancel
- **Delivered Orders**: View Sale Details
- **Cancelled Orders**: View Cancellation Reason

---

## 3. Routes Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Routes                                                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Route A (RTE-001)                                          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Customers: 25                                        │   │
│  │  Total Outstanding: ₹45,000                                 │   │
│  │  Active Orders: 8                                           │   │
│  │                                                             │   │
│  │  [🗺️ View Map]                        [More Details →]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Route B (RTE-002)                                          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Customers: 18                                        │   │
│  │  Total Outstanding: ₹32,000                                 │   │
│  │  Active Orders: 5                                           │   │
│  │                                                             │   │
│  │  [🗺️ View Map]                        [More Details →]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Route C (RTE-003)                                          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Customers: 30                                        │   │
│  │  Total Outstanding: ₹58,000                                 │   │
│  │  Active Orders: 12                                          │   │
│  │                                                             │   │
│  │  [🗺️ View Map]                        [More Details →]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Route Details Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Route Details                                                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Route A (RTE-001)                                          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Customers: 25                                        │   │
│  │  Total Outstanding: ₹45,000                                 │   │
│  │  Active Orders: 8                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Customers in this Route                        [Filter ▼]         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Store Name                Outstanding              Nav     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Tea Stall - MG Road       ₹5,000              [📍]        │   │
│  │  Restaurant - Koramangala  ₹8,000              [📍]        │   │
│  │  Tiffin Center - Brigade   ₹3,200              [📍]        │   │
│  │  Coffee Shop - Indiranagar ₹2,500              [📍]        │   │
│  │  Bakery - Jayanagar        ₹6,800              [📍]        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Map of the Route                                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │         📍 (Agent Location)                                 │   │
│  │                                                             │   │
│  │    📌 Tea Stall    📌 Restaurant                            │   │
│  │                                                             │   │
│  │              🗺️ Interactive Map                             │   │
│  │                                                             │   │
│  │    📌 Tiffin       📌 Coffee Shop    📌 Bakery              │   │
│  │                                                             │   │
│  │  (Tap pin to see store name popup)                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Map Features:**
- Shows all stores in route with pin markers
- Agent's current location
- Tap pin to see store name in popup
- Interactive pan and zoom

---

## 5. Record + Page

### Record Sale Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Record Page                                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Record Sale]  |  Record Payment                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Select Store                                               │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [🔍 Select a store...                          ▼] [📍]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  (When dropdown clicked, shows:)                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [🔍 Search: Shop name, customer, phone, ID...]            │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [📍 Show 3 Nearest Stores]                                 │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ Tea Stall - MG Road                    🟦 RETAIL     │  │   │
│  │  │ Rajesh Kumar (CUST-00456)                           │  │   │
│  │  │ 123 MG Road, Bangalore                              │  │   │
│  │  │ Route A | 1.2 km away                 STR-00123     │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ Restaurant - Koramangala               🟧 RESTAURANT│  │   │
│  │  │ Priya Sharma (CUST-00457)                           │  │   │
│  │  │ 456 Koramangala, Bangalore                          │  │   │
│  │  │ Route B | 3.5 km away                 STR-00124     │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ Tiffin Center - Brigade               🟩 WHOLESALE  │  │   │
│  │  │ Amit Patel (CUST-00458)                             │  │   │
│  │  │ 789 Brigade Road, Bangalore                         │  │   │
│  │  │ Route A | 2.8 km away                 STR-00125     │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  [Load More Stores...]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  (After selecting a store:)                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Selected Store                                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [Tea Stall - MG Road                           ▼] [📍]     │   │
│  │  Customer: Rajesh Kumar (CUST-00456)                        │   │
│  │  Address: 123 MG Road, Bangalore                            │   │
│  │  Route A | Balance: ₹3,000                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Products (Associated with store)                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Product         Custom Price    Qty        Total           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water     ₹120           [10]        ₹1,200         │   │
│  │  1L Water        ₹200           [5]         ₹1,000         │   │
│  │  250ML Water     ₹60            [0]         ₹0             │   │
│  │                                                             │   │
│  │  [+ Add Other Product (Default Price)]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TOTAL                                          ₹2,200      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Cash Collected (Delivery Payment)      [₹1,500]           │   │
│  │  UPI Collected (Delivery Payment)       [₹500]             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  TOTAL PAID                                     ₹2,000      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Old Balance                                    ₹3,000      │   │
│  │  New Balance                                    ₹3,200      │   │
│  │  (₹3,000 + ₹2,200 - ₹2,000)                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Record Sale]                                                     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Add Other Product Flow:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Product (Not Associated with Store)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Select Product: [Search all products ▼]                           │
│                                                                     │
│  Selected: 2L Water Bottle                                          │
│  Default Price: ₹350/unit                                           │
│  Quantity: [2]                                                      │
│  Total: ₹700                                                        │
│                                                                     │
│  ⓘ This product will be added to this sale only,                   │
│    not permanently to the store.                                   │
│                                                                     │
│  [Cancel]                                      [Add to Sale]        │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Record Payment Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Record Page                                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Record Sale  |  [Record Payment]                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Select Store                                               │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [🔍 Select a store...                          ▼] [📍]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  (When dropdown clicked, shows same store list as Record Sale)     │
│                                                                     │
│  (After selecting a store:)                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Selected Store                                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [Tea Stall - MG Road                           ▼] [📍]     │   │
│  │  Customer: Rajesh Kumar (CUST-00456)                        │   │
│  │  Address: 123 MG Road, Bangalore                            │   │
│  │  Route A | Balance: ₹8,000                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Date Selection (Date customer paid)                        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  [📅 Select Date: 2026-01-20]                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Cash Collected (After Delivery Payment)  [₹2,000]         │   │
│  │  UPI Collected (After Delivery Payment)   [₹1,000]         │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  TOTAL PAID                                     ₹3,000      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Old Balance                                    ₹8,000      │   │
│  │  New Balance                                    ₹5,000      │   │
│  │  (₹8,000 - ₹3,000)                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Record Payment]                                                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Customers Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Customers                                          [Filter ▼]  [+] │
│                                                                     │
│  [🔍 Search: Store name, customer, phone, ID...]                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ R│  Tea Stall - MG Road                          Route A       │   │
│ E│  Rajesh Kumar                                 Retail         │   │
│ T│  +91 98765 43210                                            │   │
│ A│  123 MG Road, Bangalore - 560001              ₹5,000        │   │
│ I│                                                             │   │
│ L│  [📍 Directions]                              [📞 Call]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ R│  Restaurant - Koramangala                     Route B       │   │
│ E│  Priya Sharma                                 Restaurant    │   │
│ S│  +91 98765 43211                                            │   │
│ T│  456 Koramangala, Bangalore - 560034          ₹8,000        │   │
│ A│                                                             │   │
│ U│  [📍 Directions]                              [📞 Call]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ W│  Tiffin Center - Brigade                      Route A       │   │
│ H│  Rajesh Kumar                                 Wholesale     │   │
│ O│  +91 98765 43210                                            │   │
│ L│  789 Brigade Road, Bangalore - 560025         ₹3,200        │   │
│ E│                                                             │   │
│  │  [📍 Directions]                              [📞 Call]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Color Coding (Left Border):**
- **RETAIL** - Blue (#2563EB)
- **RESTAURANT** - Orange (#F59E0B)
- **WHOLESALE** - Green (#10B981)
- **OTHER** - Gray (#6B7280)

**Filter Options:**
- Route
- Store Type
- Outstanding Amount (High to Low, Low to High)

**Note:** Each store is shown as a separate card, even if same customer has multiple stores.

---

## 7. Customer Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [☰]  Company Name          [📡 Online]  [🔔 3]  [👤 Agent ▼]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back to Customers                                                │
│  Customer Profile                                      [✏️ Edit]    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Rajesh Kumar (CUST-00456)      ┌──────────────┐            │   │
│  │  +91 98765 43210                │   Customer   │            │   │
│  │  rajesh@example.com             │    Photo     │            │   │
│  │  Aadhar: XXXX-XXXX-1234         │              │            │   │
│  │  GST: 29ABCDE1234F1Z5           └──────────────┘            │   │
│  │  KYC: ✅ Completed                                          │   │
│  │  Credit Limit: ₹50,000                                      │   │
│  │  [📍 Navigate]  [📞 Call]  [📝 Record]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Navigation:**
- Swipe left/right to navigate between customer's stores
- Previous/Next buttons
- Store count indicator (e.g., "Store 1 of 3")

**Actions:**
- Request Edit (customer details)
- Request Price Change (custom pricing)
- Navigate, Call, Record (quick actions)

---

## 8. Add Customer/Store Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Create Customer or Store                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Customer Details                   ┌──────────────┐        │   │
│  │                                     │              │        │   │
│  │  ○ New Customer                     │   Customer   │        │   │
│  │  ○ Existing Customer                │    Photo     │        │   │
│  │                                     │   (Upload)   │        │   │
│  │  [Select Existing Customer ▼]      │              │        │   │
│  │                                     └──────────────┘        │   │
│  │  Customer Name: [____________]                              │   │
│  │  Phone Number:  [____________]                              │   │
│  │  Email:         [____________]                              │   │
│  │  Aadhar Number: [____________]                              │   │
│  │  GST Number:    [____________]                              │   │
│  │                                                             │   │
│  │  KYC Verification:                                          │   │
│  │  ☐ Upload Aadhar Photo (Front)                             │   │
│  │  ☐ Upload Aadhar Photo (Back)                              │   │
│  │  ☐ Upload Live Photo                                       │   │
│  │                                                             │   │
│  │  Credit Limit (KYC customers only): [₹______]               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Store Details                      ┌──────────────┐        │   │
│  │                                     │              │        │   │
│  │  Store Name:  [____________]        │    Store     │        │   │
│  │  Store Type:  [Retail ▼]           │    Photo     │        │   │
│  │  Address:     [____________]        │   (Upload)   │        │   │
│  │               [____________]        │              │        │   │
│  │                                     └──────────────┘        │   │
│  │  Coordinates:                                               │   │
│  │  [📍 Use Current Location]  [🗺️ Select on Map]             │   │
│  │  Lat: 12.9716, Lng: 77.5946                                 │   │
│  │                                                             │   │
│  │  Custom Prices (Products assigned to store type):           │   │
│  │  • 500ML Water - [₹120] (Default: ₹120)                    │   │
│  │  • 1L Water - [₹200] (Default: ₹200)                       │   │
│  │  • 250ML Water - [₹60] (Default: ₹60)                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Add Customer & Store]                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Workflow:**
1. Select "New Customer" or "Existing Customer"
2. If existing, dropdown shows all customers
3. Fill customer details (if new)
4. Upload photos for KYC (optional)
5. Fill store details
6. Set coordinates (current location or map selection)
7. Set custom prices (defaults pre-filled, editable)
8. Submit for admin approval

---

## 9. History Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  History                                                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  💰 Handover Summary                                        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Today's Handoverables:                                     │   │
│  │  Cash: ₹18,000 | UPI: ₹7,000                                │   │
│  │                                                             │   │
│  │  ⏳ Total Pending Handoverables:                            │   │
│  │  Cash: ₹32,000 | UPI: ₹15,500                               │   │
│  │  (Includes 3 days pending)                                  │   │
│  │                                                             │   │
│  │  ✅ Last Collection:                                        │   │
│  │  2026-01-17 by Manager Priya                                │   │
│  │  Cash: ₹22,500 | UPI: ₹8,800                                │   │
│  │                                                             │   │
│  │  [Mark as Handed Over]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Daily Logs                                      [Filter: Date ▼]  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Daily Log - 2026-01-20                                     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Customers Served: 12                                       │   │
│  │                                                             │   │
│  │  Total Quantity of Products:                                │   │
│  │  • 500ML Water - 120 units                                  │   │
│  │  • 1L Water - 60 units                                      │   │
│  │  • 250ML Water - 45 units                                   │   │
│  │                                                             │   │
│  │  Total CASH: ₹18,000                                        │   │
│  │  Total UPI: ₹7,000                                          │   │
│  │  Total Sale: ₹25,000                                        │   │
│  │                                                             │   │
│  │  [More Details →]                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Daily Log - 2026-01-19                                     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Customers Served: 15                                       │   │
│  │                                                             │   │
│  │  Total Quantity of Products:                                │   │
│  │  • 500ML Water - 150 units                                  │   │
│  │  • 1L Water - 75 units                                      │   │
│  │  • 250ML Water - 50 units                                   │   │
│  │                                                             │   │
│  │  Total CASH: ₹22,000                                        │   │
│  │  Total UPI: ₹8,500                                          │   │
│  │  Total Sale: ₹30,500                                        │   │
│  │                                                             │   │
│  │  [More Details →]                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Daily Log Details Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Daily Log - 2026-01-20                                             │
│                                                                     │
│  Session Details:                                                   │
│  Start Time: 09:00 AM                                               │
│  End Time: 06:00 PM                                                 │
│  Duration: 9 hours                                                  │
│                                                                     │
│  Summary:                                                           │
│  Customers Served: 12                                               │
│  Total Sale: ₹25,000                                                │
│  Total CASH: ₹18,000                                                │
│  Total UPI: ₹7,000                                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  All Records                                                │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Customer    Old Bal  Sale  Cash  UPI  New Bal  [▼]        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Tea Stall   ₹3,000  ₹2,200 ₹1,500 ₹500  ₹3,200  [▼]      │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ Items:                                               │  │   │
│  │  │ • 500ML Water - 10 units @ ₹120 = ₹1,200            │  │   │
│  │  │ • 1L Water - 5 units @ ₹200 = ₹1,000                │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  Restaurant  ₹8,000  ₹1,680 ₹1,000 ₹0    ₹8,680  [▼]      │   │
│  │  Tiffin Ctr  ₹3,200  -      ₹500   ₹0    ₹2,700  [▼]      │   │
│  │  (Payment only, no sale)                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Section                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Amount Received by Manager:                                │   │
│  │                                                             │   │
│  │  CASH:  ☐ ₹18,000  Collected by: __________                │   │
│  │  UPI:   ☐ ₹7,000   Collected by: __________                │   │
│  │                                                             │   │
│  │  Status: 🔴 Pending Handover                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Expandable rows (click arrow to see items)
- Shows both sales and payments
- Handover tracking section
- Manager can mark collections

---

## 11. Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name              [🔔 3]  [👤 Rajesh Kumar ▼]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  My Profile                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [📷 Photo]  Rajesh Kumar (AGT-001)                         │   │
│  │              Agent                                           │   │
│  │              +91 98765 43210                                 │   │
│  │              rajesh.agent@company.com                        │   │
│  │                                                             │   │
│  │  [Change Photo]                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Performance Stats (This Month)                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Sales: ₹5,50,000                                     │   │
│  │  Total Collections: ₹4,25,000                               │   │
│  │  Customers Served: 245                                      │   │
│  │  Outstanding Collected: ₹1,25,000                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Summary                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Pending Handover: ₹12,500                                  │   │
│  │  Last Handover: 2026-01-19 (₹25,000)                        │   │
│  │  Collected by: Manager Priya                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Settings                                                           │
│  [Change Password]                                                 │
│  [Notification Preferences]                                        │
│  [Language: English ▼]                                             │
│                                                                     │
│  [Logout]                                                          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [🗺️]        [➕]        [👥]        [📊]                │
│  Home     Routes    Record +   Customers   History                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Guidelines

### Color Scheme
- **Primary**: #2563EB (Blue) - Actions, links
- **Success**: #10B981 (Green) - Delivered, collected
- **Warning**: #F59E0B (Orange) - Pending, active
- **Danger**: #EF4444 (Red) - Cancelled, overdue
- **Neutral**: #6B7280 (Gray) - Text, borders

### Store Type Colors (Left Border)
- **Retail**: #2563EB (Blue)
- **Restaurant**: #F59E0B (Orange)
- **Wholesale**: #10B981 (Green)
- **Other**: #6B7280 (Gray)

### Typography
- **Headings**: Inter/Roboto (Bold)
- **Body**: Inter/Roboto (Regular)
- **Numbers**: Tabular for alignment

### Spacing & Accessibility
- Card Padding: 16px (mobile), 24px (desktop)
- Touch Targets: Minimum 44x44px
- Contrast Ratio: 4.5:1 minimum

---

## Summary

**Agent Interface Complete - 11 Pages:**
1. ✅ Home - Dashboard with stats, next order, map
2. ✅ All Orders - Searchable list with actions
3. ✅ Routes - List of accessible routes
4. ✅ Route Details - Stores in route with map
5. ✅ Record Sale - Product selection, payment collection
6. ✅ Record Payment - Separate payment recording
7. ✅ Customers - All accessible stores (color-coded by type)
8. ✅ Customer Profile - Customer & store details with navigation
9. ✅ Add Customer/Store - Create new or add to existing
10. ✅ History - Daily logs with summaries
11. ✅ Daily Log Details - Detailed records with handover tracking
12. ✅ Profile - Agent details, stats, settings

**Key Features:**
- Location-based nearest order recommendation
- Map integration with Google Maps
- Add products not associated with store (one-time)
- Color-coded store types
- Stores shown separately (not grouped by customer)
- Handover tracking in daily logs
- Request edit/price change functionality
- Offline-ready design

---

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Status**: Complete
