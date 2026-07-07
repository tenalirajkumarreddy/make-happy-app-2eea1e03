# Aqua Prime - Marketer CRM Dashboard & Replenishment Engine

## 1. Dynamic Burn Rate & Replenishment Engine

### 1.1 Core Formula
```
DAILY_BURN = max(
  REMAINING_TARGET / REMAINING_DAYS,
  MONTHLY_TARGET / 60  // 50% safety floor
)

RUNOUT_DATE = LAST_SALE_DATE + ceil(SALE_AMOUNT / DAILY_BURN)
FOLLOWUP_DATE = RUNOUT_DATE - ADMIN_LEAD_TIME (default: 2 days)
```

**Safety Floor Prevents**: Store front-loads sales, dynamic rate drops to 20/day, and then they genuinely slow down. Without the floor, we'd miss the stockout.

### 1.2 Replenishment State Machine

```
[IDLE] --(new sale recorded)--> [REMINDED]
  |                              |
  |                              | ( marketer marks done )
  |                              v
  |                           [COMPLETED]
  |                              |
  |                              | ( depletion date passes )
  |                              v
  |                           [RUN_OUT] (priority: HIGH, urgent tag)
  |                              |
  |                              | ( grace period passes, no new sale )
  |                              v
  |                           [MUST_ORDER] (priority: CRITICAL, repeats daily)
  |                              |
  |                              | ( new sale recorded )
  |                              v
  +--------------------------- [RESET]
                                   |
                                   v
                                [IDLE] (clears all active follow-ups, restarts)
```

**Reset Rules**:
- Every new sale recording triggers a `RESET` event for that store
- Previous follow-ups are marked `cancelled_by_new_sale`
- Fresh depletion starts from the new sale date with recalculated dynamic burn

### 1.3 Business Logic (Daily Worker)

**Frequency**: Every day at 6:00 AM local time (configurable per business)
**Trigger**: Supabase Edge Function `daily-replenishment-worker`

**Steps**:
1. For every active store with an approved monthly target:
   a. Find the most recent non-cancelled, non-draft sale recording
   b. Calculate `total_sales_this_month` (sum of all non-cancelled sales in current month)
   c. `remaining_target = monthly_target - total_sales_this_month`
   d. `remaining_days = days_in_month - current_day + 1`
   e. `dynamic_burn = remaining_target / remaining_days`
   f. `daily_burn = max(dynamic_burn, monthly_target / 60)`
   g. `days_until_runout = ceil(last_sale_amount / daily_burn)`
   h. `runout_date = last_sale_date + days_until_runout`
   i. `followup_date = runout_date - admin_lead_time`
   
2. **Follow-up Creation**:
   - If today >= followup_date AND today < runout_date → create `REMINDED` follow-up
   - If today >= runout_date AND today < runout_date + grace_period → create `RUN_OUT` follow-up
   - If today >= runout_date + grace_period → create `MUST_ORDER` follow-up (repeat daily until new sale or month end)

3. **Cancellation Handling**:
   - When a sale is cancelled, revert to the previous non-cancelled sale
   - If no previous sale exists, delete active follow-ups
   - Recalculate and create new follow-up if needed

4. **Snooze Handling**:
   - When a follow-up is snoozed, set `status = SNOOZED` with `snooze_until = date`
   - On the snooze date, re-check runout status
   - If runout already occurred on or before snooze date → `RUN_OUT` or `MUST_ORDER`
   - If runout is still in the future → `REMINDED`

5. **Month-end Reset**:
   - At the end of each month (last day), clear all `REMINDED` and `SNOOZED` follow-ups
   - Archive `RUN_OUT` and `MUST_ORDER` follow-ups to `follow_up_history`
   - Reset all stores to `IDLE` for the new month

### 1.4 Edge Cases & Safeguards

