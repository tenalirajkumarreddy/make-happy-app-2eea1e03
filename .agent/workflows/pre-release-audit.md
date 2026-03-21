---
description: Comprehensive production readiness audit procedure for web and mobile releases.
---

Follow this procedure before every production release to ensure UI/UX consistency, responsiveness, and functional robustness.

## 1. Automated Verification
Run these commands to ensure baseline code quality and build stability.

// turbo
`npm run lint`
`npx tsc --noEmit --skipLibCheck`
`npm test`
`npm run build`

## 2. QR Scanner Robustness Check
- [ ] Verify `formatsToSupport` is restricted to `[QR_CODE]` in `QrScanner.tsx` and `AgentScan.tsx`.
- [ ] Ensure `useBarCodeDetectorIfSupported: true` is enabled for native performance.
- [ ] Test scanning with:
    - [ ] Standard white-background QR
    - [ ] Colored/Patterned background QR
    - [ ] Low-light conditions
    - [ ] Different distances (viewfinder responsiveness)

## 3. Mobile UI/UX Audit (APK/Mobile Web)
- [ ] **Safe Areas**: Ensure `MobileHeader` doesn't overlap with system status bar or notch.
- [ ] **Touch Targets**: All buttons should have a minimum tap area of 44x44px (prefer 48px).
- [ ] **Accessibility**: All icon-only buttons MUST have `aria-label` attributes.
- [ ] **Navigation**: 
    - [ ] Verify `BottomNav` center action button is centered and clickable.
    - [ ] Check sidebar hamburger menu positioning on mobile web.
- [ ] **Forms**: Verify `AgentRecord` and other forms handle keyboard overlap and long content scrolling.
- [ ] **Native Overlap**: Ensure floating web elements (like Dashboard QuickActions) are hidden in `isNativeApp()` mode if they conflict with `BottomNav`.

## 4. Web Responsiveness Audit
- [ ] **Layout Grids**: Test Dashboard and Sales tables at 1920px, 1024px, and 768px.
- [ ] **Tables**: Ensure `DataTable` uses `renderMobileCard` or responsive column hiding on narrow screens.
- [ ] **Sidebar**: Verify collapse/expand states and search functionality.

## 5. Visual Consistency
- [ ] **Theme**: Toggle Dark/Light mode on every primary page.
- [ ] **Empty States**: Check list pages with no data for friendly empty state illustrations/text.
- [ ] **Loading States**: Verify skeletons appear during data fetching.

## 6. Deployment Readiness
- [ ] Review `PRODUCTION_READY.md` for credential rotation and environment variable checks.
- [ ] Verify `npm run build:apk:release` succeeds if releasing a native update.
