# POS Interface - UI/UX Wireframes

## Overview

**Target Users:** POS (Point of Sale) Operators
**Platform:** Mobile-responsive web application / Desktop
**Design Principles:** 
- Quick sale entry for walk-in customers
- Simplified interface (no routes, no orders, no customer management)
- Immediate payment collection
- View-only sales history
- Handover tracking

---

## Navigation Structure

### Top Header Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Company Logo + Name** (left)
- **Offline Mode Indicator**: 
  - 📡 Online (Green) - Connected to internet
  - 📡 Offline (Orange) - Working offline, will sync later
  - 📡 Syncing (Blue) - Uploading pending data
- **Notification Bell** (right) - Badge shows unread count
- **POS User Profile** (right) - Name + Avatar dropdown

### Bottom Navigation Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Home Page (Dashboard)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Hello, POS User                                                    │
│  Today: Monday, 20 January 2026                                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 💰 Sales     │  │ 💵 Cash      │  │ 📱 UPI       │            │
│  │   Today      │  │  Collected   │  │  Collected   │            │
│  │              │  │   Today      │  │   Today      │            │
│  │   ₹45,000    │  │   ₹28,000    │  │   ₹17,000    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 📦 Total     │  │ 💵 Cash      │  │ 📱 UPI       │            │
│  │   Sales      │  │  Handover    │  │  Handover    │            │
│  │   Count      │  │              │  │              │            │
│  │    [32]      │  │   🟠 Pending │  │   🟢 Collected│           │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Recent Sales                                               │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  SALE-012345 | ₹1,500 | Cash | 2 mins ago                  │   │
│  │  • 500ML Water - 10 units                                   │   │
│  │  • 1L Water - 5 units                                       │   │
│  │                                                             │   │
│  │  SALE-012344 | ₹2,200 | UPI | 15 mins ago                  │   │
│  │  • 500ML Water - 15 units                                   │   │
│  │  • 250ML Water - 20 units                                   │   │
│  │                                                             │   │
│  │  SALE-012343 | ₹3,500 | Cash | 30 mins ago                 │   │
│  │  • 1L Water - 10 units                                      │   │
│  │  • 2L Water - 5 units                                       │   │
│  │                                                             │   │
│  │  [View All Sales →]                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Quick Action                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │                                                      │   │   │
│  │  │           [➕ Record New Sale]                       │   │   │
│  │  │                                                      │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Components Breakdown

**1. Summary Cards**
- Sales Today (total amount)
- Cash Collected (today)
- UPI Collected (today)
- Total Sales Count (today)
- Cash Handover Status (🔴 Pending, 🟠 Handed Over, 🟢 Collected)
- UPI Handover Status (🔴 Pending, 🟠 Handed Over, 🟢 Collected)

**2. Recent Sales**
- Last 3 sales with details
- Sale ID, amount, payment method, time
- Product breakdown
- Link to view all sales

**3. Quick Action**
- Large "Record New Sale" button

---

## 2. Record Sale Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Record Sale (Walk-in Customer)                                     │
│                                                                     │
│  ⓘ Sales are recorded for walk-in customers (POS)                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Products (All products available)                          │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  [🔍 Search products...]                                    │   │
│  │                                                             │   │
│  │  Product         Price/unit    Qty        Total             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water     ₹120         [10]        ₹1,200           │   │
│  │  1L Water        ₹200         [5]         ₹1,000           │   │
│  │  250ML Water     ₹60          [0]         ₹0               │   │
│  │  2L Water        ₹350         [0]         ₹0               │   │
│  │                                                             │   │
│  │  [+ Add More Products]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TOTAL                                          ₹2,200      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Payment Collection (Immediate)                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Cash Collected:  [₹2,200]                                  │   │
│  │  UPI Collected:   [₹0]                                      │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  TOTAL PAID                                     ₹2,200      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ⓘ Walk-in sales are immediate (no balance tracking)       │   │
│  │    Customer: POS (Walk-in)                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Record Sale]                                                     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Access to all products (searchable)
- Default prices shown (no custom pricing)
- Quantity input for each product
- Immediate payment collection (Cash/UPI)
- No balance tracking (full payment required)
- Uses global "POS" customer
- Cannot edit/delete after recording

---

