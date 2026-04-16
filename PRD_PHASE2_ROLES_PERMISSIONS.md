# PRD Phase 2: User Roles & Permissions Matrix

## Role Hierarchy

| Role | Access Level | Primary Function | Authentication Method |
|------|--------------|------------------|------------------------|
| `super_admin` | Full system access | System configuration, user management, audit | Supabase email/password |
| `manager` | Extended access | Team oversight, proxy recording, reports | Supabase email/password |
| `agent` | Field operations | Sales, route visits, store visits | Supabase email/password |
| `marketer` | Customer acquisition | Order creation, customer management | Supabase email/password |
| `pos` | Point of sale | Walk-in sales | Supabase email/password |
| `customer` | Self-service | Order creation, KYC upload, view history | Firebase OTP → Supabase token exchange |

> **Note**: Role strings are defined in `AuthContext.tsx` as a union type `AppRole` and must remain consistent across codebase.

## Role-Specific Permissions Matrix

### Super Admin (Full Access)

**Data Access & Actions**:
- ✅ View all sales, transactions, orders, handovers
- ✅ Create, edit, delete customers, stores, products
- ✅ Assign routes to stores and agents
- ✅ Add opening balance to stores
- ✅ Manually edit store outstanding balance (logged as "Balance correction")
- ✅ Transfer stores between customers
- ✅ Enable/disable any user account
- ✅ Enable/disable any customer (cascades to disable all their stores)
- ✅ Enable/disable any store
- ✅ View all audit logs
- ✅ Access all features in dashboard, reports, analytics, map

**System Control**:
- ✅ Manage user roles and permissions
- ✅ Configure store types, pricing, order types
- ✅ Configure credit limits per store type and KYC status
- ✅ Configure POS customer/store settings
- ✅ Configure promotional banners
- ✅ Configure push notification settings
- ✅ Configure environment-specific settings via `.env.production`

### Manager

**Data Access & Actions**:
- ✅ View all sales, transactions, orders, handovers
- ✅ Create, edit, delete customers, stores, products
- ✅ Assign routes to stores
- ✅ Add opening balance to stores (if permitted by admin)
- ✅ Manually edit store outstanding balance (if permitted by admin)
- ✅ Record sales and transactions on behalf of agents, marketers, POS users
- ✅ Confirm handovers from agents, marketers, POS users
- ✅ Enable/disable customers and stores (cascades)
- ✅ Access all reports and analytics
- ✅ View map with real-time user locations

**System Control**:
- ✅ Configure permissions for behalf-of recording (enable/disable per manager)
- ✅ Configure store types and pricing (read-only unless given permission)
- ✅ Configure credit limits (read-only unless given permission)

### Agent

**Data Access & Actions**:
- ✅ View own sales, transactions, orders, handovers
- ✅ Create customers and stores
- ✅ Record sales and transactions (cannot edit/delete)
- ✅ View assigned routes and stores
- ✅ Mark stores as visited (with proximity validation)
- ✅ Cancel orders (with reason)
- ✅ Download route data for offline use
- ✅ Real-time location tracking during route sessions
- ✅ View own performance stats (sales, cash, UPI)

**System Control**:
- ❌ Cannot create or edit products
- ❌ Cannot manage routes or store types
- ❌ Cannot enable/disable customers or stores
- ❌ Cannot edit store balance or credit limits
- ❌ Cannot record sales on behalf of others

### Marketer

**Data Access & Actions**:
- ✅ View own sales, transactions, orders, handovers
- ✅ Create customers and stores
- ✅ Create, modify, delete orders for accessible customers
- ✅ Record transactions (cannot edit/delete)
- ✅ View assigned store types and routes
- ✅ View own performance stats (orders, transactions)

**System Control**:
- ❌ Cannot record sales
- ❌ Cannot manage routes or store types
- ❌ Cannot enable/disable customers or stores
- ❌ Cannot edit store balance or credit limits
- ❌ Cannot record transactions on behalf of others

### POS (Point of Sale)

**Data Access & Actions**:
- ✅ Record sales for global "POS" customer (walk-in)
- ✅ Manually enter prices (no auto-population)
- ✅ View own sales history
- ✅ Mark handovers as completed
- ✅ View own performance stats (sales, cash, UPI)

**System Control**:
- ❌ Cannot create customers or stores
- ❌ Cannot record transactions
- ❌ Cannot view orders or routes
- ❌ Cannot edit prices or products
- ❌ Cannot record sales on behalf of others
- ❌ Cannot access any other customer or store

### Customer

**Data Access & Actions**:
- ✅ View own stores and outstanding balance
- ✅ View own sales history
- ✅ Create, modify, delete own orders
- ✅ Upload KYC documents (Aadhar + selfie)
- ✅ Receive push notifications for order updates and store visits
- ✅ Report cancelled orders

**System Control**:
- ❌ Cannot create or edit products
- ❌ Cannot create or edit stores
- ❌ Cannot record sales or transactions
- ❌ Cannot access other customers' data
- ❌ Cannot view routes or agent locations

## Authentication Flow

### Staff (super_admin, manager, agent, marketer, pos)
- **Authentication**: Supabase email/password
- **Role Assignment**: Admin invites via `invite-staff` edge function
- **Storage**: Credentials stored in Supabase Auth
- **Access Control**: Role assigned via `user_roles` table

### Customers
- **Authentication**: Firebase Phone OTP
- **Token Exchange**: `firebase-phone-exchange` edge function converts Firebase token to Supabase JWT
- **Storage**: Supabase Auth session
- **Role Assignment**: `customer` role assigned automatically via `customer_self_register_rls.sql`
- **Self-Registration**: Enabled via RLS policy on `customers` table

## Access Control Implementation

### Role Assignment
- **Source of Truth**: `user_roles` table in Supabase
- **Default Role**: `customer` (fallback if no role assigned)
- **Assignment**: Via `invite-staff` edge function (staff) or automatic on self-registration (customers)

### Permission Checks
- **UI Level**: `usePermission(...)` hook used to check capabilities (e.g., `usePermission("can_edit_store_balance")`)
- **Route Level**: `useRouteAccess(...)` hook used to determine route visibility
- **Server Level**: RLS policies enforced on all tables

### Route Access Matrix
- **Scoped Roles**: `agent`, `marketer`, `pos`
- **Unrestricted Roles**: `super_admin`, `manager`, `customer`
- **Logic**: Scoped roles are restricted by explicit route/store-type assignments in `agent_routes` and `agent_store_types` tables
- **Default**: Unrestricted roles have full access; scoped roles have no access unless explicitly granted

### RLS Policies
- **Customers**: `user_id = auth.uid()` (self-registration)
- **Stores**: `EXISTS (SELECT 1 FROM customers WHERE id = customer_id AND user_id = auth.uid())`
- **Location Pings**: `user_id = auth.uid()` (agents only)
- **Push Subscriptions**: `user_id = auth.uid()`
- **KYC Documents**: `bucket_id = 'kyc-documents' AND auth.uid() = user_id`

## Key Conventions

- **Role Strings**: Must match `AppRole` union in `AuthContext.tsx` exactly
- **Permission Checks**: Always use `usePermission(...)` — never hardcode role strings
- **Route Visibility**: Always use `useRouteAccess(...)` — never hardcode route allowlists
- **Default Role**: `customer` is the fallback role if no role is assigned
- **Admin Override**: `super_admin` and `manager` roles can override most restrictions
- **Proxy Recording**: Admins/managers can record actions on behalf of other users
- **Offline Sync**: All permissions and roles are validated server-side during sync

---
**Next Phase**: Phase 3 — Authentication & Identity Flow