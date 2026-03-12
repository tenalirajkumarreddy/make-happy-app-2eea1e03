# Marketer Interface - UI/UX Wireframes

## Overview

**Target Users:** Marketers (Customer Acquisition & Relationship Management)
**Platform:** Mobile-responsive web application
**Design Principles:** 
- Customer acquisition focused
- Order management for accessible store types
- Proxy order creation on behalf of customers
- Payment collection tracking
- No product delivery (no sales recording)

---

## Navigation Structure

### Top Header Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Company Logo + Name** (left)
- **Offline Mode Indicator**: 
  - 📡 Online (Green) - Connected to internet
  - 📡 Offline (Orange) - Working offline, will sync later
  - 📡 Syncing (Blue) - Uploading pending data
- **Notification Bell** (right) - Badge shows unread count
- **Marketer Profile** (right) - Name + Avatar dropdown

### Bottom Navigation Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Home Page (Dashboard)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Hello, Amit Patel                                                  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 👥 Customers │  │ 🏪 Stores    │  │ 📦 Active    │            │
│  │   Added      │  │   Added      │  │   Orders     │            │
│  │  This Month  │  │  This Month  │  │              │            │
│  │    [15]      │  │    [22]      │  │    [8]       │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 💰 Payments  │  │ 💵 Cash      │  │ 📱 UPI       │            │
│  │  Collected   │  │  Collected   │  │  Collected   │            │
│  │   Today      │  │   Today      │  │   Today      │            │
│  │   ₹12,000    │  │   ₹8,000     │  │   ₹4,000     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐                               │
│  │ 💵 Cash      │  │ 📱 UPI       │                               │
│  │  Handover    │  │  Handover    │                               │
│  │              │  │              │                               │
│  │   🟠 Pending │  │   🟢 Collected│                              │
│  └──────────────┘  └──────────────┘                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Recent Activity                                            │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  📦 Order created for Tea Stall - MG Road                   │   │
│  │     by Marketer Amit | ORD-012345 | 2 hours ago            │   │
│  │                                                             │   │
│  │  👥 Added new customer: Priya Sharma                        │   │
│  │     CUST-00789 | 5 hours ago                                │   │
│  │                                                             │   │
│  │  💰 Collected payment from Restaurant - Koramangala         │   │
│  │     ₹5,000 | Yesterday                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Quick Actions                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │ 👥 Add       │  │ 📦 Create    │  │ 💰 Record    │      │   │
│  │  │  Customer    │  │  Order       │  │  Payment     │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

### Components Breakdown

**1. Summary Cards**
- Customers Added (this month)
- Stores Added (this month)
- Active Orders (for accessible store types)
- Payments Collected (today)
- Cash Collected (today)
- UPI Collected (today)
- Cash Handover Status (🔴 Pending, 🟠 Handed Over, 🟢 Collected)
- UPI Handover Status (🔴 Pending, 🟠 Handed Over, 🟢 Collected)

**2. Recent Activity**
- Shows recent actions (orders created, customers added, payments collected)
- Timestamped
- Clickable to view details

**3. Quick Actions**
- Add Customer
- Create Order
- Record Payment

---

