# Mobile UI Consolidation — AgentHistory Design Standard

## Objective
Standardize all mobile home, routes, and stores pages to match the visual language established in `AgentHistory.tsx`.

## Source of Truth
AgentHistory uses:
- **Header**: `bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8`
- **Content offset**: `px-4 -mt-5 space-y-3`
- **Cards**: `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700` + `shadow-sm` or `shadow-xl`
- **MiniStat**: gradient icon `h-7 w-7 rounded-lg bg-gradient-to-br` + label `text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide` + value `text-sm font-bold text-slate-800 dark:text-white`
- **Section labels**: `text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest`
- **Action buttons**: `h-11 rounded-xl text-xs font-bold bg-gradient-to-r ... active:scale-[0.98]`
- **Toggle segments**: `rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-1`
- **Option segments**: `flex-1 rounded-xl px-3 py-3 text-sm font-bold` with active/inactive states
- **Empty states**: `rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30`
- **Status badges**: Colorful `text-[10px] font-semibold` with matching bg/border

## Pages to Redesign (7 total)

### 1. AgentHome.tsx
- Convert `rounded-xl bg-card` → `rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700`
- Replace local `MiniStat` with shared pattern matching AgentHistory's style
- Standardize section labels and "Next Stop" card
- Standardize quick action buttons with gradient icon boxes
- Convert empty state to dashed pattern

### 2. AdminHome.tsx
- Already ~90% consistent. Fix MiniStat icon class to `rounded-lg` (currently `rounded-xl`)
- Standardize section labels across all sub-sections

### 3. MarketerHome.tsx
- Fix MiniStat card bg from `bg-slate-50/60 dark:bg-slate-900/30` → `bg-white dark:bg-slate-800`
- Standardize border classes
- Standardize Quick Actions buttons with history-style gradient icon boxes

### 4. PosHome.tsx
- Keep purple gradient (brand distinction) but standardize card classes
- Standardize Quick Actions buttons layout
- Standardize empty state and activity cards

### 5. CustomerHome.tsx
- Mostly consistent. Minor border/padding alignment.
- Standardize Recent Sales cards to use same border style as history

### 6. AgentRoutes.tsx
- Largest file (1529 lines). Convert card classes throughout:
  - Route cards: `rounded-xl` → `rounded-2xl`, bg/border to match history
  - Store cards within expanded routes: same treatment
  - Order listing cards: same treatment
  - Empty states: dashed border pattern
  - Segmented "routes/orders" toggle: match history's segmented control style
- Standardize section labels
- Standardize status badges
- Standardize filter chips to match history's style

### 7. MarketerStores.tsx
- Replace shadcn `Card`/`CardContent` with history-style `div.rounded-2xl...`
- Standardize search/filter bar styling
- Standardize action buttons (Navigate/Call/Order/Txn)
- Standardize empty state
- Update FAB to match platform style

## Non-Goals
- Web pages (Dashboard.tsx, web Routes.tsx, web Stores.tsx)
- Actual data/logic changes (visual only)
- Component extraction (inline is fine)

## Approach
1. Process each file sequentially
2. Focus on CSS class changes only — no logic/query changes
3. Extract shared MiniStat as local copy per page (they have slightly different props)
