# BizManager Features Analysis

**Analysis Date:** 2026-04-19

## Overview

BizManager is a multi-role sales/route/collections application with a React + Vite + TypeScript frontend and Supabase backend. It supports staff roles (super_admin, manager, agent, marketer, pos) and a customer portal, with both web and mobile APK interfaces.

---

## 1. Sales & Transactions

### Core Sales Features
- **Sales Recording** (`src/pages/Sales.tsx`, `src/mobile/pages/agent/AgentRecord.tsx`)
  - Multi-item sales with product selection, quantity, and pricing
  - Payment split between Cash and UPI
  - Outstanding balance calculation (total - cash - upi)
  - Credit limit validation with warnings at 80% and blocking at 100%
  - Price override capability (permission-based)
  - "Record on behalf of" functionality for managers
  - Proximity checks for agents (GPS-based store validation)
  - Offline queue support for sales recording
  - Backdated sale entry (up to 30 days past, 1 day future)

- **Payment Collection** (`src/pages/Transactions.tsx`, `src/mobile/pages/agent/AgentRecord.tsx`)
  - Transaction recording with cash/UPI split
  - Outstanding balance reduction on payment
  - Payment history with old/new balance snapshots
  - Notes/reference support

- **Sale Returns** (`src/pages/SaleReturns.tsx`, `src/components/sales/SaleReturnDialog.tsx`)
  - Process returns against existing sales
  - Partial and full return support
  - Stock restoration on return
  - Return reason tracking

### Sales-Specific Logic
- **Credit Limit System** (`src/lib/creditLimit.ts`)
  - Store-type based limits (KYC vs non-KYC)
  - Per-customer override capability
  - Real-time credit utilization display
  - Blocking at credit limit exceeded

- **POS Sales Constraints**
  - POS users locked to POS store (`POS_STORE_ID = "00000000-0000-0000-0000-000000000001"`)
  - Full payment required (no outstanding allowed)

---

## 2. Inventory Management

### Core Inventory Features (`src/pages/Inventory.tsx`)
- **Warehouse Stock Management**
  - Real-time stock level tracking
  - Low stock alerts
  - Stock value calculations
  - Multi-warehouse support

- **Staff Stock Holdings**
  - Track stock assigned to field staff (agents/marketers)
  - Staff-to-staff transfers
  - Negative stock detection

- **Stock Transfers** (`src/hooks/inventory/useStockTransfer.ts`)
  - Warehouse ↔ Staff transfers
  - Staff ↔ Staff transfers
  - Warehouse ↔ Warehouse transfers (super_admin only)
  - Return workflow (staff_to_warehouse with pending approval)

- **Stock Adjustments** (`src/hooks/inventory/useStockAdjustment.ts`)
  - Direct stock quantity adjustments
  - Reason tracking for adjustments
  - Raw material adjustments

- **Stock History** (`src/hooks/inventory/useStockHistory.ts`)
  - Complete movement audit trail
  - Pending returns review
  - Transfer tracking

### Inventory Components
- `src/components/inventory/WarehouseStockView.tsx`
- `src/components/inventory/StaffStockView.tsx`
- `src/components/inventory/StockTransferModal.tsx`
- `src/components/inventory/StockAdjustmentModal.tsx`
- `src/components/inventory/StockHistoryView.tsx`

---

## 3. Customer Management

### Core Customer Features (`src/pages/Customers.tsx`)
- **Customer CRUD**
  - Customer creation with name, phone, email, address
  - Photo upload support
  - CSV bulk import
  - Bulk activate/deactivate
  - Bulk edit mode

- **KYC Verification**
  - KYC status tracking: `not_requested`, `pending`, `verified`, `rejected`
  - Document upload (selfie, Aadhar front/back)
  - KYC review workflow for admins
  - KYC-based credit limit tiers

- **Customer-Store Relationship**
  - One customer can have multiple stores
  - Store creation linked to customer
  - Outstanding aggregation across all stores

- **Customer Portal** (`src/pages/CustomerPortal.tsx`, `src/mobile/pages/customer/`)
  - Customer self-service view
  - Own sales history
  - Own orders and transactions
  - Store selection

---

## 4. Store Management

### Core Store Features (`src/pages/Stores.tsx`, `src/pages/StoreDetail.tsx`)
- **Store CRUD**
  - Store creation with GPS coordinates
  - Address with geocoding
  - Photo upload
  - Opening balance setting
  - Store type assignment
  - Route assignment

- **Store Types** (`src/pages/StoreTypes.tsx`)
  - Categorize stores by type
  - Per-type product access matrix
  - Per-type pricing rules
  - Per-type credit limits (KYC vs non-KYC)
  - Auto-order configuration

- **Store Pricing**
  - Store-specific pricing overrides
  - Store-type pricing templates
  - Base price fallback

- **Store QR Codes**
  - QR code generation for stores
  - Quick store identification via scan

---

## 5. Route & Agent Workflows

### Route Management (`src/pages/Routes.tsx`, `src/pages/RouteDetail.tsx`)
- **Route CRUD**
  - Route creation with store type association
  - Store assignment to routes
  - Route ordering
  - Route activation/deactivation

- **Route Access Matrix** (`src/components/routes/RouteAccessMatrix.tsx`)
  - Per-agent route visibility control
  - Deny-by-default security model
  - Store-type access restrictions

### Agent Workflows
- **Route Sessions** (`src/hooks/useRouteSession.ts`)
  - Start/end route sessions with GPS
  - Session-based visit tracking
  - Auto-capture location on session start/end

- **Store Visits** (`src/pages/RouteDetail.tsx`)
  - Check-in at stores with GPS
  - Visit notes
  - Visit history per session

