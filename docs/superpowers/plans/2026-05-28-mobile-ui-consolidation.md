# Mobile UI Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize 7 mobile pages to match AgentHistory's visual language (gradient headers, rounded-2xl white cards, consistent MiniStat, section labels, spacing).

**Architecture:** Pure CSS class changes — no logic, data, or structural changes. Each file is self-contained. The AgentHistory page at `src/mobile/pages/agent/AgentHistory.tsx` is the style reference.

**Tech Stack:** React + TypeScript + Tailwind CSS (shadcn/ui tokens via `bg-card`/`text-muted-foreground` etc.)

**Reference classes from AgentHistory:**
- Card: `rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700`
- Card (elevated): `rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700`
- MiniStat wrapper: `rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-3`
- MiniStat icon: `h-7 w-7 rounded-lg bg-gradient-to-br ... flex items-center justify-center`
- MiniStat label: `text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide`
- MiniStat value: `text-sm font-bold text-slate-800 dark:text-white`
- Section label: `text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest`
- Empty state: `rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30`
- Action button: `h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r ... active:scale-[0.98]`
- Toggle segments: `rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-1 flex`
- Segment option (active): `flex-1 rounded-xl px-3 py-3 text-sm font-bold bg-blue-600 text-white shadow-sm`
- Segment option (inactive): `flex-1 rounded-xl px-3 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50`

---

### Task 1: AgentHome.tsx — Full card standardization

**File:** `src/mobile/pages/agent/AgentHome.tsx`

- [ ] **Step 1: Convert Today's Revenue card classes**

Change line 369 from:
```tsx
<div className="rounded-xl bg-card shadow-sm border p-5">
```
to:
```tsx
<div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
```

- [ ] **Step 2: Convert "Today's Revenue" inner elements**

Line 371: Change section label from:
```tsx
<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Revenue</p>
```
to:
```tsx
<p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Today's Revenue</p>
```

Line 377: Change value from:
```tsx
<p className="text-3xl font-bold text-foreground tracking-tight">₹{totalSales.toLocaleString("en-IN")}</p>
```
to:
```tsx
<p className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">₹{totalSales.toLocaleString("en-IN")}</p>
```

Line 378-387: Change border and text classes:
```tsx
<div className="flex gap-4 mt-3 pt-3 border-t">
  <div className="flex items-center gap-1.5">
```
to:
```tsx
<div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
  <div className="flex items-center gap-1.5">
```

And inline cash/UPI text from `text-foreground` / `text-muted-foreground` to `text-slate-800 dark:text-white` / `text-slate-500 dark:text-slate-400`.

- [ ] **Step 3: Convert Stock Holdings card**

Line 392: Change from:
```tsx
<div className="rounded-xl bg-card shadow-sm border p-5">
```
to:
```tsx
<div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-4">
```

Update sub-stats grid items (line ~409): from `rounded-xl bg-muted/50 border p-3 text-center` to `rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 text-center` and text from `text-foreground` to `text-slate-800 dark:text-white`.

Update stock label on line ~398: use history-style section label `text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest`.

- [ ] **Step 4: Convert MiniStat grid area**

Line 444: Change wrapper classes — keep grid layout.
Replace the local `MiniStat` function (lines 615-626) to match history style.

