# Customer Interface - UI/UX Wireframes

## Overview

**Target Users:** Customers (business owners with stores)
**Platform:** Mobile-responsive web application
**Design Principles:** 
- Clean, intuitive interface
- Mobile-first design
- Quick access to key actions
- Visual hierarchy for important information
- Minimal clicks to complete tasks

---

## Navigation Structure

### Top Header Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Store Selector ▼]        [🔔 3]  [👤 Rajesh Kumar ▼]  │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Company Logo** (left) - Clickable, goes to home
- **Store Selector Dropdown** (left-center) - Quick switch between stores
  - Shows current store name
  - Dropdown lists all customer's stores
- **Notification Bell** (right) - Badge shows unread count
- **Customer Profile** (right) - Name + Avatar
  - Dropdown menu: Profile, Settings, Logout

**Store Selector Dropdown:**
```
┌────────────────────────────────┐
│ Tea Stall - MG Road (Selected) │
│ ────────────────────────────── │
│ Tiffin Center - Brigade Road   │
│ Restaurant - Koramangala       │
└────────────────────────────────┘
```

> [!NOTE]
> Customer can only view one store at a time. Use the store selector to switch between stores.

### Bottom Navigation Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

**Navigation Items:**
1. **Home** - Dashboard/Overview
2. **Sales** - View all recorded sales (deliveries)
3. **Order +** - Create new order (primary action)
4. **Transactions** - Complete financial history
5. **Profile** - Customer profile and settings

**Active State:**
- Active tab highlighted with primary color
- Icon + label both visible
- Smooth transition animations

---

## 1. Home Page (Dashboard)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📢 PROMOTIONAL BANNER (Carousel)                           │   │
│  │  [← Special Offer: 20% Off on Bulk Orders! →]              │   │
│  │  ● ○ ○ (Dots for slides)                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 📦 Orders    │  │ 💰 Outstanding│  │ 📊 This Month│            │
│  │              │  │               │  │               │            │
│  │    [2]       │  │   ₹5,000     │  │   [245]      │            │
│  │  Pending     │  │   Current    │  │ Items Ordered│            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Items Ordered This Month                                   │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │ 500ML Water  │  │ 1L Water     │  │ 250ML Water  │      │   │
│  │  │              │  │              │  │              │      │   │
│  │  │  150 units   │  │  75 units    │  │  20 units    │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Quick Actions                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │ 📝 Create    │  │ 📞 Call      │  │ 📊 View      │      │   │
│  │  │    Order     │  │    Agent     │  │    History   │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Recent Sales                                               │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │ Sale #SALE-012345                  2026-01-19 10:30 │    │   │
│  │  │ Agent: Rajesh Kumar                                 │    │   │
│  │  │ Total: ₹2,200 | Paid: ₹2,000                        │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  [View All Sales →]                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

### Components Breakdown

**1. Summary Cards**
- **Orders**: Pending count for this store
- **Outstanding**: Current outstanding amount
- **This Month**: Total items ordered this month (quantity count)
- Clickable to navigate to details

**2. Quick Actions**
- Create Order (→ Order + tab)
- Call Agent (calls customer care)
- View History (→ Transactions tab)

**3. Recent Sales**
- Last 2-3 sales for this store
- Link to view all

---

## 2. Sales Page (Recorded Deliveries)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Sales - Tea Stall                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Filters: [Date Range ▼]  [Apply]                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Sale #SALE-012345                          Agent: Rajesh   │   │
│  │  2026-01-19 10:30 AM                                        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Items           Price        Qty         Total             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water     ₹120         10          ₹1,200           │   │
│  │  1L Water        ₹200         5           ₹1,000           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Bill Amount:                       ₹2,200           │   │
│  │  Total Cash Paid:                         ₹1,500           │   │
│  │  Total UPI Paid:                          ₹500             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Sale #SALE-012344                          Agent: Priya    │   │
│  │  2026-01-18 02:30 PM                                        │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Items           Price        Qty         Total             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  500ML Water     ₹120         8           ₹960             │   │
│  │  250ML Water     ₹60          12          ₹720             │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Total Bill Amount:                       ₹1,680           │   │
│  │  Total Cash Paid:                         ₹1,000           │   │
│  │  Total UPI Paid:                          ₹0               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More Sales]                                                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Sales cards are NOT clickable (all info displayed)
- Chronological order (newest first)
- Infinite scroll
- Shows actual delivered items with custom pricing

---

## 3. Order + Page (Create Order)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ← Back                                                     │   │
│  │  Create Order - Tea Stall                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order Type: Detailed Order                                 │   │
│  │  (Configured for Retail stores)                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Select Products & Quantities                               │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │ [📷] 500ML Water Bottle                            │    │   │
│  │  │      Price: ₹120/unit                              │    │   │
│  │  │      Quantity: [−] [10] [+]                        │    │   │
│  │  │      Subtotal: ₹1,200                              │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │ [📷] 1L Water Bottle                               │    │   │
│  │  │      Price: ₹200/unit                              │    │   │
│  │  │      Quantity: [−] [5] [+]                         │    │   │
│  │  │      Subtotal: ₹1,000                              │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Order Summary                                              │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  Items: 2 products, 15 units                                │   │
│  │  Estimated Total: ₹2,200                                    │   │
│  │                                                             │   │
│  │  [Cancel]                           [Place Order]           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