- **Mobile Agent App** (`src/mobile/pages/agent/`)
  - `AgentHome.tsx`: Dashboard with today's stats
  - `AgentRoutes.tsx`: Route navigation with store list
  - `AgentScan.tsx`: QR scanner for store lookup
  - `AgentRecord.tsx`: Combined sale/payment recording
  - `AgentHistory.tsx`: Personal transaction history
  - `AgentCustomers.tsx`: Store browser with search
  - `AgentStoreProfile.tsx`: Store detail with quick actions

---

## 6. POS Functionality

### POS Dashboard (`src/pages/PosDashboard.tsx`, `src/mobile/pages/pos/PosHome.tsx`)
- **POS-Specific Features**
  - Locked to single POS store
  - Quick sale recording
  - No outstanding allowed (full payment required)
  - Cash + UPI payment tracking
  - End-of-day handover workflow

- **POS Mobile Interface**
  - Simplified 3-tab interface: Home, Record, History
  - Quick product selection
  - Payment summary

---

## 7. Order Management

### Order Features (`src/pages/Orders.tsx`)
- **Order Types**
  - Simple orders: Note-based requirements
  - Detailed orders: Product + quantity specification

- **Order Lifecycle**
  - Pending → Delivered/Cancelled
  - Auto-delivery on sale recording
  - Cancellation with reason tracking
  - Order fulfillment dialog

- **Order Sources**
  - Manual (staff-created)
  - Auto-orders (based on rules)
  - Customer portal orders

---

## 8. Handovers & Cash Management

### Handover System (`src/pages/Handovers.tsx`)
- **Cash Handover Workflow**
  - Staff-to-staff cash transfers
  - Confirmation/rejection flow
  - Balance calculation: Sales + Received - Sent
  - Partial handover support (configurable)

- **Expense Claims**
  - Staff expense submission
  - Category-based expenses
  - Receipt photo upload
  - Admin review and approval
  - Approved amount can differ from claimed

- **Handover Snapshots**
  - Daily balance snapshots
  - Historical balance tracking

---

## 9. Reporting & Analytics

### Reports (`src/pages/Reports.tsx`)
**Report Categories:**

| Category | Reports |
|----------|---------|
| Overview | Smart Insights, Daily Reports, Day Book |
| Sales & Revenue | Sales Reports, Order Reports, Sales Returns, Collections, Outstanding, Risk Engine, Customer Analysis |
| Purchases | Purchase Reports, Purchase Returns, Vendor Analysis |
| Inventory | Product Reports, Stock Summary, Stock Timeline, Staff Performance, Price Changes |
| Financial | P&L Statement, Item-wise P&L, Cash Flow |
| Operations | Agent Performance |

### Analytics (`src/pages/Analytics.tsx`)
- Sales trend charts
- Payment method split (pie charts)
- Outstanding by store type
- Order status breakdown
- Agent leaderboard
- Customer growth tracking
- Store analytics by type
- Revenue vs collections
- KYC status distribution
- Outstanding distribution histogram
- Route-wise completion rates

---

## 10. Admin Functions

### Access Control (`src/pages/AccessControl.tsx`)
- **Permission System** (`src/hooks/usePermission.ts`)
  - Role-based default permissions (`ROLE_DEFAULTS`)
  - Per-user permission overrides
  - Permission keys: `create_customers`, `price_override`, `record_behalf`, `finalizer`, `see_handover_balance`, `submit_expenses`

### Staff Management (`src/pages/AdminStaffDirectory.tsx`)
- Staff invitation via email/phone
- Role assignment
- Warehouse assignment
- Activation/deactivation

### Settings (`src/pages/Settings.tsx`)
- Company settings
- Store type configuration
- Product category management
- Expense category setup
- Partial collections toggle
- Location validation toggle

---

## 11. Manufacturing/Production (ERP Features)

### Production Management
- **Bill of Materials** (`src/pages/BillOfMaterials.tsx`, `src/pages/BomDetail.tsx`)
  - BOM creation with raw materials
  - Cost calculations

- **Raw Materials** (`src/pages/RawMaterials.tsx`)
  - Raw material inventory
  - Vendor linkage
  - Stock level tracking

- **Production Log** (`src/pages/admin/ProductionLog.tsx`)
  - Production batch recording
  - Cost allocation
  - Output tracking

---

## 12. Mobile-Specific Features

### Mobile Architecture (`src/mobile/MobileApp.tsx`)
- Role-based mobile interfaces:
  - **AgentApp**: Routes, scan, record, history, customers
  - **MarketerApp**: Orders, record, stores (simplified)
  - **PosApp**: Quick sales, handovers, history
  - **CustomerApp**: Home, sales, orders, transactions, profile
  - **StaffApp**: Full admin interface (super_admin/manager)

### Mobile Features
- Bottom navigation with role-specific tabs
- Store picker sheet with search
- QR code scanning for store lookup
- Offline queue support
- GPS-based proximity validation
- Native back button handling
- Permission setup screen

---

## 13. Notifications & Activity

### Notification System (`src/lib/notifications.ts`)
- In-app notification center
- Push notification support
- Notification types: payment, handover, order, system
- Entity linking (notifications link to records)

### Activity Logging (`src/lib/activityLogger.ts`)
- Comprehensive audit trail
- User action tracking
- Entity change history
- Metadata capture

---

## 14. Data Synchronization

### Realtime Sync (`src/hooks/useRealtimeSync.ts`)
- Supabase Realtime subscriptions
- Role-optimized table subscriptions
- Query cache invalidation
- Automatic retry with exponential backoff

### Offline Support (`src/lib/offlineQueue.ts`, `src/hooks/useOnlineStatus.ts`)
- Offline queue for critical operations
- Automatic sync when back online
- IndexedDB-based queue storage
- Business key deduplication

---

*Features analysis: 2026-04-19*
