# BizManager Application Flow Audit & Architecture Documentation

**Generated:** 2026-04-12  
**Application:** BizManager - Multi-role Sales/Route/Collections Management System

---

## 📚 Documentation Index

| Document | Description | Lines |
|----------|-------------|-------|
| [`USER_FLOWS.md`](./USER_FLOWS.md) | Complete user flow analysis with component chains | 482 |
| [`FLOWCHARTS.md`](./FLOWCHARTS.md) | Visual Mermaid diagrams for all major flows | ~800 |
| [`ARCHITECTURE_FLOWS.md`](./ARCHITECTURE_FLOWS.md) | System architecture and data flow patterns | ~600 |
| [`COMPONENT_INTERACTIONS.md`](./COMPONENT_INTERACTIONS.md) | Component hierarchy and interaction maps | ~700 |

---

## 🎯 Key Flows Documented

### 1. Authentication Flow
- **Dual system:** Staff (email/password, Google OAuth) + Customers (phone OTP)
- **Role resolution:** `resolve-user-identity` edge function
- **Session management:** Supabase Auth with custom role assignment

### 2. Sales Recording Flow
- **Entry points:** Web (`Sales.tsx`) + Mobile (`AgentRecord.tsx`)
- **Atomic operations:** `record_sale` RPC with row-level locking
- **Offline support:** IndexedDB queue with business key deduplication
- **Validation:** Credit limits, proximity checks, duplicate prevention

### 3. Transaction/Payment Flow
- **Atomic recording:** `record_transaction` RPC
- **Balance updates:** Automatic `stores.outstanding` recalculation
- **Backdated handling:** Chronological balance rebuild
- **Offline queue:** Same as sales flow

### 4. Order Management Flow
- **Creation:** Simple (text note) + Detailed (products)
- **Credit validation:** Pre-creation credit limit check
- **Fulfillment:** Links to `OrderFulfillmentDialog` → `record_sale` RPC
- **Auto-linking:** Pending orders automatically fulfilled on sale

### 5. Route/Agent Flow
- **Session management:** `route_sessions` table with GPS tracking
- **Store access:** Matrix-based (`agent_routes`, `agent_store_types`)
- **Visit logging:** `store_visits` with GPS coordinates
- **Proximity enforcement:** 100m radius validation

### 6. Handover Flow
- **Balance calculation:** Sales - Received - Sent - Expenses
- **Confirmation workflow:** Pending → Confirmed/Rejected
- **Expense claims:** Submission → Review → Approval

### 7. Customer/Store Management
- **KYC workflow:** Upload → Review (Admin) → Approve/Reject
- **Soft delete:** `deleted_at` + `deleted_by` tracking
- **Duplicate prevention:** Phone normalization + unique index

### 8. Real-time Sync Flow
- **Role-based subscriptions:** Each role subscribes to relevant tables only
- **Shared channel:** Singleton pattern to reduce connections
- **Payload filtering:** Non-admins only see their own records
- **Query invalidation:** Automatic React Query cache updates

### 9. Offline Sync Flow
- **Queue types:** Sales, Transactions, Visits, Customers, Stores, Files
- **Sync algorithm:** FIFO with exponential backoff retry
- **Conflict resolution:** Business key deduplication
- **State management:** Pending → Syncing → Synced/Failed

### 10. Data Quality Flow
- **Automated checks:** Orphaned records, negative balances, miscalculations
- **Edge function:** `data-quality-check` (NEW)
- **Issue tracking:** `data_quality_issues` table
- **Admin notifications:** Critical issues alert admins

---

## 🏗️ Architecture Highlights

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  - React + TypeScript + Vite                                │
│  - shadcn/ui components                                     │
│  - Capacitor (Mobile)                                       │
│  - Role-specific dashboards                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  API LAYER (Supabase)                                       │
│  - Auth (JWT)                                               │
│  - PostgREST (RLS-protected)                                │
│  - Realtime (WebSocket)                                     │
│  - Storage (KYC docs, receipts)                             │
│  - Edge Functions (business logic)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER (PostgreSQL)                                    │
│  - Tables: sales, transactions, orders, etc.               │
│  - RPCs: record_sale, record_transaction                   │
│  - Triggers: outstanding recalc, audit logging             │
│  - RLS: Row-level security                                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Offline-First**: IndexedDB queue for offline operations
2. **Atomic Transactions**: RPCs with row-level locking prevent race conditions
3. **Real-time Sync**: Role-optimized Supabase Realtime subscriptions
4. **Soft Deletes**: Preserved deletion metadata for audit/recovery
5. **Idempotency**: Prevents duplicate operations on retries

---

## 📊 Database Schema Overview

### Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `sales` | Sale transactions | store_id, customer_id, recorded_by |
| `sale_items` | Line items | sale_id, product_id |
| `transactions` | Payment collections | store_id, recorded_by |
| `orders` | Customer orders | store_id, customer_id, created_by |
| `order_items` | Order products | order_id, product_id |
| `stores` | Store locations | customer_id, store_type_id, route_id |
| `customers` | Customer records | user_id (auth) |
| `handovers` | Cash/UPI transfers | user_id, handed_to |
| `route_sessions` | Active agent routes | user_id |
| `store_visits` | GPS visit logs | session_id, store_id |

### RPC Functions

| Function | Purpose | Security |
|----------|---------|----------|
| `record_sale()` | Atomic sale insertion | SECURITY DEFINER |
| `record_transaction()` | Atomic payment recording | SECURITY DEFINER |
| `generate_display_id()` | ID generation | SECURITY DEFINER |
| `check_store_credit_limit()` | Credit validation | SECURITY DEFINER |
| `get_daily_metrics()` | Dashboard metrics | SECURITY DEFINER |
| `get_agent_performance()` | Agent reports | SECURITY DEFINER |

---

## 🔐 Security Model

### Authentication
- **Staff**: Supabase Auth (email/password, Google OAuth)
- **Customers**: Phone OTP via OpenSMS
- **Custom resolution**: `resolve-user-identity` edge function

### Authorization (RLS)

```sql
-- Example: Sales access policy
CREATE POLICY "Staff can view sales" ON sales FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin') 
  OR has_role(auth.uid(), 'manager')
  OR (has_role(auth.uid(), 'agent') AND recorded_by = auth.uid())
  OR (has_role(auth.uid(), 'customer') AND customer_id = ...)
);
```

### Roles

| Role | Description | Access |
|------|-------------|--------|
| `super_admin` | Full system access | All tables, all records |
| `manager` | Operational oversight | All tables, scoped by warehouse |
| `agent` | Field sales | Own sales, assigned routes/stores |
| `marketer` | Order management | Orders, customers, routes |
| `pos` | Point of sale | Sales only, POS store |
| `customer` | Self-service | Own orders, stores |

---

## 🚀 Edge Functions

| Function | Purpose | Auth | Trigger |
|----------|---------|------|---------|
| `send-otp-opensms` | Send SMS OTP | No | Manual |
| `verify-otp-opensms` | Verify OTP | No | Manual |
| `resolve-user-identity` | Role resolution | Yes | Auth hook |
| `invite-staff` | Staff onboarding | super_admin | Manual |
| `data-quality-check` | Data integrity | Yes | Scheduled |
| `daily-handover-snapshot` | Daily reports | Service | Cron |
| `daily-store-reset` | Balance reset | Service | Cron |

---

## 📈 Performance Optimizations

### Implemented
1. **Role-based Realtime**: Each role subscribes to relevant tables only
2. **Shared Channel**: Singleton pattern reduces WebSocket connections
3. **Query Pagination**: Cursor-based pagination for large lists
4. **React Query**: Stale-while-revalidate caching
5. **Code Splitting**: Route-based lazy loading

### Database
1. **Indexes**: `recorded_by`, `created_at`, `status`
2. **Partial Indexes**: `deleted_at IS NULL`
3. **Row-level Locking**: `SELECT ... FOR UPDATE`
4. **Connection Pooling**: Supabase handles this

---

## 🧪 Testing Strategy

### Unit Tests
- Hooks: `usePermission`, `useRouteAccess`, `useOnlineStatus`
- Utilities: `generateBusinessKey`, `checkProximity`
- Components: `DataTable`, `QrStoreSelector`

### Integration Tests
- Complete sale flow (online + offline)
- Real-time sync between users
- Credit limit enforcement
- Handover confirmation workflow

### E2E Tests
- Customer registration → Order → Fulfillment
- Agent route session with GPS
- Admin KYC review process

---

## 📋 Action Items

### Completed ✅
1. ✅ Atomic `record_transaction` RPC
2. ✅ Order credit limit validation
3. ✅ Customer phone deduplication
4. ✅ Business key offline deduplication
5. ✅ Order-sale traceability
6. ✅ Role-based Realtime optimization
7. ✅ Soft delete pattern
8. ✅ Idempotency keys
9. ✅ Data quality check function
10. ✅ Business metrics RPCs

### Future Improvements 📌
1. [ ] Implement circuit breaker for edge functions
2. [ ] Add request caching layer
3. [ ] Implement distributed locking for high-volume sales
4. [ ] Add database replication for read scaling
5. [ ] Implement request ID tracing

---

## 📞 Support

For questions about the codebase architecture:
1. Review the specific flow document
2. Check component code in `src/`
3. Review database migrations in `supabase/migrations/`
4. Consult the AGENTS.md file for conventions

---

*Audit completed by: OpenCode Agent*  
*Date: 2026-04-12*