## 2. Orders Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Orders                                                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Search: [🔍 Store name, customer, order ID...]            │   │
│  │  Filters: [Store Type ▼] [Status ▼] [Created By ▼]         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ M│ Order #ORD-012345                      🟠 Active         │   │
│  │ A│ ─────────────────────────────────────────────────────    │   │
│  │ N│ Tea Stall - MG Road (STR-00123)        Retail            │   │
│  │ U│ Rajesh Kumar (CUST-00456)                                │   │
│  │ A│ 123 MG Road, Bangalore - 560001                          │   │
│  │ L│                                                           │   │
│  │  │ Created by: Marketer Amit (MKT-001)                      │   │
│  │  │ Created on: 2026-01-20 10:30 AM                          │   │
│  │  │                                                           │   │
│  │  │ Items:                                                   │   │
│  │  │ • 500ML Water - 10 units                                 │   │
│  │  │ • 1L Water - 5 units                                     │   │
│  │  │                                                           │   │
│  │  │ [✏️ Edit]  [❌ Cancel]  [👁️ View Details]               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ M│ Order #ORD-012344                      🟢 Delivered      │   │
│  │ A│ ─────────────────────────────────────────────────────    │   │
│  │ N│ Restaurant - Koramangala (STR-00124)   Restaurant        │   │
│  │ U│ Priya Sharma (CUST-00457)                                │   │
│  │ A│ 456 Koramangala, Bangalore - 560034                      │   │
│  │ L│                                                           │   │
│  │  │ Created by: Customer                                     │   │
│  │  │ Created on: 2026-01-19 02:00 PM                          │   │
│  │  │                                                           │   │
│  │  │ Delivered on: 2026-01-19 04:30 PM                        │   │
│  │  │ Sale: SALE-012344 | Amount: ₹1,680                       │   │
│  │  │                                                           │   │
│  │  │ [View Sale Details]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ A│ Order #ORD-012343                      🟠 Active         │   │
│  │ U│ ─────────────────────────────────────────────────────    │   │
│  │ T│ Bakery - Jayanagar (STR-00125)         Retail            │   │
│  │ O│ Suresh Reddy (CUST-00458)                                │   │
│  │  │ 789 Jayanagar, Bangalore - 560011                        │   │
│  │  │                                                           │   │
│  │  │ Created by: System (Auto-generated)                      │   │
│  │  │ Created on: 2026-01-20 06:00 AM                          │   │
│  │  │                                                           │   │
│  │  │ Items:                                                   │   │
│  │  │ • 500ML Water - 15 units                                 │   │
│  │  │                                                           │   │
│  │  │ [👁️ View Details]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More Orders]                                                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Order Types:**
- **MANUAL** (Orange tag) - Created by customer or marketer
- **AUTO** (Blue tag) - System-generated

**Order Metadata:**
- Created by: Marketer name (MKT-ID) or "Customer" or "System"
- Created on: Timestamp

**Filter Options:**
- Store Type (only accessible types shown)
- Status (Active, Delivered, Cancelled)
- Created By (Me, Customer, System, All)

**Actions:**
- **Active Orders (Created by Marketer)**: Edit, Cancel, View Details
- **Active Orders (Created by Others)**: View Details only
- **Delivered Orders**: View Sale Details
- **Cancelled Orders**: View Cancellation Reason

---

## 3. Create Order Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Create Order (On Behalf of Customer)                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Select Customer/Store                                      │   │
│  │  [🔍 Search: Shop name, customer, phone, ID...]            │   │
│  │                                                             │   │
│  │  ⓘ Only stores of accessible types are shown               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Selected: Tea Stall - MG Road (STR-00123)                          │
│  Customer: Rajesh Kumar (CUST-00456)                                │
│  Store Type: Retail                                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order Type                                                 │   │
│  │  ○ Simple Order (Requirement note only)                     │   │
│  │  ○ Detailed Order (Products + Quantities)                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Simple Order - Requirement Note                            │   │
│  │  [Enter requirement: e.g., "Need water bottles urgently"]  │   │
│  │                                                             │   │
│  │  (OR)                                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Products (Associated with store)                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Product                        Quantity                    │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water                    [10]                        │   │
│  │  1L Water                       [5]                         │   │
│  │  250ML Water                    [0]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order Summary                                              │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  • 500ML Water - 10 units                                   │   │
│  │  • 1L Water - 5 units                                       │   │
│  │                                                             │   │
│  │  Total Items: 15 units                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ⓘ This order will be marked as MANUAL                      │   │
│  │    Created by: Marketer Amit (MKT-001)                      │   │
│  │    Created for: Tea Stall - MG Road (STR-00123)             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Create Order]                                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Select customer/store (filtered by accessible store types)
- Choose order type (Simple/Detailed based on store configuration)
- Add products and quantities
- Order marked as MANUAL
- Metadata: Created by (Marketer), Created for (Store)

---

