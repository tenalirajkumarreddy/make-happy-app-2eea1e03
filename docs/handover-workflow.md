# Handover Workflow Specification
## Money Flow: Sales → Collections → Handover → Income

---

## Overview

This document defines the complete handover workflow for tracking money flow in the Aqua Prime system.

### Money Flow Pipeline

```
Sale Created (₹120)
    ↓
Collection Recorded (₹100 cash)
    ↓
Agent's Holding Amount += ₹100
    ↓
Handover to Manager (₹100)
    ↓
Manager Confirms
    ↓
Agent's Holding = ₹0
    ↓
Income Entry Created (₹100, category: "handover")
    ↓
Warehouse Balance Updated
```

---

## Calculation Logic

### Per Agent (Daily/Real-time)

```javascript
// Agent's Holding Amount (what they need to hand over)
holdingAmount = (
    // All collections made by this agent
    salesCash + salesUpi +      // From sales with payment
    transactionsCash + transactionsUpi  // From standalone collections
) - (
    // Less: Already handed over and confirmed
    confirmedHandoversCash + confirmedHandoversUpi
)

// Today's handoverable (what can be handed over today)
todayHandoverable = max(0, todayCollections - todayConfirmedHandovers)

// Total pending handover (lifetime)
totalPendingHandoverable = max(0, allTimeCollections - allTimeConfirmedHandovers)
```

### Key Points

1. **Sales**: Recorded with cash/upi amounts (immediate collection)
2. **Transactions**: Standalone collections (e.g., previous outstanding payment)
3. **Handovers**: Transfer from agent → manager
4. **Confirmation**: Manager accepts, agent's holding resets
5. **Income**: Created automatically on confirmation

---

## Database Schema

### Tables Involved

| Table | Purpose |
|-------|---------|
| `sales` | Sales transactions with cash/upi amounts |
| `transactions` | Standalone payment collections |
| `handovers` | Handover records (pending/confirmed/rejected) |
| `income_entries` | Income tracking (created on handover confirm) |
| `staff_cash_accounts` | Staff cash holdings tracking |

### Handover Table Schema

```sql
handovers:
  - id: uuid
  - display_id: text (e.g., "HND-20250426-0001")
  - user_id: uuid (sender - agent/staff)
  - handed_to: uuid (receiver - manager/super_admin)
  - handover_date: date
  - cash_amount: numeric
  - upi_amount: numeric
  - total_amount: numeric (calculated: cash + upi)
  - status: enum ('awaiting_confirmation', 'confirmed', 'rejected', 'cancelled')
  - notes: text
  - created_at: timestamptz
  - updated_at: timestamptz
  - confirmed_at: timestamptz
  - confirmed_by: uuid
```

### Income Entry Schema (on confirmation)

```sql
income_entries:
  - id: uuid
  - entry_type: 'collection' | 'direct_payment' | 'handover' | 'opening_balance'
  - source_type: 'handover'
  - source_id: handover.id
  - cash_amount: numeric (from handover)
  - upi_amount: numeric (from handover)
  - total_amount: numeric
  - category: 'handover'
  - recorded_by: manager.id (who confirmed)
  - warehouse_id: warehouse.id
  - notes: "Handover from Agent X"
  - created_at: timestamptz
```

---

## Workflow Steps

### 1. Record Sale (Agent)

```javascript
// Agent creates sale
POST /record_sale
{
  store_id: "...",
  total_amount: 120,
  cash_amount: 100,  // ← Immediate collection
  upi_amount: 0,
  outstanding_amount: 20,  // Credit
  items: [...]
}

// Agent's holding increases by ₹100
```

### 2. Record Transaction (Agent)

```javascript
// Agent collects previous outstanding
POST /record_transaction
{
  store_id: "...",
  cash_amount: 50,
  upi_amount: 0,
  notes: "Previous balance collection"
}

// Agent's holding increases by ₹50
// Total holding: ₹150
```

### 3. Create Handover (Agent → Manager)

```javascript
// Agent initiates handover
POST /create_handover
{
  handed_to: manager_id,
  cash_amount: 150,  // Must match holding
  upi_amount: 0,
  notes: "Daily collection"
}

// Status: 'awaiting_confirmation'
// Agent's holding temporarily frozen
```

### 4. Manager Reviews

- Manager sees handover request
- Can view agent's sales + transactions for the day
- Verifies amount matches collections

### 5. Confirm Handover (Manager)

```javascript
// Manager confirms
POST /confirm_handover
{
  handover_id: "..."
}

// Actions:
// 1. Update handover.status = 'confirmed'
// 2. Create income_entry (category: 'handover')
// 3. Update warehouse balance
// 4. Reset agent's calculated holding
// 5. Update staff_cash_accounts
```

### 6. Income Tracking

- Income entry created with category "handover"
- Visible in Income page
- Included in daily/weekly reports
- Warehouse balance updated

---

## Edge Cases

### Partial Handover

**Not Allowed** - Must hand over full amount or wait.

```javascript
// Error if trying to handover less than holding:
if (handoverAmount < holdingAmount) {
  error: "Must hand over full amount: ₹{holdingAmount}"
}
```

### Multiple Handovers Per Day

- Only one pending handover per day per recipient
- Can create new handover if previous was rejected
- Can add to existing pending handover

### Rejected Handover

1. Manager rejects with reason
2. Agent's holding unfrozen
3. Agent can retry with correct amount
4. No income entry created

