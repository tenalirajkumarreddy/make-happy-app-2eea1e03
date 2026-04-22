# Implementation Plan - Staff & Income Features

## Overview
Transform staff management into card-based directory with detailed profiles, implement Income page for cash flow tracking, and enhance permission system.

---

## 1. Staff Directory Redesign

### Current State
- Table/row-based listing
- Limited information display
- Direct edit mode

### New Design
**StaffCard Component** (Similar to CustomerCard, StoreCard)
```
┌─────────────────────────────────────┐
│  ┌──────┐                           │
│  │Avatar│  Raj Kumar        ● Active│
│  │      │  Agent            Manager │
│  └──────┘                           │
│  ─────────────────────────────────  │
│  📞 +91 98765 43210                 │
│  📧 raj@company.com                 │
│  📦 Warehouse: Main WH              │
│  💰 Cash: ₹2,450  📦 Stock: 45     │
│  ─────────────────────────────────  │
│  [View Profile] [Record Payment]    │
└─────────────────────────────────────┘
```

**Features:**
- Avatar with status indicator
- Quick stats (cash holding, stock count)
- Role badge
- Warehouse assignment
- Click to open full profile
- Hover actions (quick call, message)

---

## 2. Staff Profile Page

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Back]              Raj Kumar            [Edit] [Actions] │
│  Agent ● Active                                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────────────────────────────┐│
│  │             │  │ STATS                                   ││
│  │   Avatar    │  │ ┌────────┐ ┌────────┐ ┌────────┐       ││
│  │   (Large)   │  │ │ ₹2,450│ │ 📦 45  │ │✅ 128  │       ││
│  │             │  │ │  Cash   │ │ Stock  │ │Sales   │       ││
│  │ [📷 Change] │  │ └────────┘ └────────┘ └────────┘       ││
│  └─────────────┘  │                                         ││
│                   │ TODAY'S ACTIVITY                        ││
│  CONTACT INFO     │ ┌─────────────────────────────────────┐ ││
│  📞 +91...        │ │ 🛒 Sale    Store A    ₹1,200  10:30│ ││
│  📧 email         │ │ 💰 Payment Store B     ₹500   11:15│ ││
│  🏢 Main WH       │ │ 🏪 Visit   Store C     ─      12:00│ ││
│                   │ └─────────────────────────────────────┘ ││
│                   │                                         ││
│  WORK INFO        │ STOCK HOLDING                           ││
│  📅 Joined: 2024  │ ┌─────────────────────────────────────┐ ││
│  🎫 ID: AG001     │ │ Product A    15 units   ₹12,000    │ ││
│                   │ │ Product B    20 units   ₹8,500     │ ││
│                   │ │ Product C    10 units   ₹4,200     │ ││
│                   │ └─────────────────────────────────────┘ ││
│                   └─────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  PERMISSIONS (Categorized)                                   │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐ │
│  │ 📊 SALES    │ 📦 INVENTORY│ 🗺️ ROUTES   │ 💰 FINANCE   │ │
│  │             │             │             │              │ │
│  │ ☑️ Record   │ ☑️ View     │ ☑️ View     │ ☐ Approve   │ │
│  │ ☑️ Edit     │ ☑️ Transfer │ ☑️ Create   │ ☑️ Record    │ │
│  │ ☐ Delete    │ ☐ Adjust    │ ☑️ Visit    │ ☐ Override  │ │
│  │ ☑️ On-behalf│ ☐ Return    │             │              │ │
│  └─────────────┴─────────────┴─────────────┴──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ACTIVITY TIMELINE                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Today                                                   ││
│  │ • 14:30 - Recorded sale at Store A (₹2,400)          ││
│  │ • 12:15 - Collected payment from Store B (₹500)      ││
│  │ • 10:00 - Started route session #45                   ││
│  │                                                         ││
│  │ Yesterday                                               ││
│  │ • 16:00 - Handed over ₹3,200 to Manager              ││
│  │ • 14:20 - 5 stores visited                            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Income Page Structure

### Cash Flow Architecture
```
STAFF → MANAGER → PRIME MANAGER
   ↓        ↓           ↓
   Cash   Cash     Collections (Daily Income)
   UPI    UPI      ─────────────
                  │ Sales Collections │
                  │ Other Income      │
                  │ Direct Payments   │
                  │ Handover Receipts │
                  ───────────────────
                         ↓
                    Income Page
                         ↓
              Categorized Reporting
```

### Income Categories
```
├── COLLECTIONS (Auto from sales/handovers)
│   ├── Cash Collections
│   ├── UPI Collections
│   └── Mixed (Cash + UPI)
│
├── DIRECT PAYMENTS (Non-sales income)
│   ├── Walk-in payments
│   ├── Advance payments
│   └── Settlement payments
│
├── OTHER INCOME (Manual entry)
│   ├── Rent received
│   ├── Interest income
│   ├── Refunds
│   └── Misc income
│
└── LENDING/CREDIT
    ├── Money lent (recorded as income)
    └── Repayments (in expenses)
```

### Prime Manager Daily Reset
```
End of Day Process:

Prime Manager Account:
  Opening: ₹0 (always starts at 0)
  + Collections from staff: ₹15,000
  + Direct payments: ₹5,000
  + Other income: ₹2,000
  ─────────────────────────────
  Total: ₹22,000 → Recorded as "Daily Income"
  
Next Day:
  Opening: ₹0 (reset)
```

---

## 4. Permission System (Categorized)

