# Store Health Overview — CRM Design Spec

**Date**: 2024-07-07
**Status**: Draft — Pending User Review
**Author**: OpenCode (AI)
**Stakeholder**: BizManager Admin Team

---

## 1. Problem Statement

The current CRM Overview (`CrmOverview`) surfaces **marketer-level** performance (targets, sales, achievement) but provides no visibility into **store-level** health. Admins cannot answer atomic questions like:
- Which stores are at risk of churn?
- Which stores have overdue follow-ups?
- Where is the outstanding trending high relative to monthly volume?
- Are stores even ordering, or are they dormant?

This spec defines a new **Store Health Overview** tab within the existing CRM Overview page.

---

## 2. Goals

1. Give admins a single-screen health dashboard for every active store
2. Surface actionable signals (recency, burn rate, outstanding, follow-ups)
3. Enable quick triage (sort by health, filter by risk level, bulk actions)
4. Reuse existing data tables (`stores`, `store_targets`, `sales`, `follow_up_schedule`, `business_settings`)
5. Align with the Dynamic Burn Rate / Replenishment Engine already documented in `business_requirements.md`

---

## 3. Architecture

### 3.1 Page Structure

```
CRM Overview (/crm)
├── Overview (tab) — existing marketer performance summary
├── Performance (tab) — existing marketer detail table
├── Follow-ups (tab) — existing follow-up list
└── Stores (tab) ← NEW — Store Health Overview
```

### 3.2 Data Flow

```
Store Health Tab
   │
   ├── Query 1: stores(id, name, outstanding, is_active, created_by)
   ├── Query 2: store_targets(store_id, month, year, target_amount, status)
   ├── Query 3: sales(store_id, total_amount, created_at) [this month only]
   ├── Query 4: follow_up_schedule(store_id, status, scheduled_date, reason)
   └── Query 5: user_roles + profiles (marketer names)
   │
   └── Compute StoreHealth per store (client-side, see §4)
   └── Sort by healthScore ascending (most critical first)
   └── Render table
```

### 3.3 Permissions

- **super_admin / manager**: View ALL stores
- **marketer**: View only stores assigned to them
- Role-based filtering applied server-side where possible, client-side where needed

---

## 4. Store Health Algorithm

### 4.1 Core Philosophy

The algorithm is a **weighted multi-factor score (0-100)**. It combines the existing **Dynamic Burn Rate Engine** (already in `business_requirements.md`) with classic CRM recency + outstanding signals. This makes it work both **before** and **after** the daily replenishment worker is fully operational.

### 4.2 Input Signals

| Signal | Source | Why It Matters |
|--------|--------|----------------|
| Days Since Last Order | `sales.created_at` (max) | Recency is the #1 predictor of churn |
| Target Progress | `store_targets.target_amount` vs `SUM(sales.total_amount)` | Is the store on pace for the month? |
| Burn Rate / Replenishment | `get_store_depletion(store_id)` or client-side equivalent | When will stock run out? Is a follow-up due? |
| Outstanding Balance | `stores.outstanding` vs avg monthly sales | Are they a credit risk? |

### 4.3 Score Calculation

```typescript
function calculateStoreHealth(store: Store, monthData: MonthData): StoreHealth {
  const recencyScore = getRecencyScore(monthData.lastOrderDate);        // 0-100, weight 30%
  const targetScore  = getTargetScore(monthData.actual, monthData.target, dayOfMonth); // weight 30%
  const burnScore    = getBurnScore(monthData.runoutDate, monthData.followUpStatus);   // weight 20%
  const outstandingScore = getOutstandingScore(monthData.outstanding, monthData.avgMonthlySales); // weight 20%

  const healthScore = (recencyScore * 0.30) + (targetScore * 0.30) + (burnScore * 0.20) + (outstandingScore * 0.20);
  const healthColor = getHealthColor(healthScore);

  return { recencyScore, targetScore, burnScore, outstandingScore, healthScore, healthColor };
}
```

### 4.4 Component Scores

