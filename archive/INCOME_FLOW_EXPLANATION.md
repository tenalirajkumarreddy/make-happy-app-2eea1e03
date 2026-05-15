# Income Flow Explanation

## Overview
This document explains how income flows through the system and is displayed on the Income page.

## The Three Income Categories

### 1. **Collections** (Tab: "Collections")
**What it shows:** All money collected from sales and handovers that the manager/Prime Manager has received.

**Sources:**
- **Cash/UPI Sales**: When staff records a sale with cash/UPI payment → Creates `income_entries` record with `source_type = 'sale'`
- **Confirmed Handovers**: When staff hands over cash to manager and manager confirms → Creates `income_entries` record with `source_type = 'handover'`

**How it works:**
```
Staff records sale (cash: ₹1000, UPI: ₹500)
    ↓
Trigger creates income entry
    ↓
Staff cash account: +₹1500
    ↓
Staff initiates handover to Manager
    ↓
Manager confirms handover
    ↓
Trigger creates income entry with source_type = 'handover'
    ↓
Manager cash account: +₹1500
```

**Key Point:** Sales create income entries immediately. Handovers create SEPARATE income entries when confirmed. This is intentional - sales show what was collected, handovers show what was transferred.

### 2. **Direct Payments** (Tab: "Direct")
**What it shows:** Money received directly by the Prime Manager/Manager (not from sales or handovers).

**Sources:**
- Walk-in customers paying cash
- UPI payments received directly
- Any non-sales cash receipts

**How it's recorded:** Manager manually records via "+ Direct Payment" button

### 3. **Other Income** (Tab: "Other")
**What it shows:** Non-operational income like rent, interest, refunds.

**Categories:**
- Rent Received
- Interest Income
- Refunds
- Money Lent (negative income)
- Miscellaneous

**How it's recorded:** Manager manually records via "+ Other Income" button

## Cash Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STAFF MEMBER                               │
│  ┌──────────────┐                                                   │
│  │ Records Sale │── Cash/UPI ──→ ┌──────────────────┐              │
│  │  ₹1000 cash  │                 │ staff_cash_acct  │              │
│  │   ₹500 UPI   │                 │  cash: +1000     │              │
│  └──────────────┘                 │  upi: +500       │              │
│                                   └──────────────────┘              │
│                                            │                        │
│                                            ▼                        │
│                                   Creates income_entry              │
│                                   (source_type: sale)              │
│                                            │                        │
│                                            ▼                        │
│                                   ┌──────────────────┐              │
│                                   │  Initiates       │              │
│                                   │  Handover to     │              │
│                                   │  Manager         │              │
│                                   └──────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          MANAGER/PRIME MANAGER                     │
│  ┌──────────────────┐                                               │
│  │ Confirms Handover│─── Confirms ───→ Triggers:                     │
│  │    (receives)   │                    1. Creates income_entry     │
│  └──────────────────┘                       (source_type: handover) │
│                                           2. Updates manager acct    │
│                                                                   │
│  ┌──────────────────┐                                              │
│  │ staff_cash_acct  │                                              │
│  │ (manager/prime)  │  cash: +1500                                   │
│  │                  │  upi: +500                                     │
│  └──────────────────┘                                              │
│                                                                   │
│  ┌──────────────────┐                                              │
│  │  Income Page     │  Shows:                                      │
│  │  Collections Tab │  • Handover entry (₹1500)                    │
│  └──────────────────┘                                              │
│                                                                   │
│  ┌──────────────────┐                                              │
│  │  Daily Reset     │  Creates:                                    │
│  │  (Prime Manager)  │  • opening_balance entry                     │
│  │                  │  • Resets account to 0                         │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Why This Design Prevents Double Counting

You were absolutely right to question this! Here's why it works:

### Scenario: Staff sells ₹1000, hands over to Manager

**WRONG WAY (would double count):**
1. Sale recorded → Income entry created (₹1000)
2. Handover confirmed → Income entry created (₹1000)
3. Total income: ₹2000 ❌ (WRONG!)

**CORRECT WAY (current implementation):**
1. Sale recorded → Income entry created (₹1000) → Goes to **staff's** account
2. Handover confirmed → Income entry created (₹1000) → Goes to **manager's** account
3. Each person sees their own holdings correctly
4. Manager's Income page shows the handover, not the original sale

### Key Insight:
- **Staff** sees their sales in their cash account
- **Manager** sees handovers in their income (collections)
- The same money appears in TWO different people's views, but NOT twice in the same view

## Database Triggers

### 1. `trigger_create_income_on_sale`
Fires when: New sale with cash/UPI is recorded
Creates: `income_entries` with `entry_type = 'collection'`, `source_type = 'sale'`

### 2. `trigger_create_income_on_handover`
Fires when: Handover status changes to 'confirmed'
Creates: `income_entries` with `entry_type = 'collection'`, `source_type = 'handover'`
Also: Updates receiver's `staff_cash_accounts`

### 3. `perform_daily_reset` (RPC)
Called when: Prime Manager clicks "Daily Reset"
Creates: `income_entries` with `entry_type = 'opening_balance'`
Updates: Resets Prime Manager's `staff_cash_accounts` to 0

## Stats Calculation on Income Page

```typescript
// Collections total
entries.filter(e => e.entry_type === 'collection')
       .reduce((sum, e) => sum + e.total_amount, 0)

// Direct Payments total  
entries.filter(e => e.entry_type === 'direct_payment')
       .reduce((sum, e) => sum + e.total_amount, 0)

// Other Income total
entries.filter(e => e.entry_type === 'other_income')
       .reduce((sum, e) => sum + e.total_amount, 0)

// Total Income
collections + direct_payments + other_income
```

## Prime Manager Account

The Prime Manager has a special account in `staff_cash_accounts` with:
- `account_type = 'prime_manager'`
- Holds all confirmed handover amounts
- Can be reset daily via "Daily Reset" button
- Reset creates an `opening_balance` income entry

## Summary

1. **Sales** → Create income entries immediately (source: sale)
2. **Handovers** → Create income entries when confirmed (source: handover)
3. **Direct Payments** → Manual entries by manager
4. **Other Income** → Manual entries for non-sales income
5. **Daily Reset** → Moves Prime Manager's holdings to opening balance

Each transaction appears exactly once per person's view, preventing double counting while maintaining accurate cash tracking across the organization.