| Scenario | Handling |
|----------|----------|
| Store has met monthly target (remaining <= 0) | No follow-ups for remainder of month. On 1st of next month, reset and recalculate. |
| Sale recorded on last day of month with runout next month | Follow-up persists into next month. Use the new month's target for recalculation on the 1st. |
| New store added mid-month | Pro-rate target from current day to month end. Days remaining = days_in_month - current_day + 1. |
| Multiple sales on same day | Use the SUM of all same-day sales as the `last_sale_amount` for that date. |
| Sale amount is zero or negative | Skip that sale, use previous non-zero sale for calculation. Log a warning. |
| Admin changes lead time mid-month | Apply to NEW follow-ups only. Existing follow-ups keep their original dates to avoid confusion. |
| Marketer reschedules to a date past month-end | Clamp to the last day of the month. Show a note: "Will reset on 1st of next month." |

---

## 2. Data Model

### 2.1 `store_targets`
```sql
create table store_targets (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  month int not null, -- 1-12
  year int not null,
  target_amount int not null, -- monthly target in units
  created_by uuid references profiles(id),
  status text default 'active', -- active, completed, cancelled
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, month, year)
);
```

### 2.2 `marketer_targets`
```sql
create table marketer_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  month int not null,
  year int not null,
  target_type text not null default 'units', -- units, collection
  target_amount int not null,
  current_progress int default 0, -- units sold or amount collected
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, month, year)
);
```

### 2.3 `follow_ups vid` (renamed to `follow_up_schedule` for clarity)
```sql
create table follow_up_schedule (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  marketer_id uuid references profiles(id) on delete set null,
  reason text not null, -- low_stock, run_out, must_order, target_at_risk, overdue_payment
  priority text not null default 'medium', -- low, medium, high, critical
  status text default 'pending', -- pending, done, snoozed, auto_resolved, cancelled_by_sale, expired
  scheduled_date date not null,
  snooze_until date,
  depletion_date date, -- when the stock is projected to run out
  last_sale_date date, -- the sale this follow-up is based on
  last_sale_amount int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id)
);
```

### 2.4 `follow_up_actions`
```sql
create table follow_up_actions (
  id uuid default gen_random_uuid() primary key,
  follow_up_id uuid references follow_up_schedule(id) on delete cascade,
  action_type text not null, -- call, visit, whatsapp, mark_done, snooze, cancel
  note text,
  performed_at timestamptz default now(),
  performed_by uuid references profiles(id)
);
```

### 2.5 `target_change_requests`
```sql
create table target_change_requests (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  proposed_by uuid references profiles(id), -- the marketer
  current_target int not null,
  proposed_target int not null,
  reason text,
  status text default 'pending', -- pending, approved, rejected
  reviewed_by uuid references profiles(id), -- the admin/manager
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now()
);
```

### 2.6 RLS Policies
```sql
-- store_targets: Admin can do everything, marketer can view their stores
-- follow_up_schedule: Marketer can CRUD their assigned stores, admin can CRUD all
-- target_change_requests: Marketer can create/view their own, admin can update status
```

---

## 3. Marketer Dashboard UI (Redesigned)

### 3.1 Navigation
Replace the current simple dashboard with a tabbed interface:

```
[Today] [Follow-ups] [My Targets] [Stores] [Performance]
```

### 3.2 "Today" View
A consolidated summary card showing:

```
┌─────────────────────────────────────────┐
│  👋 Good morning, Rajesh!               │
│                                         │
│  📋 Today's Follow-ups:        5        │
│  🔴 Urgent (Run Out):          2        │
│  ⏰ Upcoming (This week):      8        │
│                                         │
│  🎯 Target Progress:           65%      │
│     1950 / 3000 units this month        │
│     [==========>          ]             │
│                                         │
│  📊 Quick Actions:                      │
│     [Record Sale] [View Stores] [Sync]  │
└─────────────────────────────────────────┘
```

#### Follow-up Cards (Detailed)