### Cancelled Handover

1. Agent cancels before confirmation
2. Holding unfrozen
3. No income entry created

---

## Calculation Examples

### Example 1: Simple Flow

```
9:00 AM: Sale ₹120 (₹100 cash, ₹20 credit)
  → Agent holding: ₹100

10:00 AM: Transaction ₹50 (previous balance)
  → Agent holding: ₹150

5:00 PM: Handover ₹150 to Manager
  → Status: awaiting_confirmation

5:30 PM: Manager confirms
  → Agent holding: ₹0
  → Income entry: ₹150 (handover)
```

### Example 2: Multiple Collections

```
9:00 AM: Sale ₹200 (₹150 cash, ₹50 UPI)
  → Holding: ₹200

11:00 AM: Sale ₹80 (₹80 cash)
  → Holding: ₹280

2:00 PM: Transaction ₹120 (UPI)
  → Holding: ₹400

6:00 PM: Handover ₹400
  → Holding after confirm: ₹0
```

### Example 3: Credit Sale Only

```
9:00 AM: Sale ₹100 (₹0 cash, ₹100 outstanding)
  → Holding: ₹0 (no immediate collection)

5:00 PM: Transaction ₹100 (collected later)
  → Holding: ₹100

6:00 PM: Handover ₹100
```

---

## Security & Validation

### Handover Validation

1. **Amount Check**: Handover ≤ Current Holding
2. **Duplicate Check**: No pending handover to same recipient
3. **Self-Transfer**: Cannot hand over to self
4. **Zero Amount**: Must be > 0

### Permission Checks

- **Create Handover**: Any staff role
- **Confirm/Reject**: Manager/Super Admin only
- **Modify**: Manager/Super Admin only
- **View Others**: Manager/Super Admin only

### Audit Trail

Every handover creates:
1. Handover record (with status history)
2. Activity log entry
3. Notification to recipient
4. Income entry (on confirmation)

---

## UI/UX Requirements

### Agent Dashboard

- Show current holding amount (real-time)
- "Create Handover" button (enabled if holding > 0)
- Today's collections breakdown (sales + transactions)
- Pending handover status
- Handover history

### Manager View

- Incoming handover requests
- Agent's collection summary before confirming
- Bulk confirm option
- Handover history by agent
- Income summary from handovers

### Handover Dialog

```
┌─────────────────────────────────────┐
│ Create Handover                      │
├─────────────────────────────────────┤
│ Current Holding: ₹400                │
│                                     │
│ Today's Collections:                │
│   Sales (2):      ₹280              │
│   Transactions:   ₹120              │
│ ─────────────────────────           │
│   Total:          ₹400              │
│                                     │
│ Handover Amount: [₹400     ]        │
│                                     │
│ Notes: [Daily collection            │
│        ___________________]        │
│                                     │
│ Hand to: [Select Manager ▼]         │
│                                     │
│ [Cancel]              [Submit]      │
└─────────────────────────────────────┘
```

---

## API Endpoints

### Create Handover
```
POST /rpc/create_handover
{
  p_handed_to: uuid,
  p_cash_amount: numeric,
  p_upi_amount: numeric,
  p_notes: text
}
```

### Confirm Handover
```
POST /rpc/confirm_handover
{
  p_handover_id: uuid
}
```

### Reject Handover
```
POST /rpc/reject_handover
{
  p_handover_id: uuid,
  p_reason: text
}
```

### Get Handoverable Amount
```
GET /rpc/get_handoverable_amount(p_user_id: uuid)
Returns: {
  cash_amount: numeric,
  upi_amount: numeric,
  total_amount: numeric,
  breakdown: {
    sales_cash: numeric,
    sales_upi: numeric,
    transactions_cash: numeric,
    transactions_upi: numeric,
    confirmed_handovers_cash: numeric,
    confirmed_handovers_upi: numeric
  }
}
```

---

## Implementation Notes

### Database Triggers

1. **On Handover Confirm**:
   - Create income_entry
   - Update warehouse balance
   - Log activity

2. **On Handover Reject**:
   - Log rejection reason
   - Notify agent

3. **On Handover Cancel**:
   - Log cancellation
   - Re-freeze amount

### Real-time Updates

- Use Supabase Realtime for handover status changes
- Update agent dashboard holding amount in real-time
- Notify manager of new handover requests

### Offline Support

- Queue handover creation when offline
- Sync when back online
- Validate amounts before creating

---

## Testing Checklist

- [ ] Agent can see accurate holding amount
- [ ] Sales add to holding
- [ ] Transactions add to holding
- [ ] Handovers subtract from holding
- [ ] Manager can view agent's collections before confirming
- [ ] Income entry created on confirmation
- [ ] Agent cannot hand over more than holding
- [ ] Cannot create duplicate pending handover
- [ ] Rejected handover returns amount to agent
- [ ] Cancelled handover returns amount to agent
- [ ] Audit trail complete

---

## Related Files

- `src/pages/Handovers.tsx` - Handover management UI
- `src/pages/AgentDashboard.tsx` - Agent dashboard with holding stats
- `supabase/migrations/*handovers*.sql` - Database functions
- `src/hooks/useOnlineStatus.ts` - Offline handover queue

---

**Version:** 1.0  
**Last Updated:** 2026-04-26  
**Status:** Implementation Ready