## 3. Sale Confirmation Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sale Recorded Successfully!                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ SALE-012345                                                     │
│                                                                     │
│  Date: 2026-01-20 11:30 AM                                          │
│  Customer: POS (Walk-in)                                            │
│                                                                     │
│  Items:                                                             │
│  • 500ML Water - 10 units @ ₹120 = ₹1,200                          │
│  • 1L Water - 5 units @ ₹200 = ₹1,000                              │
│                                                                     │
│  Total: ₹2,200                                                      │
│  Paid: ₹2,200 (Cash)                                                │
│                                                                     │
│  [Print Receipt]  [Record Another Sale]  [Close]                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Sales History Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Sales History                                                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Search: [🔍 Sale ID, product...]                          │   │
│  │  Filters: [Date Range ▼] [Payment Method ▼]                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SALE-012345                                    ₹2,200      │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  2026-01-20 11:30 AM | Cash                                │   │
│  │                                                             │   │
│  │  Items:                                                     │   │
│  │  • 500ML Water - 10 units @ ₹120 = ₹1,200                  │   │
│  │  • 1L Water - 5 units @ ₹200 = ₹1,000                      │   │
│  │                                                             │   │
│  │  [View Details]  [Print Receipt]                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SALE-012344                                    ₹3,500      │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  2026-01-20 10:45 AM | UPI                                 │   │
│  │                                                             │   │
│  │  Items:                                                     │   │
│  │  • 500ML Water - 15 units @ ₹120 = ₹1,800                  │   │
│  │  • 250ML Water - 20 units @ ₹60 = ₹1,200                   │   │
│  │  • 1L Water - 5 units @ ₹200 = ₹1,000                      │   │
│  │                                                             │   │
│  │  [View Details]  [Print Receipt]                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SALE-012343                                    ₹1,500      │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  2026-01-20 09:15 AM | Cash                                │   │
│  │                                                             │   │
│  │  Items:                                                     │   │
│  │  • 1L Water - 10 units @ ₹200 = ₹2,000                     │   │
│  │                                                             │   │
│  │  [View Details]  [Print Receipt]                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- View-only (cannot edit/delete)
- Search by sale ID or product
- Filter by date range and payment method
- View details and print receipt
- Expandable item list

---

## 5. Daily Log Details Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back                                                            │
│  Daily Log - 2026-01-20                                             │
│                                                                     │
│  Summary:                                                           │
│  Total Sales: 32                                                    │
│  Total Amount: ₹45,000                                              │
│  Total CASH: ₹28,000                                                │
│  Total UPI: ₹17,000                                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Product-wise Summary                                       │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Product         Quantity    Amount                         │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water     320 units   ₹38,400                        │   │
│  │  1L Water        160 units   ₹32,000                        │   │
│  │  250ML Water     100 units   ₹6,000                         │   │
│  │  2L Water        20 units    ₹7,000                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  All Sales                                                  │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  Time      Sale ID      Amount   Payment  [▼]              │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  11:30 AM  SALE-012345  ₹2,200   Cash     [▼]              │   │
│  │  10:45 AM  SALE-012344  ₹3,500   UPI      [▼]              │   │
│  │  09:15 AM  SALE-012343  ₹1,500   Cash     [▼]              │   │
│  │  ...                                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Section                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Amount Received by Manager:                                │   │
│  │                                                             │   │
│  │  CASH:  ☐ ₹28,000  Collected by: __________                │   │
│  │  UPI:   ☐ ₹17,000  Collected by: __________                │   │
│  │                                                             │   │
│  │  Status: 🔴 Pending Handover                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Daily summary with total sales count and amount
- Product-wise breakdown
- All sales list (expandable)
- Handover tracking section
- Manager can mark collections

---

## 6. Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo] Company Name   [📡 Online]   [🔔 3]  [👤 POS User ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  My Profile                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [📷 Photo]  POS User (POS-001)                             │   │
│  │              POS Operator                                    │   │
│  │              +91 98765 43210                                 │   │
│  │              pos.user@company.com                            │   │
│  │                                                             │   │
│  │  [Change Photo]                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Performance Stats (This Month)                             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Sales: 450                                           │   │
│  │  Total Amount: ₹5,50,000                                    │   │
│  │  Average Sale: ₹1,222                                       │   │
│  │  Cash Sales: ₹3,20,000                                      │   │
│  │  UPI Sales: ₹2,30,000                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Handover Summary                                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Pending Handover: ₹45,000                                  │   │
│  │  Last Handover: 2026-01-19 (₹52,000)                        │   │
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
│  [🏠]           [➕]           [📊]           [👤]                  │
│  Home      Record Sale      History        Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Guidelines

### Color Scheme
- **Primary**: #2563EB (Blue) - Actions, links
- **Success**: #10B981 (Green) - Completed sales, collected
- **Warning**: #F59E0B (Orange) - Pending handover
- **Danger**: #EF4444 (Red) - Errors
- **Neutral**: #6B7280 (Gray) - Text, borders

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

**POS Interface Complete - 6 Pages:**
1. ✅ Home - Dashboard with daily stats and recent sales
2. ✅ Record Sale - Quick sale entry for walk-in customers
3. ✅ Sale Confirmation - Success modal with receipt option
4. ✅ Sales History - View-only list of all sales
5. ✅ Daily Log Details - Comprehensive daily summary with handover
6. ✅ Profile - POS user details and performance stats

**Key Features:**
- **Walk-in Customer Sales** - Uses global "POS" customer
- **All Products Access** - No store-type restrictions
- **Immediate Payment** - Full payment required (no balance)
- **View-Only Sales** - Cannot edit/delete after recording
- **Simplified Interface** - No routes, orders, or customer management
- **Handover Tracking** - Separate Cash/UPI status
- **Quick Workflow** - Optimized for fast sale entry
- **Receipt Printing** - Print option for each sale

---

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Status**: Complete