```
┌─────────────────────────────────────────┐
│  🔴 URGENT — Run Out Today              │
│     Grocery Plus, Koramangala           │
│     Target Pace: 100/day | Current: 58/day │
│     Last Sale: 500 units on July 4      │
│     Projected Runout: TODAY (July 9)   │
│                                        │
│     [📞 Call] [🏠 Visit] [✅ Mark Done]  │
│     [⏰ Reschedule] [💬 WhatsApp]      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ⏰ REMINDER — Order in 2 Days           │
│     Kirana Store, JP Nagar              │
│     Target Pace: 100/day | Current: 95/day│
│     Last Sale: 300 units on July 7      │
│     Projected Runout: July 11           │
│                                        │
│     [📞 Call] [🏠 Visit] [✅ Mark Done]  │
│     [⏰ Reschedule] [💬 WhatsApp]      │
└─────────────────────────────────────────┘
```

#### Action Buttons (Per Card):
- **Mark as Done**: Removes from list, logs to `follow_up_actions`
- **Reschedule**: Opens date picker, snoozes until selected date
- **Call**: Opens phone dialer, logs to `follow_up_actions`
- **Visit**: Logs a "visit" action, marks for field visit
- **WhatsApp**: Opens WhatsApp with store number (with pre-filled message)
- **Record Sale**: Navigates to sale recording with store pre-selected

### 3.3 "Follow-ups" Tab
- **Filter by**: Today, This Week, Overdue, Snoozed, Completed
- **Sort by**: Priority (Urgent first), Date, Store Name
- **Bulk Actions**: Select multiple to mark done or reschedule
- **Color Coding**:
  - 🔴 Red: `RUN_OUT` or `MUST_ORDER`
  - 🟡 Yellow: `REMINDED` with < 2 days remaining
  - 🟢 Green: `REMINDED` with > 2 days remaining
  - ⚪ Gray: `SNOOZED`

### 3.4 "My Targets" Tab
```
┌─────────────────────────────────────────┐
│  🎯 Monthly Target: 3000 units          │
│     Progress: 1950 / 3000 (65%)         │
│     [==========>          ]             │
│     Behind pace by 150 units           │
│                                        │
│  🏆 Store-by-Store Breakdown:           │
│  ┌─────────────────────────────────┐   │
│  │ Store A:  800 /  1000 (80%)     │   │
│  │ Store B:  600 /   800 (75%)     │   │
│  │ Store C:  550 /  1200 (46%) ⚠️  │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### Target Change Request Workflow:
1. Marketer selects store → Clicks "Request Target Change"
2. Fills form: Proposed Target, Reason (pre-filled with current vs. last month)
3. Admin receives notification in "Pending Approvals" section
4. Admin approves/rejects with a note
5. If approved: New target applies from next month
6. If rejected: Marketer can edit and resubmit (max 3 attempts)

### 3.5 "Stores" Tab
- List of assigned stores with quick stats:
  - Last order date
  - Current target progress
  - Next follow-up date
  - Days since last visit
- **Store Detail View**:
  - Map with location
  - Order history (last 5 orders)
  - Follow-up history
  - "Record Sale" button

### 3.6 "Performance" Tab (Optional for Phase 2)
- Monthly vs. monthly comparison
- Target achievement rate
- Follow-up completion rate
- Top performing stores

---

## 4. Admin Dashboard (For Manager/Super Admin)

### 4.1 Pending Approvals Center

```
┌─────────────────────────────────────────┐
│  ⏳ Pending Approvals (3)              │
│                                        │
│  ┌─────────────────────────────────┐   │
│  │ Target Increase Request          │   │
│  │ Rajesh → Grocery Plus           │   │
│  │ 1000 → 1500 units               │   │
│  │ Reason: "Seasonal demand up"    │   │
│  │ [✅ Approve] [❌ Reject]        │   │
│  └─────────────────────────────────┘   │
│                                        │
│  ┌─────────────────────────────────┐   │
│  │ New Store Assignment             │   │
│  │ Priya → New Kirana, HSR         │   │
│  │ Target: 500 units                │   │
│  │ [✅ Approve] [❌ Reject]        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 4.2 Global Settings
- **Follow-up Lead Time**: Default 2 days (can be adjusted per store/region)
- **Grace Period**: Default 2 days after runout for `MUST_ORDER`
- **Safety Floor**: Default 50% of base rate (configurable 20%-80%)
- **Working Days**: Which days to schedule follow-ups (default Mon-Sat)
- **Auto-archive**: Completed follow-ups archived after X days

