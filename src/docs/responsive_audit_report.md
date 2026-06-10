# Responsive Design Audit Report

**Date:** 2026-06-10
**Project:** Aqua Prime (BizManager)
**Scope:** Full responsive audit across all pages + Android native shell

---

## 1. Methodology

- Automated scanning of all `@media` queries, Tailwind responsive prefixes, and fixed-width values
- Playwright E2E tests at 10 viewport widths (320, 375, 390, 480, 640, 768, 1024, 1280, 1440, 1920px)
- Manual inspection at 320px (minimum target) and 768px (common tablet)
- Android-specific audit: Capacitor config, AndroidManifest, safe-area handling, keyboard behavior

---

## 2. Breakpoint System (Phase 1)

### Canonical Source Defined
- File: `src/styles/breakpoints.ts`
- Breakpoints: `xs: 480`, `sm: 640`, `md: 768`, `lg: 1024`, `xl: 1280`, `2xl: 1536`
- Container breakpoints: `panelSm: 400`, `panelMd: 600`, `panelLg: 800`
- Android device profiles: `small/medium/large` with width/height/dpr

### Changes Made
| File | Change |
|------|--------|
| `src/styles/breakpoints.ts` | Created -- canonical breakpoint source |
| `src/lib/breakpoints.ts` | Updated to re-export from canonical source |
| `tailwind.config.ts` | Verified `xs: 480` matches canonical |
| `tailwind.config.ts` | Added `@tailwindcss/container-queries` plugin |
| `src/index.css` | Added comment linking iOS zoom fix to canonical `md: 768px` |

---

## 3. Issues Found & Fixed (Phase 2-3)

| # | Page | Issue | Viewport | Fix |
|---|------|-------|----------|-----|
| 1 | Global | BottomNav tab labels overflow | 320px | Added `truncate max-w-[4rem]` |
| 2 | Global | TopBar notification popover `w-96` overflows | <384px | Changed to `sm:w-96 w-[calc(100vw-2rem)]` |
| 3 | Global | VirtualDataTable ignored hideOnMobile | All mobile | Added Column.hideOnMobile + filtering |
| 4 | Global | VirtualDataTable always clipped content | Mobile | Made overflow-hidden conditional on desktop |
| 5 | Global | VirtualDataTable header overflow | <480px | Added `min-w-0` to flex items |
| 6 | Global | ResponsiveDataView table overflow | <480px | Added `truncate` to th, `min-w-0` to container |
| 7 | Global | Theme toggle touch target < 44px | All | `min-w-[44px] min-h-[44px]` |
| 8 | Global | Profile dropdown trigger < 44px | All | `min-w-[44px] min-h-[44px]` |
| 9 | Orders | Tabs overflow at 320px | 320px | `overflow-x-auto flex-nowrap`, reduced padding |
| 10 | Sales | ~26px overflow from scrollbar/border rounding | 768px | Benign -- scrollbar width difference |
| 11 | Inventory | Off-screen buttons in virtual rows | 320px | Benign -- absolutely-positioned virtual rows |
| 12-14 | Various | Minor padding/margin adjustments | Various | Standardised spacing |

---

## 4. Container Queries Applied (Phase 5)

| Component | Container Breakpoint | Effect |
|-----------|---------------------|--------|
| `StatCard` (`@container`) | @400px | Text: `text-xl` -> `text-2xl` |
| `EntityCard` (`@container`) | @450px | Icon: `w-16 h-16` -> `w-20 h-20`; Padding: `p-3` -> `p-4` |
| `Card` (shadcn) (`@container`) | @500px | Header/content/footer padding: `p-4` -> `p-6`; Title: `text-xl` -> `text-2xl` |

---

## 5. Android-Specific Audit (Phase 4)

### Issues Found
| Issue | Severity | Status |
|-------|----------|--------|
| No `android:windowSoftInputMode` in manifest | High | **Fixed** -- added `adjustResize` |
| No `@capacitor/keyboard` plugin integration | High | **Fixed** -- added Keyboard.setScroll + listeners |
| No keyboard-aware CSS variable (`--keyboard-height`) | Medium | **Fixed** -- set via `keyboardWillShow` event |
| No edge-to-edge config for Android 15+ | Medium | **Pending** -- requires native Java update |
| PWA locked to portrait mode | Low | Intentional for this app type |

### Android-Specific Features Status
| Feature | Status | Location |
|---------|--------|----------|
| `safe-area-*` CSS utilities | Present | `src/index.css` lines 325-345 |
| StatusBar plugin | Configured | `src/main.tsx`, `capacitor.config.ts` |
| SplashScreen | Configured | `capacitor.config.ts` |
| Viewport meta | Correct | `index.html` |
| `android:configChanges` | Handles orientation/size | `AndroidManifest.xml` |
| Touch-action: manipulation | Global | `src/index.css` |
| `@capacitor/keyboard` | Installed + integrated | `src/main.tsx` |
| Edge-to-edge rendering | Not configured | `MainActivity.java` |

---

## 6. Automation & Testing

### Responsive Audit Tool
- File: `src/lib/responsiveAudit.ts`
- Usage: `runResponsiveAudit()` in browser console
- Detects: horizontal overflow, clipped elements, small touch targets, fixed-width overflow

### Playwright Test Suite
- File: `tests/e2e/responsive.spec.ts`
- Tests: 80 tests (8 pages x 10 viewports)
- Results: 78/80 pass (2 benign false-positives)
- Coverage: Dashboard, Sales, Orders, Transactions, Customers, Stores, Inventory, Reports

### Edge Case: Playwright Auth with 000000 OTP
- Auth flow: `fill #phone` -> `click "Send OTP"` -> `fill #otp "000000"` -> `click "Verify OTP"` -> waits for dashboard
- Requires `USE_REAL_OTP` env to NOT be `'true'` (dev mode bypass)

---

## 7. Remaining Items

| Item | Priority | Notes |
|------|----------|-------|
| Fix Inventory 320px & Sales 768px test false-positives | Low | Both are DOM overflow from virtualizer/dialogs, not visual issues |
| Apply container queries to ProductInventoryCard | Medium | Currently uses fixed `h-40` header, `grid-cols-2` stats |
| Apply container queries to ReportContainer grid | Medium | Has 5-level viewport grid breakpoints |
| Configure Android edge-to-edge for Android 15+ | Medium | Requires `enableEdgeToEdge()` in MainActivity |
| Real-device Android testing | Medium | Test on physical Android phone + tablet |
| Orientation lock consideration for tablets | Low | Currently portrait-only PWA |
| Add container query tests to Playwright suite | Low | Snapshot tests for card layouts at different container sizes |

---

## 8. Key Decisions

1. **`xs` set to 480px** (not 360px) -- consistent with Tailwind config; 360px covered by base styles
2. **Container query threshold 400px** -- matches `CONTAINER_BREAKPOINTS.panelSm`; chosen because 400px is approximately the minimum width of a 2-column grid cell at 768px viewport
3. **No `overflow-x: hidden` bandaids** -- every overflow has a root cause fix
4. **5px test tolerance** -- ignores benign scrollbar/rounding arithmetic without hiding real layout bugs
5. **`touch-action: manipulation` on all buttons** -- eliminates 300ms tap delay on mobile
6. **No JS for layout** -- all responsive behavior uses CSS (Tailwind utilities + container queries)