### Category: SALES
- record_sale
- edit_sale (today)
- edit_sale_past (manager+)
- delete_sale
- record_on_behalf
- view_all_sales
- view_own_sales
- price_override

### Category: PAYMENTS
- record_payment
- edit_payment (today)
- edit_payment_past (manager+)
- delete_payment
- view_all_payments
- approve_handover

### Category: INVENTORY
- view_inventory
- transfer_stock
- adjust_stock
- approve_returns
- view_raw_materials
- manage_raw_materials

### Category: CUSTOMERS & SHOPS
- create_customer
- edit_customer
- create_shop
- edit_shop
- view_all_shops
- view_assigned_only

### Category: ORDERS
- create_order
- edit_order
- fulfill_order
- cancel_order
- view_assigned_orders
- transfer_order

### Category: ROUTES
- view_routes
- create_route
- assign_route
- record_visit
- view_all_routes

### Category: REPORTS
- view_sales_report
- view_outstanding_report
- view_inventory_report
- view_collection_report
- view_financial_reports
- export_reports

### Category: ADMIN
- manage_users
- manage_roles
- manage_warehouse
- manage_settings
- view_audit_logs
- delete_records

---

## 5. BOM & Cost Calculation Review

### Current BOM Structure
```
Product: "Aqua Bottle 1L"
├── BOM Items:
│   ├── Raw Material: Plastic (100g) @ ₹50/kg = ₹5
│   ├── Raw Material: Cap (1 unit) @ ₹2/unit = ₹2
│   └── Raw Material: Label (1 unit) @ ₹1/unit = ₹1
│
├── Wastage: 5%
│
└── Total Material Cost: ₹(5+2+1) * 1.05 = ₹8.40
```

### Cost Components
```
Manufacturing Cost:
├── Material Cost (from BOM)     ← Moving Average
├── Labor Cost (worker wages)    ← Daily/Monthly
├── Overhead Cost (allocated)    ← Expenses / Production
└── Wastage Cost (actual)        ← Production log

Selling Price:
├── Base Price
├── GST
└── Margin Calculation
```

### Validation Points
1. ✅ Material cost uses moving average
2. ✅ BOM items linked to products
3. ⚠️ Overhead allocation needs review
4. ⚠️ Wastage calculation needs actual vs planned
5. ⚠️ Labor cost integration incomplete

---

## Database Schema Changes

### New Tables
```sql
-- staff_cash_accounts (Enhanced)
CREATE TABLE staff_cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  warehouse_id uuid REFERENCES warehouses(id),
  
  -- Cash holdings
  cash_amount numeric(12,2) DEFAULT 0,
  upi_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) GENERATED ALWAYS AS (cash_amount + upi_amount) STORED,
  
  -- Account type
  account_type text CHECK (account_type IN ('staff', 'manager', 'prime_manager')),
  
  -- For prime managers - daily reset tracking
  last_reset_at timestamptz,
  reset_amount numeric(12,2) DEFAULT 0, -- Amount carried to income
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- income_entries
CREATE TABLE income_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text CHECK (entry_type IN (
    'collection',          -- From sales/handovers
    'direct_payment',     -- Walk-in payments
    'other_income',       -- Manual entries
    'opening_balance'     -- Daily reset
  )),
  
  -- Source tracking
  source_type text CHECK (source_type IN (
    'sale', 'handover', 'direct', 'adjustment', 'opening'
  )),
  source_id uuid, -- Reference to sale/handover/etc
  
  -- Amount breakdown
  cash_amount numeric(12,2) DEFAULT 0,
  upi_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) GENERATED ALWAYS AS (cash_amount + upi_amount) STORED,
  
  -- Categorization
  category text, -- For other_income: rent, interest, etc.
  subcategory text,
  
  -- Recording info
  recorded_by uuid REFERENCES auth.users(id),
  warehouse_id uuid REFERENCES warehouses(id),
  notes text,
  
  -- Receipt image
  receipt_url text,
  
  created_at timestamptz DEFAULT now()
);

-- user_permissions (Enhanced categories)
CREATE TABLE user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  permission text, -- categorized as: SALES.record_sale, INVENTORY.transfer_stock, etc.
  enabled boolean DEFAULT true,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- Optional expiry
  UNIQUE(user_id, permission)
);
```

---

## Implementation Order

### Phase 1: Staff Directory (Day 1)
1. Create StaffCard component
2. Redesign StaffDirectory.tsx with cards
3. Add search/filter
4. Quick actions

### Phase 2: Staff Profile (Day 2)
1. Create StaffProfile.tsx page
2. Stats widgets
3. Stock holding section
4. Activity timeline
5. Edit functionality

### Phase 3: Income Page (Day 3-4)
1. Create Income.tsx
2. Daily collections view
3. Direct payment entry
4. Other income categories
5. Prime manager reset logic
6. Reports/summaries

### Phase 4: Permissions (Day 5)
1. Create categorized permission UI
2. Permission check utilities
3. Profile permission editor
4. Integration with existing auth

### Phase 5: Prime Manager Logic (Day 6)
1. Update handover flow
2. Daily reset trigger
3. Income entry creation
4. Cash flow tracking

---

## Mobile Sync
- All features must work on mobile-v2
- Staff cards responsive
- Income page simplified for mobile
- Quick actions for agents

---

## Testing Checklist
- [ ] Staff cards render correctly
- [ ] Click opens profile
- [ ] Permissions save correctly
- [ ] Income entries recorded
- [ ] Prime reset works
- [ ] Mobile responsive
- [ ] Offline queue handles income