---

## 5. API & Edge Functions

### 5.1 Edge Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `daily-replenishment-worker` | Calculates depletion & creates follow-ups | Scheduled daily at 6 AM |
| `process-sale-reset` | Handles sale recording → resets follow-ups | HTTP (called from app) |
| `process-sale-cancellation` | Handles sale cancellation → reverts to previous sale | HTTP (called from app) |
| `target-change-webhook` | Notifies admin of new target requests | Database trigger |

### 5.2 RPC Functions

```sql
-- Calculate depletion for a single store
get_store_depletion(store_id uuid, as_of_date date)
returns table (
  last_sale_date date,
  last_sale_amount int,
  remaining_target int,
  remaining_days int,
  daily_burn numeric,
  projected_runout date,
  follow_up_date date
);

-- Get marketer's current performance
get_marketer_performance(user_id uuid, month int, year int)
returns table (
  target_amount int,
  current_progress int,
  achievement_rate numeric,
  stores_count int,
  follow_ups_pending int,
  follow_ups_completed int
);

-- Approve/reject target change
process_target_change(request_id uuid, new_status text, reviewer_id uuid, note text)
returns void;
```

---

## 6. Implementation Phases

### Phase 1: Core Replenishment Engine (Week 1)
- [ ] Create `store_targets` and `follow_up_schedule` tables with RLS
- [ ] Implement `daily-replenishment-worker` edge function
- [ ] Add `get_store_depletion` RPC
- [ ] Create `process-sale-reset` and `process-sale-cancellation` handlers
- [ ] Basic unit tests for burn rate calculation

### Phase 2: Follow-up Management (Week 2)
- [ ] Build `FollowUpCard` component with all actions (Mark Done, Snooze, Call, Visit, WhatsApp)
- [ ] Create "Today" and "Follow-ups" tabs in Marketer Dashboard
- [ ] Implement snooze logic and grace period handling
- [ ] Add follow-up action logging (`follow_up_actions` table)
- [ ] Build admin view for managing follow-up settings

### Phase 3: Target & Performance (Week 3)
- [ ] Create `marketer_targets` table and related UI
- [ ] Build "My Targets" tab with progress bars
-- [ ] Implement target change request workflow (marketer request → admin approval)
- [ ] Add store-by-store breakdown and performance insights
- [ ] Build admin dashboard for target approvals

### Phase 4: Polish & Edge Cases (Week 4)
- [ ] Implement month-end reset logic
- [ ] Handle sale cancellations and history reverting
- [ ] Add pro-rated targets for mid-month new stores
- [ ] Improve UX with pace indicators and tooltips
- [ ] Comprehensive testing (unit + integration)

---

## 7. Frontend Components (React/TypeScript)

### 7.1 Key Components

```typescript
// components/marketer/FollowUpCard.tsx
interface FollowUpCardProps {
  id: string;
  storeName: string;
  reason: 'low_stock' | 'run_out' | 'must_order' | 'target_at_risk';
  priority: 'low' | 'medium' | 'high' | 'critical';
  scheduledDate: Date;
  depletionDate: Date;
  lastSaleAmount: number;
  lastSaleDate: Date;
  targetPace: number;
  currentPace: number;
  onMarkDone: () => void;
  onSnooze: (date: Date) => void;
  onCall: () => void;
  onVisit: () => void;
  onWhatsApp: () => void;
}

// components/marketer/TodaySummary.tsx
interface TodaySummaryProps {
  greeting: string;
  followUpsToday: number;
  urgentCount: number;
  upcomingCount: number;
  targetProgress: number;
  targetAmount: number;
  currentProgress: number;
}

// components/marketer/TargetProgress.tsx
interface TargetProgressProps {
  monthlyTarget: number;
  currentProgress: number;
  storeBreakdown: StoreTarget[];
}

// components/admin/TargetApprovalCard.tsx
interface TargetApprovalCardProps {
  requestId: string;
  marketerName: string;
  storeName: string;
  currentTarget: number;
  proposedTarget: number;
  reason: string;
  onApprove: (note?: string) => void;
  onReject: (note?: string) => void;
}
```

