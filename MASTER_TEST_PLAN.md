# Master Test Plan: BizManager App

This document outlines the comprehensive testing strategy for the BizManager application. It covers role-based workflows, critical business logic, and mobile-specific scenarios.

## 1. Role-Based Capabilities Matrix

Verify that each role has access *only* to their permitted features.

| Feature Area | Super Admin | Manager | Agent | Marketer | POS | Customer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Auth** | Login (Email) | Login (Email) | Login (Email) | Login (Email) | Login (Email) | Login (OTP) |
| **Dashboard** | Full Access | Full Access | Route/Store Focus | Store Focus | Quick Sale | Orders Only |
| **Sales** | View/Edit All | View All | Create (Field) | Order Only | Create (Counter) | View History |
| **Inventory** | Manage All | View/Adjust | View (Van Stock) | View Only | View Only | View Catalog |
| **Customers** | Manage All | Manage | Edit Assigned | Create New | Search | Edit Self |
| **Routes** | Create/Assign | Manage | Execute | View | - | - |
| **Money** | Collect/Audit | Collect | Collect (Limit) | - | Collect | Pay Online |

### Test Scenarios by Role

#### 👮 Super Admin
- [ ] Can create new staff members and assign roles.
- [ ] Can see global analytics (Sales Forecast, Total Revenue).
- [ ] Can adjust inventory (Purchase, Correction) for any product.
- [ ] Can delete/archive stores or cutomers.

#### 👨‍💼 Manager (Office)
- [ ] Can approve pending orders from Marketers.
- [ ] Can reassign routes to different agents.
- [ ] Can view agent live locations (if tracked).
- [ ] Cannot delete system-wide settings or other admins.

#### 🚚 Agent (Field)
- [ ] **Critical:** Can log in on mobile app.
- [ ] **Critical:** Can see assigned "Today's Route".
- [ ] **Critical:** Can record a sale *Offline* and sync later.
- [ ] Cannot sell more than available "Van Stock" (if enabled).
- [ ] Can collect cash payment and print receipt (if printer connected).

#### 🗣️ Marketer (Field)
- [ ] Can onboard a new shop/store (Geolocation auto-fill).
- [ ] Can place a "Pre-order" for a store.
- [ ] Cannot collect cash (Security check).

#### 🛒 Customer (Portal)
- [ ] Can log in via Phone OTP.
- [ ] Can browse "Catalog" with customer-specific pricing.
- [ ] Can place a self-service order.
- [ ] Can view past invoices and payment status.

---

## 2. Critical Business Flows

These flows involve money or inventory and likely cause business loss if broken.

### 💰 The "Perfect Sale" Flow
1. **Initiation:** User selects Store -> "Record Sale".
2. **Product Selection:** Search item -> Add Qty -> Auto-price fetch (Tiered Pricing check).
3. **Cart Logic:** Total Calculation -> Discount Application -> Credit Limit Check.
4. **Checkout:** Select Payment Mode (Cash/UPI/Credit) -> Partial Payment logic.
5. **Confirmation:**
    - Inventory deducted immediately.
    - Customer outstanding balance updated (Database Trigger).
    - Transaction record created.
6. **Output:** Receipt generated/shared.

### 📦 Inventory Loop
1. **Purchase In:** Admin adds stock (Warehouse).
2. **Handover (Van Loading):** Admin transfers stock Warehouse -> Agent Van.
3. **Sale (Field):** Agent sells from Van -> Stock decreases.
4. **Return:** Customer returns item -> Stock increases (Damaged vs Resellable logic).
5. **Reconciliation:** End-of-day stock count matches system.

---

## 3. Mobile Web & App Specifics

Since the app runs as a Capacitor app on Android:

### 📶 Connectivity & Offline (Priority)
- [ ] **Intermittent Net:** Start sale online -> lose net -> finish sale. Verify it saves locally.
- [ ] **Cold Offline:** Open app with Airplane Mode. Dashboard should load cached data.
- [ ] **Sync:** Reconnect internet. Verify "Pending Sync" items upload automatically.

### 📱 Hardware Integration
- [ ] **Camera:** Scan QR code for Product lookup.
- [ ] **Camera:** Scan Store QR to open Store Profile.
- [ ] **Geolocation:** "Check-in" at store verifies lat/long proximity.
- [ ] **Share:** Share invoice PDF via WhatsApp intent.

---

## 4. Technical Health & Performance

- [ ] **Bundle Size:** Initial load on 3G should be under 3 seconds (Currently flagged as heavy).
- [ ] **Optimistic UI:** Like buttons, Cart adds should feel instant, not waiting for server.
- [ ] **Error Boundaries:** If one component crashes (e.g., Chart), the whole app shouldn't white-screen.
- [ ] **Form Validation:** Try entering negative numbers for price/qty.