## 4. Edit Order Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Edit Order #ORD-012345                                             │
│                                                                     │
│  Store: Tea Stall - MG Road (STR-00123)                             │
│  Customer: Rajesh Kumar (CUST-00456)                                │
│  Created by: Marketer Amit (MKT-001)                                │
│  Created on: 2026-01-20 10:30 AM                                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Products                                                   │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Product                        Quantity                    │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water                    [10]                        │   │
│  │  1L Water                       [5]                         │   │
│  │  250ML Water                    [0]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ⓘ Only orders created by you can be edited                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Update Order]                                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Customers Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Customers                                          [Filter ▼]  [+] │
│                                                                     │
│  [🔍 Search: Store name, customer, phone, ID...]                   │
│                                                                     │
│  ⓘ Showing stores of accessible types only                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ R│  Tea Stall - MG Road                                        │   │
│ E│  Rajesh Kumar                                 Retail         │   │
│ T│  +91 98765 43210                                            │   │
│ A│  123 MG Road, Bangalore - 560001              ₹5,000        │   │
│ I│                                                             │   │
│ L│  [📞 Call]  [📝 Create Order]  [💰 Record Payment]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ R│  Restaurant - Koramangala                                   │   │
│ E│  Priya Sharma                                 Restaurant    │   │
│ S│  +91 98765 43211                                            │   │
│ T│  456 Koramangala, Bangalore - 560034          ₹8,000        │   │
│ A│                                                             │   │
│ U│  [📞 Call]  [📝 Create Order]  [💰 Record Payment]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│ R│  Bakery - Jayanagar                                         │   │
│ E│  Suresh Reddy                                 Retail         │   │
│ T│  +91 98765 43212                                            │   │
│ A│  789 Jayanagar, Bangalore - 560011            ₹3,200        │   │
│ I│                                                             │   │
│ L│  [📞 Call]  [📝 Create Order]  [💰 Record Payment]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Color Coding (Left Border):**
- **RETAIL** - Blue (#2563EB)
- **RESTAURANT** - Orange (#F59E0B)
- **WHOLESALE** - Green (#10B981)
- **OTHER** - Gray (#6B7280)

**Filter Options:**
- Store Type (only accessible types)
- Outstanding Amount (High to Low, Low to High)

**Quick Actions:**
- Call
- Create Order
- Record Payment

**Note:** Only shows stores of types the marketer has access to.

---

## 6. Customer Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Customer Profile                                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Rajesh Kumar (CUST-00456)      ┌──────────────┐            │   │
│  │  +91 98765 43210                │              │            │   │
│  │  rajesh@example.com             │   Customer   │            │   │
│  │  Aadhar: XXXX-XXXX-1234         │    Photo     │            │   │
│  │  GST: 29ABCDE1234F1Z5           │              │            │   │
│  │  KYC Completed: ✅ Yes          └──────────────┘            │   │
│  │  Credit Limit: ₹50,000                                      │   │
│  │                                                             │   │
│  │  Total Outstanding (All Stores): ₹12,500                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [◀ Previous Store]    Store 1 of 3    [Next Store ▶]             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                                                     │    │   │
│  │  │              Store Photo                            │    │   │
│  │  │                                                     │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  Tea Stall - MG Road (STR-00123)                            │   │
│  │  Type: Retail                                               │   │
│  │                                                             │   │
│  │  Address: 123 MG Road, Bangalore - 560001                   │   │
│  │  Outstanding: ₹5,000                                        │   │
│  │                                                             │   │
│  │  Custom Prices:                                             │   │
│  │  • 500ML Water - ₹120                                       │   │
│  │  • 1L Water - ₹200                                          │   │
│  │  • 250ML Water - ₹60                                        │   │
│  │                                                             │   │
│  │  [📞 Call]  [📝 Create Order]  [💰 Record Payment]          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Navigation:**
- Swipe left/right to navigate between customer's stores
- Previous/Next buttons
- Store count indicator

**Quick Actions:**
- Call
- Create Order (proxy creation)
- Record Payment

---

## 7. Add Customer/Store Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
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
│  │                                                             │   │
│  │  ⚠️ Duplicate Detection:                                    │   │
│  │  • Mobile number checked in real-time                       │   │
│  │  • Blocks if customer with same number exists               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ❌ Customer with mobile +91 98765 43210 already exists     │   │
│  │     Customer: Rajesh Kumar (CUST-00456)                     │   │
│  │                                                             │   │
│  │  [Use Existing Customer]  [Cancel]                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
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
│  │  Store Name:  [Tea Time____________]                       │   │
│  │  Store Type:  [Retail ▼]                                   │   │
│  │  (Only accessible types shown)                              │   │
│  │                                                             │   │
│  │  ⚠️ Similar store name exists: "Tea Time"                  │   │
│  │     Location: 2.3 km away                                  │   │
│  │                                                             │   │
│  │  Suggested name: "Tea Time (MG Road)"                      │   │
│  │                                                             │   │
│  │  ○ Use suggested name                                      │   │
│  │  ○ Enter different name: [_____________]                   │   │
│  │  ○ Keep original name                                      │   │
│  │                                                             │   │
│  │  Address:     [____________]        │              │        │   │
│  │               [____________]        └──────────────┘        │   │
│  │                                                             │   │
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
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Note:** Store Type dropdown only shows types the marketer has access to.

**Duplicate Detection System:**

1. **Mobile Number Validation (Hard Block)**
   - Real-time check when phone number is entered
   - If customer with same mobile exists → Block with error message
   - Must use existing customer or cancel

2. **Store Name + Location Check (Smart Warning)**
   - Checks for similar store names when entered
   - If similar name found:
     - Distance < 5m → Warning: "Similar store exists for this customer"
     - Distance > 5m → Suggest auto-tag with area/street name
   - Options:
     - Use suggested name (e.g., "Tea Time (MG Road)")
     - Enter different name manually
     - Keep original name (if confident it's different)

3. **Auto-Tagging Logic**
   - System extracts street/area from address
   - Appends to store name in parentheses
   - Example: "Tea Time" → "Tea Time (AT Agraharam)"

---

## 8. Record Payment Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Record Payment                                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Select Customer/Store                                      │   │
│  │  [🔍 Search: Shop name, customer, phone, ID...]            │   │
│  │                                                             │   │
│  │  ⓘ Only stores of accessible types are shown               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Selected: Tea Stall - MG Road (STR-00123)                          │
│  Customer: Rajesh Kumar (CUST-00456)                                │
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
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Select customer/store (filtered by accessible store types)
- Date selection
- Cash and UPI collection
- Balance calculation
- No sales recording (payment only)

---

## 9. History Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  History                                                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  💰 Handover Summary                                        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Today's Handoverables:                                     │   │
│  │  Cash: ₹8,000 | UPI: ₹4,000                                 │   │
│  │                                                             │   │
│  │  ⏳ Total Pending Handoverables:                            │   │
│  │  Cash: ₹18,000 | UPI: ₹9,500                                │   │
│  │  (Includes 2 days pending)                                  │   │
│  │                                                             │   │
│  │  ✅ Last Collection:                                        │   │
│  │  2026-01-18 by Manager Priya                                │   │
│  │  Cash: ₹12,000 | UPI: ₹6,000                                │   │
│  │                                                             │   │
│  │  [Mark as Handed Over]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Daily Logs                                      [Filter: Date ▼]  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Daily Log - 2026-01-20                                     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Customers Added: 2                                         │   │
│  │  Stores Added: 3                                            │   │
│  │  Orders Created: 5                                          │   │
│  │  Payments Collected: 8                                      │   │
│  │                                                             │   │
│  │  Total CASH: ₹8,000                                         │   │
│  │  Total UPI: ₹4,000                                          │   │
│  │  Total Payments: ₹12,000                                    │   │
│  │                                                             │   │
│  │  [More Details →]                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Daily Log - 2026-01-19                                     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Customers Added: 1                                         │   │
│  │  Stores Added: 2                                            │   │
│  │  Orders Created: 3                                          │   │
│  │  Payments Collected: 6                                      │   │
│  │                                                             │   │
│  │  Total CASH: ₹6,000                                         │   │
│  │  Total UPI: ₹3,500                                          │   │
│  │  Total Payments: ₹9,500                                     │   │
│  │                                                             │   │
│  │  [More Details →]                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Daily Log Details Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Daily Log - 2026-01-20                                             │
│                                                                     │
│  Summary:                                                           │
│  Customers Added: 2                                                 │
│  Stores Added: 3                                                    │
│  Orders Created: 5                                                  │
│  Payments Collected: 8                                              │
│  Total CASH: ₹8,000                                                 │
│  Total UPI: ₹4,000                                                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  All Records                                                │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Customer    Old Bal  Cash  UPI  New Bal  Type             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Tea Stall   ₹3,000  ₹1,500 ₹500  ₹1,000  Payment          │   │
│  │  Restaurant  ₹8,000  ₹2,000 ₹1,000 ₹5,000  Payment         │   │
│  │  Bakery      ₹5,000  ₹1,000 ₹0    ₹4,000  Payment          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Orders Created:                                            │   │
│  │  • ORD-012345 - Tea Stall - MG Road                         │   │
│  │  • ORD-012346 - Restaurant - Koramangala                    │   │
│  │  • ORD-012347 - Bakery - Jayanagar                          │   │
│  │                                                             │   │
│  │  Customers Added:                                           │   │
│  │  • CUST-00789 - Priya Sharma                                │   │
│  │  • CUST-00790 - Suresh Reddy                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Section                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Amount Received by Manager:                                │   │
│  │                                                             │   │
│  │  CASH:  ☐ ₹8,000   Collected by: __________                │   │
│  │  UPI:   ☐ ₹4,000   Collected by: __________                │   │
│  │                                                             │   │
│  │  Status: 🔴 Pending Handover                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 Amit Patel ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  My Profile                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [📷 Photo]  Amit Patel (MKT-001)                           │   │
│  │              Marketer                                        │   │
│  │              +91 98765 43210                                 │   │
│  │              amit.marketer@company.com                       │   │
│  │                                                             │   │
│  │  [Change Photo]                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Accessible Store Types                                     │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  • Retail                                                   │   │
│  │  • Restaurant                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Performance Stats (This Month)                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Customers Added: 15                                        │   │
│  │  Stores Added: 22                                           │   │
│  │  Orders Created: 45                                         │   │
│  │  Total Payments Collected: ₹2,50,000                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Summary                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Pending Handover: ₹27,500                                  │   │
│  │  Last Handover: 2026-01-18 (₹18,000)                        │   │
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
│  [🏠]      [📦]        [➕]        [👥]        [📊]                │
│  Home     Orders   Create Order Customers   History                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Guidelines

### Color Scheme
- **Primary**: #2563EB (Blue) - Actions, links
- **Success**: #10B981 (Green) - Delivered, collected
- **Warning**: #F59E0B (Orange) - Pending, active, manual orders
- **Danger**: #EF4444 (Red) - Cancelled, overdue
- **Neutral**: #6B7280 (Gray) - Text, borders
- **Info**: #3B82F6 (Light Blue) - Auto orders

### Store Type Colors (Left Border)
- **Retail**: #2563EB (Blue)
- **Restaurant**: #F59E0B (Orange)
- **Wholesale**: #10B981 (Green)
- **Other**: #6B7280 (Gray)

### Order Type Tags
- **MANUAL**: Orange (#F59E0B) - Created by customer or marketer
- **AUTO**: Blue (#3B82F6) - System-generated

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

**Marketer Interface Complete - 11 Pages:**
1. ✅ Home - Dashboard with stats and recent activity
2. ✅ Orders - View and manage orders (filtered by accessible store types)
3. ✅ Create Order - Proxy order creation on behalf of customers
4. ✅ Edit Order - Modify orders created by marketer
5. ✅ Customers - All accessible stores (filtered by store type)
6. ✅ Customer Profile - Customer & store details with quick actions
7. ✅ Add Customer/Store - Create new customers and stores
8. ✅ Record Payment - Payment collection only (no sales)
9. ✅ History - Daily logs with handover tracking
10. ✅ Daily Log Details - Detailed records with handover section
11. ✅ Profile - Marketer details, accessible store types, stats

**Key Features:**
- **Store Type Access Control** - Only see/manage stores of accessible types
- **Proxy Order Creation** - Create orders on behalf of customers
- **Order Types**:
  - Simple Order: Requirement note only (e.g., "Need water bottles urgently")
  - Detailed Order: Products + Quantities specified
- **Order Tracking** - Created by (Marketer/Customer/System), Created for (Store)
- **Manual Order Tagging** - All marketer-created orders tagged as MANUAL
- **Activity Logs** - "Order created for [Store] by [Marketer Name]"
- **Duplicate Detection System**:
  - Mobile number: Hard block (no duplicates allowed)
  - Store name + location: Smart warnings with auto-tagging
  - Distance < 5m: Likely duplicate warning
  - Distance > 5m: Suggest area-based naming
- **Payment Collection** - Record payments with handover tracking
- **No Sales Recording** - Cannot record product deliveries
- **No Routes** - Not route-based like agents
- **Handover Management** - Separate Cash/UPI tracking

---

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Status**: Complete
