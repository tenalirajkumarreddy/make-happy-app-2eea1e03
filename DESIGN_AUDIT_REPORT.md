# Design System Audit Report

## Phase 1: Extraction Findings

### 1A — Colors

| Color Value | Where Used | Frequency | Flag |
|-------------|-----------|-----------|------|
| #3b82f6 | Charts, inline styles | 34 | Chart color — use semantic mapping |
| #ef4444 | Charts, inline styles | 19 | Chart color — use semantic mapping |
| #8377 | Typo? | 17 | Likely "#834" partial match — false positive |
| #10b981 | Charts, inline styles | 16 | Chart color — use semantic mapping |
| #64748b | Inline styles, HTML templates | 16 | Replace with tokens |
| #6366f1 | Inline styles | 13 | Replace with tokens |
| #6b7280 | Inline styles | 13 | Replace with tokens |
| #ffffff | Templates | 13 | Use `white` or `bg-white` |
| #e5e7eb | Inline styles | 13 | Replace with token |
| #94a3b8 | Inline styles, templates | 12 | Replace with token |
| #f59e0b | Charts, inline styles | 11 | Chart color — use semantic mapping |
| #1e293b | HTML templates, charts | 11 | Template — keep for now |
| #1A2B4A | Print templates | 9 | Print-specific — acceptable |
| #666 | Inline styles | 8 | Replace with token |
| #D0D5DD | Print templates | 8 | Print-specific — acceptable |
| #1a1a1a | Templates | 8 | Template — keep for now |
| #2a2a4e | Graph HTML | 7 | Graph-specific — acceptable |
| #000 | Templates | 7 | Template — keep for now |
| #1f2937 | Print templates | 6 | Print-specific — acceptable |
| #22c55e | Inline styles | 6 | Replace with token |
| #fff | Inline styles | 6 | Use `white` |
| #ddd | Templates | 6 | Template — keep for now |
| #1e40af | Inline styles | 5 | Replace with token |
| #8884d8 | Charts | 5 | Chart-specific — acceptable |
| #60a5fa | Templates | 5 | Template — keep for now |
| #0f172a | HTML templates | 5 | Template — keep for now |
| #7c3aed | Inline styles | 5 | Replace with token |
| #334155 | HTML templates | 5 | Template — keep for now |
| #1a1d24 | Mobile skeleton | 5 | Should use `dark:` token |
| #065f46 | Inline styles | 4 | Replace with token |
| #fef3c7 | Inline styles | 4 | Replace with token |
| #7f1d1d | Inline styles | 4 | Replace with token |
| #F5A623 | Print templates | 3 | Print-specific — acceptable |
| #f5f5f5 | Templates | 3 | Template — keep for now |
| #dbeafe | Inline styles | 3 | Replace with token |
| #F5F7FA | Print templates | 3 | Print-specific — acceptable |
| #ca8a04 | Inline styles | 3 | Replace with token |
| #aaa | Templates | 3 | Template — keep for now |
| #f8fafc | Inline styles | 3 | Replace with token |
| #f3f4f6 | Inline styles | 3 | Replace with token |
| #888 | Inline styles | 3 | Replace with token |
| #333 | Templates | 3 | Template — keep for now |
| #0f1115 | Mobile skeleton | 2 | Should use `dark:` token |
| #2563eb | Inline styles | 2 | Replace with token |
| #FEE2E2 | Inline styles | 2 | Replace with token |
| #F9FAFB | Print templates | 2 | Print-specific — acceptable |
| #f1f5f9 | Inline styles | 2 | Replace with token |
| #4E79A7 | Graph HTML | 2 | Graph-specific — acceptable |
| #dc2626 | Inline styles | 2 | Replace with token |
| #555 | Templates | 2 | Template — keep for now |
| #D1FAE5 | Inline styles | 2 | Replace with token |
| #ccc | Templates | 2 | Template — keep for now |
| #c00 | Templates | 2 | Template — keep for now |
| #0f0f1a | Graph HTML | 2 | Graph-specific — acceptable |
| #1a1a2e | Templates | 2 | Template — keep for now |
| #a78bfa | Templates | 2 | Template — keep for now |
| #8b5cf6 | Charts | 2 | Chart-specific — acceptable |
| #475569 | Templates | 2 | Template — keep for now |

**Categorization of hardcoded colors:**
- **Chart/Graph colors** (acceptable): Files like CostInsights, CustomerReport, ItemWisePLReport, ProfitLossReport, PurchaseReport, etc. These use hardcoded hex for chart palettes — this is standard practice for charts.
- **Print/Template HTML strings** (acceptable): printUtils.ts, ProformaView, InvoiceView, SaleReceipt, TransactionReceipt — these generate raw HTML for printing and need hardcoded colors for PDF generation.
- **Inline styles in React components** (NEEDS FIX): MobileListSkeleton, AdminHandovers, AdminHome, AgentHistory, ExpenseReviewDialog, Handovers, MapPage, PaymentOutstandingReport, CustomerRiskReport, CustomerStatement, DayBookReport, etc.
- **Graph HTML files** (acceptable): graph.html, FLOW_CHARTS.html — these are standalone visualization files.