#### Recency Score (0-100)
```typescript
function recencyScore(lastOrderDate: Date | null): number {
  if (!lastOrderDate) return 0;
  const daysSince = differenceInDays(now, lastOrderDate);
  if (daysSince <= 7)  return 100;
  if (daysSince <= 14) return 90;
  if (daysSince <= 30) return 80;
  if (daysSince <= 45) return 65;
  if (daysSince <= 60) return 50;
  if (daysSince <= 90) return 20;
  return 0;
}
```

#### Target Progress Score (0-100)
```typescript
function targetProgressScore(actual: number, target: number, dayOfMonth: number): number {
  if (target === 0) return 50; // No target set, neutral
  const expectedAtThisPoint = (target / daysInMonth) * dayOfMonth;
  const ratio = expectedAtThisPoint > 0 ? (actual / expectedAtThisPoint) : 1;
  return Math.min(Math.round(ratio * 100), 100);
}
```

#### Burn Rate / Replenishment Score (0-100)
```typescript
function burnScore(runoutDate: Date | null, followUpStatus: string): number {
  if (followUpStatus === "must_order") return 10;
  if (followUpStatus === "run_out")   return 40;
  if (!runoutDate) return 70;
  const daysUntilRunout = differenceInDays(runoutDate, now);
  if (daysUntilRunout < 2)  return 30;
  if (daysUntilRunout < 7)  return 60;
  if (daysUntilRunout < 14) return 80;
  return 100;
}
```

#### Outstanding Score (0-100)
```typescript
function outstandingScore(outstanding: number, avgMonthlySales: number): number {
  if (outstanding <= 0) return 100; // No outstanding or credit
  if (avgMonthlySales <= 0) return 50; // Can't calculate ratio
  const ratio = outstanding / avgMonthlySales;
  if (ratio <= 0.25) return 90;
  if (ratio <= 0.50) return 80;
  if (ratio <= 1.00) return 60;
  if (ratio <= 2.00) return 40;
  return 10;
}
```

### 4.5 Health Color Mapping

| Score Range | Color     | Label            | Meaning                                          |
|-------------|-----------|------------------|--------------------------------------------------|
| 80-100      | 🟢 Green  | Healthy          | On pace, recent order, no follow-ups due       |
| 65-79       | 🟢 Light Green | On Track    | Slightly behind but no immediate risk            |
| 50-64       | 🟡 Yellow | Needs Attention  | Behind target or follow-up approaching            |
| 35-49       | 🟠 Orange | At Risk          | Runout reached, overdue, or substantial outstanding |
| 0-34        | 🔴 Red    | Critical         | Must order, 60+ days dormant, critical outstanding |

---

## 5. UI Design

### 5.1 "Stores" Tab Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 Search Store                    [Filter ▼] [📥 Export CSV] │
├─────────────────────────────────────────────────────────────────┤
│ Store           Marketer  Health  Target  Actual  %    Last     │
│                                       Score           Order    │
├──────────── ─── ─────── ────── ─────── ────── ── ──── ─────────┤
│ Fresh Mart    Rajesh   🟢 87    ₹10,000 ₹8,500 85%   2 days   │
│ Kirana B      Priya    🟠 42    ₹10,000 ₹3,000 30%  27 days  │
│ Old Store     —        🔴 12    ₹5,000  ₹0    0%   95 days  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Columns

| Column | Data | Sortable | Notes |
|--------|------|----------|-------|
| Store Name | `stores.name` | Yes | Link to Store Detail |
| Marketer | Assigned full name | Yes | If unassigned, show "—" |
| Health | Badge + score | Yes (default: ascending) | Shows color + number |
| Target | `store_targets.target_amount` | Yes | "No target" if missing |
| Actual | `SUM(sales.total_amount)` this month | Yes | ₹ formatted |
| Progress | Actual/Target % | Yes | Round to nearest % |
| Last Order | Max `sales.created_at` | Yes | "2 days ago" format |
| Outstanding | `stores.outstanding` | Yes | Negative = credit |
| Actions | — | No | View / Follow-up / Sale |

### 5.3 Row Expansion (Click to Expand)