### Simple Order Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Order Type: Simple Order                                           │
│  (Configured for Retail stores)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Just letting us know you need products.                           │
│  Our agent will contact you for details.                           │
│                                                                     │
│  Notes (Optional):                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Need urgent delivery for tomorrow morning...                │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Cancel]                           [Place Order]                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Transactions Page (Financial History)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Payment History - Tea Stall                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Balance Amount: ₹5,000                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Filters: [Date Range ▼] [Type: All ▼]  [Apply]            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Date      Desc       Sale Amt   Paid   Old Bal  New Bal   │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  19-01-26  Delivery   ₹2,200     ₹2,000  ₹3,000   ₹3,200  │   │
│  │            (Rajesh)                                         │   │
│  │                                                             │   │
│  │  18-01-26  Payment    -          ₹3,000  ₹8,000   ₹5,000  │   │
│  │            (Priya)                                          │   │
│  │                                                             │   │
│  │  17-01-26  Delivery   ₹1,680     ₹1,000  ₹7,500   ₹8,180  │   │
│  │            (Priya)                                          │   │
│  │                                                             │   │
│  │  15-01-26  Payment    -          ₹100    ₹110     ₹10     │   │
│  │            (Rajesh)                                         │   │
│  │                                                             │   │
│  │  14-01-26  Delivery   ₹120       ₹10     ₹0       ₹110    │   │
│  │            (Priya)                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More Transactions]                                          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

**Transaction Types:**
- **Delivery** - From Record Sale (shows sale amount + payment made)
- **Payment** - From Record Payment (shows "-" for sale amount)

**Clicking on Sale Amount:**
- Navigates to Sales page
- Highlights/scrolls to that specific sale

**Filters:**
- Date Range
- Type: All / Delivery / Payment

---

## 5. Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│  My Profile                                                         │
│                                                                     │
│  [📷 Photo] Rajesh Kumar ✅ | rajesh@example.com                   │
│  [Change Photo]          +91 98765 43210 (Contact admin to change)  │
│                                                                     │
│  Personal Information                                               │
│  Name: Rajesh Kumar                                                 │
│  Email: rajesh@example.com                                          │
│  Phone: +91 98765 43210 (Contact admin to change)                   │
│  Address: 789 Main Street, Bangalore - 560001                       │
│  GST Number: 29ABCDE1234F1Z5                                        │
│  [Edit Profile]                                                     │
│                                                                     │
│  My Stores Summary                                                  │
│  Total Stores: 3 | Total Outstanding: ₹12,500                       │
│  [View All Stores →]                                                │
│                                                                     │
│  Account Settings                                                   │
│  [Change Password] [Notification Preferences] [Logout]              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]               │
│  Home     Sales     Order +   Transactions  Profile                 │
└─────────────────────────────────────────────────────────────────────┘
```

**KYC Verification:**
- ✅ Green checkmark next to customer name if KYC verified
- KYC is done by agents only (not by customers)
- No KYC section visible to customers

---

## Store Profile Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🏢 Logo]  [Tea Stall - MG Road ▼]   [🔔 3]  [👤 Rajesh Kumar ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│  [📷 Store Photo] Tea Stall - MG Road                     ✅ Active │
│                                                                     │
│  Store Information                                                  │
│  Business: Tea Stall | Route: Route A                               │
│  Address: 123 MG Road, Bangalore - 560001                           │
│  Phone: +91 98765 43210  📍 [View on Map]                          │
│                                                                     │
│  Financial Summary (KYC Verified Customers Only)                    │
│  Outstanding: ₹5,000 | Credit Limit: ₹10,000 | Available: ₹5,000   │
│  Credit Usage: 50% ████████████░░░░░░░░░░░░                         │
│                                                                     │
│  This Month's Orders: 245 units  [View Detailed Breakdown]          │
│                                                                     │
│  Recent Activity                                                    │
│  🟢 Sale delivered - ₹2,200              2026-01-19 10:30          │
│  💵 Payment received - ₹3,000            2026-01-18 11:00          │
│                                                                     │
│  [Create Order] [View History] [📞 Call Agent]                     │
│                                                                     │
│  ⓘ To update store details, please contact admin                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [🏠]      [📦]        [➕]        [💰]        [👤]                 │
│  Home     Sales     Order +   Transactions  Profile                │
└─────────────────────────────────────────────────────────────────────┘
```

### Items Breakdown Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│  Items Ordered This Month - Tea Stall                      [✕]    │
├─────────────────────────────────────────────────────────────────────┤
│  January 2026 | Total: 245 units                                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  500ML Water Bottle                                         │   │
│  │  150 units                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1L Water Bottle                                            │   │
│  │  75 units                                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  250ML Water Bottle                                         │   │
│  │  20 units                                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Close]                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Guidelines

### Color Scheme
- **Primary**: #2563EB (Blue) - Actions, links
- **Success**: #10B981 (Green) - Delivered, approved, KYC verified
- **Warning**: #F59E0B (Orange) - Pending
- **Danger**: #EF4444 (Red) - Cancelled, rejected
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

**Customer Interface Complete - 5 Pages:**
1. ✅ Home - Store-specific dashboard with promotional banners
2. ✅ Sales - Recorded deliveries (non-clickable cards with full details)
3. ✅ Order + - Create order (detailed/simple based on store type)
4. ✅ Transactions - Complete financial history (delivery + payment records)
5. ✅ Profile - Personal info with KYC indicator

**Key Features:**
- Store selector (one store at a time)
- Bottom navigation for quick access
- Outstanding balance on Sales and Transactions pages
- KYC verification (✅ green checkmark, done by agents only)
- Credit limit visible only to KYC-verified customers
- Phone number read-only (contact admin to change)
- Items breakdown: simplified to "Product - Quantity"

---

**Document Version**: 2.0
**Last Updated**: 2026-01-20
**Status**: Complete