### 1B — Typography

| Size | Weight | Line-height | Family | Used In | Flag |
|------|--------|-------------|--------|---------|------|
| text-xs (12px) | Various | Default | Inter | 1627 uses | OK |
| text-sm (14px) | Various | Default | Inter | 1403 uses | OK |
| text-base (16px) | Various | Default | Inter | 128 uses | OK |
| text-lg (18px) | Various | Default | Inter | 142 uses | OK |
| text-xl (20px) | Various | Default | Inter | 60 uses | OK |
| text-2xl (24px) | Various | Default | Inter | 122 uses | OK |
| text-3xl (30px) | Various | Default | Inter | 21 uses | OK |
| **text-[10px]** | Various | Default | Inter | **145 uses** | OFF SCALE |
| **text-[11px]** | Various | Default | Inter | **37 uses** | OFF SCALE |
| **text-[9px]** | Various | Default | Inter | **15 uses** | OFF SCALE |
| **text-[15px]** | Various | Default | Inter | **2 uses** | OFF SCALE |

**Font weights found:**
- font-normal (400): 25
- font-medium (500): 785
- font-semibold (600): 857  
- font-bold (700): 637
- font-extrabold (800): 2

**Issue:** `text-[10px]`, `text-[11px]`, `text-[9px]`, `text-[15px]` are off the standard scale. Should be consolidated.

### 1C — Spacing

| Value | Used In | Count | Flag |
|-------|---------|-------|------|
| p-3 (12px) | Many | 414 | OK |
| p-4 (16px) | Many | 232 | OK |
| p-2 (8px) | Many | 95 | OK |
| p-6 (24px) | Many | 63 | OK |
| gap-2 (8px) | Many | 744 | OK |
| gap-1 (4px) | Many | 368 | OK |
| gap-3 (12px) | Many | 264 | OK |
| gap-4 (16px) | Many | 205 | OK |
| space-y-2 (8px) | Many | 334 | OK |
| space-y-4 (16px) | Many | 231 | OK |

Spacing is mostly clean. Hardcoded padding in print templates is acceptable.

### 1D — Border Radius

| Value | Component | Count |
|-------|-----------|-------|
| rounded-xl | Many | 470 |
| rounded-lg | Many | 373 |
| rounded-full | Many | 237 |
| rounded-md | Many | 99 |
| rounded-sm | Many | 23 |

Border radius is consistent and uses tokens.

### 1E — Shadows

| Value | Component | Count |
|-------|-----------|-------|
| shadow-sm | Many | 272 |
| shadow-lg | Many | 34 |
| shadow-md | Many | 28 |
| shadow-none | Many | 6 |
| shadow-xl | Many | 6 |

Shadows use Tailwind classes consistently. CSS variables also defined.

### 1F — Component Inventory

| Component | Count | Shared/Duplicate | States |
|-----------|-------|-------------------|--------|
| Button | 1030 | Shared (shadcn) | default, hover, focus, active, disabled, loading (via loading prop) |
| Card | 291 | Shared (shadcn) | default, hover |
| Badge | 276 | Shared (shadcn) | default, secondary, destructive, outline |
| Input | 416 | Shared (shadcn) | default, focus, disabled |
| Select | 213 | Shared (shadcn) | default, focus, disabled |
| Dialog | 137 | Shared (shadcn) | default |
| Table | 127 | Shared (shadcn) | default |
| Toast | 1+ | Shared (shadcn) | default |
| Avatar | 23 | Shared (shadcn) | default |
| Checkbox | 24 | Shared (shadcn) | default, checked, disabled |
| Tabs | 29 | Shared (shadcn) | default, active |

Components are well-consolidated via shadcn/ui. No duplicate component implementations found.

---

## Key Issues Summary

1. **Typography off-scale**: `text-[9px]` (15), `text-[10px]` (145), `text-[11px]` (37), `text-[15px]` (2)
2. **Hardcoded inline colors**: Inline styles in React component files using hex values instead of Tailwind classes or CSS variables (e.g., `style={{ backgroundColor: cat.color || "#6b7280" }}`)
3. **Dark mode inline colors**: `MobileListSkeleton.tsx` uses `dark:bg-[#1a1d24]` and `dark:bg-[#0f1115]` instead of proper dark mode tokens
4. **Chart/Print colors**: Mostly acceptable, but should use `CSS_VARIABLES` where possible

## Proposed Fixes

### Fix 1: Typography Scale
- `text-[10px]` → `text-xs` (12px) — or keep as custom if intentionally smaller
- `text-[11px]` → `text-xs` (12px)
- `text-[9px]` → `text-xs` (12px)
- `text-[15px]` → `text-sm` (14px)

### Fix 2: Inline Color Styles
Replace hardcoded fallback colors in inline styles with Tailwind classes or theme variables where possible.

### Fix 3: Dark Mode Backgrounds
Replace `dark:bg-[#1a1d24]` and `dark:bg-[#0f1115]` with proper dark mode utility classes.