Replace the entire MiniStat function with:
```tsx
function MiniStat({ label, value, color, icon: Icon }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-2">
      <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center", color)}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Convert Active Route card**

Line 454: Change from:
```tsx
<div className="rounded-xl bg-card shadow-sm border overflow-hidden">
```
to:
```tsx
<div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
```

Line 455 (header): Change text colors to match history pattern.

Line 463 (progress bar): Update `bg-muted rounded-full` to `bg-slate-100 dark:bg-slate-700 rounded-full`.

Line 475 (no active route empty state): Change to history-style dashed pattern:
```tsx
<div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
```

- [ ] **Step 6: Convert "Next Stop" card**

Line 488: Change from:
```tsx
<div className="rounded-xl bg-card shadow-sm border p-5">
```
to:
```tsx
<div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-4">
```

Update text colors inside: `text-foreground` → `text-slate-800 dark:text-white`, `text-muted-foreground` → `text-slate-500 dark:text-slate-400`.

- [ ] **Step 7: Convert Pending Orders cards**

Line 583: Change from:
```tsx
<div key={order.id} className="flex items-center gap-3 p-4 rounded-xl bg-card shadow-sm border">
```
to:
```tsx
<div key={order.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
```

Update text colors within to match.

- [ ] **Step 8: Convert SectionLabel component**

Line 605: Change from:
```tsx
return <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{children}</p>;
```
to:
```tsx
return <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">{children}</p>;
```

- [ ] **Step 9: Convert Quick Action buttons**

Lines 546-575: The Button components — wrap content in history-style cards or adjust the button styling to have gradient icon circles matching history pattern.

---

### Task 2: AdminHome.tsx — Minor alignment

**File:** `src/mobile/pages/admin/AdminHome.tsx`

- [ ] **Step 1: Fix MiniStat icon class**

Line 379: Change `rounded-xl` to `rounded-lg` to match history:
```tsx
<div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center", color)}>
```

- [ ] **Step 2: Standardize text color classes**

Throughout AdminHome, replace `text-slate-700 dark:text-slate-200` with `text-slate-800 dark:text-white` for consistency.

---

### Task 3: MarketerHome.tsx — Card background fix

**File:** `src/mobile/pages/marketer/MarketerHome.tsx`

- [ ] **Step 1: Fix MiniStat background**

Line 345: Change from:
```tsx
<div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
```
to:
```tsx
<div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-2">
```

- [ ] **Step 2: Fix MiniStat icon and text**

Line 348: Change icon wrapper to match history's style:
```tsx
<div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
  <Icon className="h-3.5 w-3.5 text-white" />
</div>
```

Line 352: Change value text:
```tsx
<p className="text-sm font-bold text-slate-800 dark:text-white mt-1">{value}</p>
```

- [ ] **Step 3: Standardize Quick Actions section**

Lines 156-222: Convert quick action button cards. Change button wrappers from `rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700` to `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm`.

---

### Task 4: PosHome.tsx — Keep purple theme, standardize cards

**File:** `src/mobile/pages/pos/PosHome.tsx`

- [ ] **Step 1: Verify card classes match history**

Already mostly consistent. Check line 123, 139, 151, 222, 251, 289 — ensure all use `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700`.

- [ ] **Step 2: Standardize section labels**

Replace `text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider` with history's `text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest`.

- [ ] **Step 3: Standardize text colors**

Replace `text-slate-700 dark:text-slate-200` → `text-slate-800 dark:text-white` within cards.

---

### Task 5: CustomerHome.tsx — Minor border alignment

**File:** `src/mobile/pages/customer/CustomerHome.tsx`

- [ ] **Step 1: Standardize Recent Sales card border**

Line 166: Change from:
```tsx
<div key={sale.id} className="rounded-xl border border-slate-100 dark:border-slate-700 p-3">
```
to:
```tsx
<div key={sale.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
```

- [ ] **Step 2: Standardize MiniStat icon class**

Line 190: Change `rounded-md` to `rounded-lg` to match history:
```tsx
<div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
```

---

### Task 6: AgentRoutes.tsx — Full card standardization (largest change)

**File:** `src/mobile/pages/agent/AgentRoutes.tsx`

- [ ] **Step 1: Convert segmented toggle (lines 591-618)**

Change the view toggle from inline styled buttons to match history's segmented control pattern. The current code uses a custom inline design. Change to:
```tsx
<div className="flex rounded-2xl bg-white/15 border border-white/20 p-0.5">
```
And make buttons use history's `rounded-xl px-3 py-2 text-xs font-semibold` with active state `bg-white text-blue-700` and inactive `text-white/80 hover:bg-white/20`.

- [ ] **Step 2: Convert RouteSessionPanel wrapper (line 625)**

```tsx
<div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
```

- [ ] **Step 3: Convert section labels**

Lines 630-632: Use history-style section labels.

- [ ] **Step 4: Convert empty states**

Lines 642-648 and 939-945: Convert to history's dashed pattern:
```tsx
<div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
```

- [ ] **Step 5: Convert route cards (line 676)**

Change from `rounded-xl bg-card border shadow-sm overflow-hidden` to `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden`.

- [ ] **Step 6: Convert store cards inside routes (line 755)**

Change from `rounded-xl bg-card border overflow-hidden` to `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 overflow-hidden`.

- [ ] **Step 7: Convert order cards (line 955)**

Change from `rounded-xl border bg-card shadow-sm overflow-hidden` to `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden`.

- [ ] **Step 8: Standardize status badge colors**

Replace the inline status colors on line 552-557 with history-style semantic badges (emerald for confirmed, amber for pending, red for cancelled).

- [ ] **Step 9: Standardize filter chips (line 880-894)**

Convert from current inline styles to match history's pattern.

---

### Task 7: MarketerStores.tsx — Replace shadcn Card with history style

**File:** `src/mobile/pages/marketer/MarketerStores.tsx`

- [ ] **Step 1: Remove shadcn Card imports**

From imports (lines 7-8): Remove `Card, CardContent` from the import.

- [ ] **Step 2: Convert store cards**

Line 219: Change from:
```tsx
<Card key={store.id} className="overflow-hidden">
  <div className="flex">
    <div className={cn("w-1 shrink-0 rounded-l-xl", colorClass)} />
    <CardContent className="p-3 flex-1 min-w-0">
```
to:
```tsx
<div key={store.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
  <div className="flex">
    <div className={cn("w-1 shrink-0", colorClass)} />
    <div className="p-3 flex-1 min-w-0">
```
And close with `</div></div>` instead of `</CardContent></Card>`.

- [ ] **Step 3: Standardize action buttons (lines 266-316)**

Remove Button components and use history-style action buttons with gradient icons.

- [ ] **Step 4: Standardize search input**

Change search input to use same border/radius pattern as history.

- [ ] **Step 5: Standardize empty state**

Line 189: Convert to history's dashed pattern.

- [ ] **Step 6: Standardize section labels and text colors**

Update all text to use `text-slate-800 dark:text-white` for headings, `text-slate-500 dark:text-slate-400` for secondary text.

---

### Task 8: Build verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No new lint errors.

- [ ] **Step 3: Final check**

Confirm all 7 modified files render correctly with the new classes by scanning for any remaining `bg-card`, `text-foreground`, `text-muted-foreground`, `rounded-xl` (on cards — grid and icon rounded-xl is fine) that should have been converted.