### 7.2 Hooks

```typescript
// hooks/useFollowUps.ts
// Fetches today's and upcoming follow-ups for the logged-in marketer

// hooks/useMarketerTarget.ts
// Fetches current month's target and progress

// hooks/useTargetChangeRequests.ts
// Manages target change request state (for admins)

// hooks/useSaleRecording.ts
// Handles sale recording with automatic follow-up reset
```

---

## 8. Testing Strategy

### 8.1 Unit Tests (Jest)
```typescript
describe('Burn Rate Calculation', () => {
  it('should calculate dynamic burn with remaining target', () => {
    // Target: 3000, Day 10, Sales: 1500
    // Expected: (3000-1500)/(30-10) = 75/day
  });

  it('should apply 50% safety floor', () => {
    // Target: 3000, Day 20, Sales: 2800
    // Dynamic: (3000-2800)/(30-20) = 20/day
    // Floor: 3000/60 = 50/day
    // Expected: 50/day
  });

  it('should handle zero remaining target', () => {
    // Target met: no follow-ups
  });

  it('should reset depletion on new sale', () => {
    // Previous: runout in 3 days
    // New sale: 500 units today
    // Expected: new runout date calculated from today
  });
});
```

### 8.2 Integration Tests (Playwright)
- Marketer records a sale → Follow-up schedule updates
- Marketer reschedules a follow-up → Appears on correct date
- Admin approves target change → Marketer sees updated target
- Month-end → All follow-ups reset

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Follow-up completion rate | > 80% |
| Time to restock (days between runout and new order) | < 1 day |
| Marketer response time to follow-ups | < 4 hours |
| Target achievement rate | > 90% |
| Admin approval turnaround | < 24 hours |

---

## 10. Appendix: Quick Reference

### Burn Rate Formula (Pseudocode)
```
function getDailyBurn(monthlyTarget, totalSalesThisMonth, currentDay, daysInMonth) {
  const remainingTarget = monthlyTarget - totalSalesThisMonth;
  const remainingDays = daysInMonth - currentDay + 1;
  const dynamicBurn = remainingTarget / remainingDays;
  const safetyFloor = monthlyTarget / 60; // 50%
  return Math.max(dynamicBurn, safetyFloor);
}

function getRunoutDate(lastSaleDate, saleAmount, dailyBurn) {
  const days = Math.ceil(saleAmount / dailyBurn);
  return addDays(lastSaleDate, days);
}

function getFollowUpDate(runoutDate, leadTime = 2) {
  return subDays(runoutDate, leadTime);
}
```

### State Transitions (Trigger → Result)
| Current State | Trigger | Next State | Action |
|--------------|---------|------------|--------|
| IDLE | New sale recorded | REMINDED | Calculate depletion, schedule follow-up |
| REMINDED | Mark as Done | COMPLETED | Log action, remove from active list |
| REMINDED | Reschedule | SNOOZED | Set snooze_until, hide until date |
| REMINDED | Runout date reached | RUN_OUT | Show urgent follow-up |
| SNOOZED | Snooze date reached, runout passed | RUN_OUT | Recalculate, show urgent |
| SNOOZED | Snooze date reached, runout not passed | REMINDED | Show with updated timeline |
| RUN_OUT | Grace period passed | MUST_ORDER | Repeat daily until new sale |
| MUST_ORDER | New sale recorded | RESET → IDLE | Clear all, restart calculation |
| ANY | Sale cancelled | REVERT | Use previous sale, recalculate |
| ANY | Month-end | RESET | Archive, clear, prepare for new month |
