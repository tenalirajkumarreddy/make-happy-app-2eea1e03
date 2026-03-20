# Release Roadmap: BizManager App (Web & Mobile)

This roadmap outlines the critical steps required to prepare the BizManager application for a robust production release. It addresses feature completeness, technical debt, and performance optimization.

## Phase 1: Stability & Technical Health (Immediate)

**Goal:** Ensure the app is bug-free, type-safe, and performant before new features.

- [ ] **Code Splitting & Performance:**
  - *Problem:* `App.tsx` loads all 30+ pages at once (Main bundle > 3MB).
  - *Fix:* Implement `React.lazy()` and `Suspense` for all top-level routes.
  - *Impact:* Faster initial load time on mobile networks (3G/4G).

- [ ] **Linting & Type Safety:**
  - *Problem:* Over 500 lint errors, mostly `any` types.
  - *Fix:* Systematically replace `any` with proper interfaces (Shared types in `src/types/*.ts`).
  - *Impact:* prevent runtime crashes due to unexpected data shapes.

- [ ] **Error Handling:**
  - *Add:* Global Error Boundary (React) to catch crashes gracefully.
  - *Add:* Retry logic for failed API calls (React Query `retry` config).

## Phase 2: Core Feature Hardening (1-2 Weeks)

**Goal:** Verify critical business logic and data integrity.

- [ ] **Offline Queue Reliability:**
  - *Test:* `offlineQueue` logic for edge cases (app closed while offline, sync failures).
  - *Improve:* Visual indicator for "Unsynced Changes" in the UI header.

- [ ] **Authentication Flow:**
  - *Verify:* Token refresh logic for long-running sessions (Mobile app runs for days).
  - *Verify:* Role switching without needing full logout/login if possible, or force logout on role change.

- [ ] **Form Validations:**
  - *Review:* All numeric inputs (Price, Quantity) for negative/invalid values.
  - *Review:* Required fields in "Create Store" and "Create Product".

## Phase 3: Mobile Specific Optimizations (2-3 Weeks)

**Goal:** Polish the Android (Capacitor) experience.

- [ ] **Native Navigation:**
  - Ensure hardware "Back" button works correctly on Android (closes modals -> goes back -> exits app).
  - Status bar coloring matches theme.

- [ ] **Deep Linking:**
  - Allow opening the app from a shared Invoice link (e.g., `bizmanager://invoice/123`).

- [ ] **Camera & Scanner:**
  - Optimize barcode scanner speed.
  - permission handling overhaul (ask nicely, handle "Don't ask again").

## Phase 4: Customer Portal Beta (Future)

**Goal:** Enable self-service for shop owners.

- [ ] **Self-Registration:**
  - Secure verification flow (OTP + Business Proof upload).
  - Admin approval dashboard for new signups.

- [ ] **Ordering UI:**
  - Simple "Reorder" button for past items.
  - Whatsapp integration for order status updates.

## Phase 5: Analytics & Intelligence (Ongoing)

**Goal:** Provide actionable insights.

- [ ] **Smart Inventory:**
  - Alert when stock is low based on *velocity*, not just fixed threshold.
- [ ] **Route Optimization:**
  - Suggest efficient route ordering based on store locations (Mapbox/Google APIs).