```
┌──────────────────────────────────────────────────────────┐
│ 📍 Fresh Mart, Koramangala                               │
│ ─────────────────────────────────────────────────────────│
│ Recency:     100 (last order 2 days ago)                │
│ Target:      100 (₹8,500 / ₹10,000, 85%)                 │
│ Burn Rate:  80  (runout in 5 days)                      │
│ Outstanding: 100 (₹5,000, positive)                     │
│ ─────────────────────────────────────────────────────────│
│ [View Store] [Create Follow-up] [Record Sale]           │
└──────────────────────────────────────────────────────────┘
```

### 5.4 Filters

- **Health**: All | 🟢 Healthy | 🟡 Needs Attention | 🟠 At Risk | 🔴 Critical
- **Marketer**: Dropdown of assigned marketers
- **Store Type**: (if `store_types` is relevant)
- **Date Range**: Last 7 / 30 / 90 days

### 5.5 Admin-Level Actions

- **Export CSV**: Download full store health data
- **Bulk Select**: Checkbox per row, bulk actions (mark for follow-up)
- **Jump to Settings**: Navigate to `/crm/settings`

### 5.6 Mobile (< sm)

Cards replace table:

```
┌──────────────────────────────────────────┐
│ 🟢 Fresh Mart                      87  │
│ Target: ₹8,500 / ₹10,000 (85%)          │
│ Last Order: 2 days ago                   │
│ Outstanding: ₹5,000                     │
│ [View] [Follow-up] [Sale]               │
└──────────────────────────────────────────┘
```

---

## 6. Data Flow & API Design

### 6.1 React Query Hook

```typescript
// src/hooks/useStoreHealth.ts
export function useStoreHealth(month: number, year: number) {
  return useQuery({
    queryKey: ["crm-store-health", month, year],
    queryFn: async () => {
      // 1. Fetch stores
      // 2. Fetch targets for month
      // 3. Fetch sales for month (grouped by store)
      // 4. Fetch follow-ups
      // 5. Compute health per store
      // Return: StoreHealth[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### 6.2 Backend RPC (Optional)

If client-side computation is too heavy (>500 stores), create:

```sql
-- Function: compute_store_health(p_month, p_year)
-- Returns: table with all 5 scores per store
```

**Default**: Client-side computation (simpler, no new DB objects).

---

## 7. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| No target set for store | Show "No target" in Target column. Target score = 50 (neutral). |
| No sales this month | Actual = 0, Progress = 0% |
| Store just created (no history) | Show "New Store" badge. Health = "No Data" (gray). |
| Negative outstanding (credit) | Outstanding score = 100 |
| `get_store_depletion` returns null | Burn score = 70 (unknown) |
| Assigned marketer missing | Show "—" in Marketer column |

---

## 8. Testing Strategy

### 8.1 Unit Tests

- `calculateStoreHealth()` — all edge cases:
  - Perfect store (all scores 100)
  - Dormant store (no sales in 90+ days)
  - Store behind target
  - Store with high outstanding
  - New store with no history

### 8.2 Integration Tests

- Full data pipeline (query → compute → render)
- Filter by health color
- Sort by each column

### 8.3 UI Tests

- Table renders with correct data
- Row expansion works
- Export CSV produces correct output

---

## 9. Implementation Plan Summary

| Step | Work |
|------|------|
| 1 | Create `src/hooks/useStoreHealth.ts` (data fetching + computation) |
| 2 | Create `src/components/crm/StoreHealthTable.tsx` (table rendering) |
| 3 | Create `src/components/crm/StoreHealthRow.tsx` (row + expansion) |
| 4 | Update `src/pages/CrmOverview.tsx` to add "Stores" tab and render table |
| 5 | Wire filters (health color, marketer, date) |
| 6 | Add CSV export button |
| 7 | Write unit tests in `src/test/calculateStoreHealth.test.ts` |
| 8 | Write integration tests for the tab |

---

## 10. Open Questions / Future Enhancements

1. **Daily Worker Integration**: When the daily replenishment worker is active, pull `follow_up_status` directly from `follow_up_schedule` instead of computing from `get_store_depletion()`.
2. **Materialized View**: For >1000 stores, compute `StoreHealth` in a materialized view refreshed every 6 hours.
3. **Marketer Dashboard**: Show store health on the marketer's own dashboard (read-only).
4. **Alerts**: Email/push alert when a store transitions from Yellow → Red.

---

## Approval

- **Design approved by**: ___________________
- **Date**: ___________________
