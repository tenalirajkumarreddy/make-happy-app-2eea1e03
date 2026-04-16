# Phase 4: Scale & Polish - Implementation Plan

**Phase:** 4-scale-and-polish  
**Duration:** 2 weeks (14 days)  
**Priority:** 🟠 HIGH / 🟡 MEDIUM  
**Created:** 2026-04-12  
**Based on:** DATA_FLOW_AUDIT.md Issues #10-15

---

## Executive Summary

Phase 4 addresses critical scaling and operational enhancements identified in the Data Flow Audit. This phase focuses on:
1. **Security Hardening** - Warehouse-level data scoping with proper RLS enforcement
2. **Operational Efficiency** - Receipt persistence, route optimization, and bulk operations
3. **Global Expansion** - Multi-currency support for international business growth
4. **Resilience** - Enhanced offline conflict resolution for field operations

---

## Goal Statement

> Enable multi-warehouse secure operations with persisted receipt generation, optimized routing, bulk data management, multi-currency transactions, and robust offline conflict resolution to scale BizManager for national/international expansion while maintaining data integrity and operational efficiency.

---

## Success Criteria (Measurable)

| Criterion | Metric | Target | Measurement Method |
|-----------|--------|--------|-------------------|
| **Data Security** | Warehouse isolation compliance | 100% | Automated RLS policy tests - zero unauthorized data access |
| **Receipt Coverage** | Sales with persisted receipts | 100% | DB query: `COUNT(*) FROM receipts / COUNT(*) FROM sales` |
| **Route Efficiency** | Travel time reduction | 20% | GPS tracking comparison: before/after route optimization |
| **Currency Support** | Supported currencies | 3+ | UI validation: INR, USD, EUR, GBP selectable |
| **Bulk Performance** | Records processed per batch | 100+ | Load test: bulk update 100 stores < 5 seconds |
| **Offline Reliability** | Silent conflict failures | 0 | Conflict log monitoring - all conflicts user-visible |
| **Test Coverage** | New feature test coverage | 80%+ | Jest coverage report on new modules |
| **Regression Prevention** | Existing functionality pass | 100% | Full regression test suite |

---

## Issue Scope Summary

| Issue | Priority | Component | Effort |
|-------|----------|-----------|--------|
| #10 Warehouse Scoping | HIGH | Database/Security | 3 days |
| #12 Receipt Generation | MEDIUM | Database/API/UI | 3 days |
| #11 Multi-Currency | MEDIUM | Database/API/UI | 2 days |
| #13 Route Optimization | MEDIUM | Database/API/UI | 3 days |
| #14 Bulk Operations | MEDIUM | Database/API/UI | 2 days |
| #15 Offline Conflict Resolution | MEDIUM | Client Library/UI | 1 day |

---

## Task Breakdown with Dependencies

### Wave 1: Foundation (Days 1-4)

#### Task 1.1: Warehouse Scoping - Database Layer
**Owner:** Backend/DB  
**Duration:** 2 days  
**Depends on:** None (prerequisite for all other Wave 1 tasks)

**Actions:**
1. Create `get_user_warehouses(user_id UUID)` SQL function returning accessible warehouse IDs
2. Create `user_has_warehouse_access(user_id UUID, warehouse_id UUID)` validation function
3. Audit existing RLS policies across 6 tables:
   - `sales` (SELECT, INSERT)
   - `transactions` (SELECT, INSERT)
   - `stores` (SELECT, INSERT, UPDATE)
   - `staff_stock` (SELECT, UPDATE)
   - `stock_movements` (SELECT, INSERT)
   - `orders` (SELECT, INSERT, UPDATE)
4. Create migration `20260413000001_enforce_warehouse_scoping.sql`
5. Update each policy with warehouse scoping USING clause

**Acceptance Criteria:**
- [ ] Manager can only access data from assigned warehouses
- [ ] Agent can only access data from assigned warehouses
- [ ] Cross-warehouse queries return empty results (not errors)
- [ ] Existing users with no warehouse assignments handled gracefully
- [ ] Supabase RLS test harness passes with 100% coverage

**Files Modified:**
- `supabase/migrations/20260413000001_enforce_warehouse_scoping.sql`
- `supabase/migrations/20260413000002_warehouse_rls_policies.sql`

**Verification:**
```sql
-- Test query: user should only see their warehouse data
SELECT * FROM sales WHERE warehouse_id NOT IN (
  SELECT warehouse_id FROM user_roles WHERE user_id = auth.uid()
);
-- Expected: 0 rows
```

---

#### Task 1.2: Warehouse Scoping - Frontend Layer
**Owner:** Frontend  
**Duration:** 1 day  
**Depends on:** Task 1.1

**Actions:**
1. Update `src/hooks/useSales.ts` - Add automatic warehouse filtering to all queries
2. Update `src/hooks/useStores.ts` - Filter stores by accessible warehouses
3. Update `src/hooks/useTransactions.ts` - Add warehouse scoping
4. Update `src/hooks/useOrders.ts` - Add warehouse scoping
5. Create `src/hooks/useWarehouseScope.ts` - Shared hook for warehouse context
6. Update query key patterns to include warehouse context for cache invalidation

**Acceptance Criteria:**
- [ ] All data hooks automatically filter by user's warehouses
- [ ] Query cache respects warehouse boundaries (no cross-contamination)
- [ ] Loading states show "Loading warehouse data..." context
- [ ] Empty state shows "No data for your warehouses" when appropriate

**Files Modified:**
- `src/hooks/useSales.ts`
- `src/hooks/useStores.ts`
- `src/hooks/useTransactions.ts`
- `src/hooks/useOrders.ts`
- `src/hooks/useWarehouseScope.ts` (NEW)
- `src/hooks/useRealtimeSync.ts` (add warehouse-aware invalidation)

**Verification:**
```typescript
// Test: verify warehouse context in query keys
const { data } = useSales();
// Expected: queryKey includes warehouse_ids from user context
```

---

#### Task 1.3: Receipt Generation - Database Schema
**Owner:** Backend/DB  
**Duration:** 1 day  
**Depends on:** Task 1.1 (should respect warehouse scoping)

**Actions:**
1. Create `receipts` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `sale_id UUID REFERENCES sales(id)`
   - `receipt_number TEXT UNIQUE NOT NULL` (format: `RCP-{timestamp}-{random}`)
   - `receipt_data JSONB NOT NULL` (complete receipt snapshot)
   - `pdf_url TEXT` (storage bucket path)
   - `generated_at TIMESTAMPTZ DEFAULT now()`
   - `generated_by UUID REFERENCES auth.users(id)`
   - `sent_to TEXT[]` (recipients history)
   - `resent_count INTEGER DEFAULT 0`
   - `last_resent_at TIMESTAMPTZ`
   - `warehouse_id UUID` (for scoping)
2. Create indexes:
   - `idx_receipts_sale_id` for quick lookups
   - `idx_receipts_number` for receipt verification
   - `idx_receipts_warehouse` for scoping
3. Add RLS policies with warehouse scoping
4. Create trigger to auto-generate receipt on sale insert
5. Migration: `20260414000001_receipts_table.sql`

**Acceptance Criteria:**
- [ ] Receipt record created automatically on every sale
- [ ] Receipt number is unique and traceable
- [ ] JSONB receipt_data contains complete sale snapshot
- [ ] RLS policies enforce warehouse scoping
- [ ] Trigger execution adds < 100ms to sale recording

**Files Modified:**
- `supabase/migrations/20260414000001_receipts_table.sql`
- `supabase/migrations/20260414000002_receipt_triggers.sql`

**Verification:**
```sql
-- Test: receipt auto-generation
INSERT INTO sales (...) VALUES (...);
SELECT * FROM receipts WHERE sale_id = <new_sale_id>;
-- Expected: 1 row created
```

---

### Wave 2: Core Features (Days 5-9)

#### Task 2.1: Receipt PDF Generation Edge Function
**Owner:** Full-stack  
**Duration:** 2 days  
**Depends on:** Task 1.3

**Actions:**
1. Create Edge Function `supabase/functions/generate-receipt-pdf/index.ts`:
   - Accept `{ receipt_id: string }` payload
   - Fetch receipt data from receipts table
   - Generate PDF using HTML template + Deno PDF library
   - Store PDF in `receipts` storage bucket
   - Update receipts.pdf_url with storage path
   - Return `{ success: true, download_url: string }`
2. Create HTML receipt template (responsive, print-friendly):
   - Company header with logo
   - Sale details with line items
   - Payment breakdown
   - QR code linking to receipt verification
   - Terms and conditions
3. Create `src/lib/receipts.ts` - Client library:
   - `generateReceiptPDF(receiptId: string)` - Trigger generation
   - `downloadReceiptPDF(receiptId: string)` - Fetch and download
   - `resendReceipt(receiptId: string, email?: string)` - Via notification system
4. Create `src/lib/receiptTemplates.ts` - Template utilities

**Acceptance Criteria:**
- [ ] PDF generates in < 3 seconds for sales with < 20 items
- [ ] PDF format is A4 print-ready
- [ ] QR code links to receipt verification endpoint
- [ ] Storage bucket `receipts` has proper RLS policies
- [ ] Failed generation is logged and retryable
- [ ] Mobile view optimized PDF template

**Files Modified:**
- `supabase/functions/generate-receipt-pdf/index.ts` (NEW)
- `supabase/functions/generate-receipt-pdf/receipt-template.html` (NEW)
- `src/lib/receipts.ts` (NEW)
- `src/lib/receiptTemplates.ts` (NEW)

**Verification:**
```typescript
// Test: PDF generation flow
const result = await generateReceiptPDF('rcp-123');
// Expected: { success: true, download_url: '...' }
```

---

#### Task 2.2: Receipt Management UI
**Owner:** Frontend  
**Duration:** 1 day  
**Depends on:** Task 2.1

**Actions:**
1. Update `src/components/shared/SaleReceipt.tsx`:
   - Add "View Receipt History" button
   - Add "Download PDF" button
   - Add "Resend Receipt" dialog with email input
   - Show receipt number and generation timestamp
2. Create `src/pages/Receipts.tsx` - Receipt management page:
   - List all receipts with filters (date range, store, warehouse)
   - Search by receipt number
   - Bulk download/print actions
   - Receipt detail view with download/share options
3. Add route `/receipts` with RoleGuard (manager, agent, pos)
4. Update `src/components/layout/AppSidebar.tsx` - Add receipts menu item

**Acceptance Criteria:**
- [ ] Receipt component shows persisted receipt data (not regenerated)
- [ ] Download PDF works on mobile and desktop
- [ ] Resend receipt captures recipient in sent_to array
- [ ] Receipt history searchable by number, date, store
- [ ] Print styling works correctly

**Files Modified:**
- `src/components/shared/SaleReceipt.tsx`
- `src/pages/Receipts.tsx` (NEW)
- `src/App.tsx` (add route)
- `src/components/layout/AppSidebar.tsx`

**Verification:**
```typescript
// Manual: Open sale receipt, verify "Download PDF" works
// Check: Receipt number matches persisted record
```

---

#### Task 2.3: Multi-Currency Support - Database Layer
**Owner:** Backend/DB  
**Duration:** 1 day  
**Depends on:** None

**Actions:**
1. Add currency columns to existing tables:
   - `ALTER TABLE sales ADD COLUMN currency TEXT DEFAULT 'INR'`
   - `ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'INR'`
   - `ALTER TABLE stores ADD COLUMN default_currency TEXT DEFAULT 'INR'`
   - `ALTER TABLE products ADD COLUMN base_currency TEXT DEFAULT 'INR'`
2. Create `exchange_rates` table:
   - `from_currency TEXT NOT NULL`
   - `to_currency TEXT NOT NULL`
   - `rate NUMERIC NOT NULL`
   - `effective_date DATE NOT NULL`
   - `created_at TIMESTAMPTZ DEFAULT now()`
   - `PRIMARY KEY (from_currency, to_currency, effective_date)`
3. Create `convert_currency(amount, from, to, date?)` SQL function
4. Migration: `20260415000001_multi_currency_support.sql`

**Acceptance Criteria:**
- [ ] All existing records have default INR currency
- [ ] Exchange rate table supports historical rates
- [ ] Currency conversion function works with fallback to 1:1
- [ ] Constraints prevent invalid currency codes (ISO 4217)

**Files Modified:**
- `supabase/migrations/20260415000001_multi_currency_support.sql`

**Verification:**
```sql
-- Test: currency conversion
SELECT convert_currency(1000, 'INR', 'USD', CURRENT_DATE);
-- Expected: converted amount based on exchange rate
```

---

#### Task 2.4: Multi-Currency UI Integration
**Owner:** Frontend  
**Duration:** 1 day  
**Depends on:** Task 2.3

**Actions:**
1. Create `src/lib/currency.ts` - Currency utilities:
   - Supported currencies list with symbols
   - `formatCurrency(amount, currency, locale?)` formatter
   - `convertCurrency(amount, from, to)` API wrapper
2. Create `src/components/shared/CurrencySelector.tsx`:
   - Dropdown with INR, USD, EUR, GBP options
   - Shows currency symbol
   - Stores preference in localStorage
3. Update `src/pages/Sales.tsx` - Add currency selector:
   - Default to store's default_currency
   - Show converted amount preview
4. Update `src/components/shared/SaleReceipt.tsx` - Show currency
5. Update `src/pages/Transactions.tsx` - Add currency support

**Acceptance Criteria:**
- [ ] Currency selector shows in sale creation
- [ ] Receipt displays currency symbol (₹, $, €, £)
- [ ] Amount formatting respects locale
- [ ] Currency preference persists across sessions
- [ ] Backend validates currency codes on save

**Files Modified:**
- `src/lib/currency.ts` (NEW)
- `src/components/shared/CurrencySelector.tsx` (NEW)
- `src/pages/Sales.tsx`
- `src/pages/Transactions.tsx`
- `src/components/shared/SaleReceipt.tsx`

**Verification:**
```typescript
// Manual: Create sale in USD, verify receipt shows $
// Verify: DB record stores currency = 'USD'
```

---

### Wave 3: Advanced Features (Days 10-12)

#### Task 3.1: Route Optimization - Database Schema
**Owner:** Backend/DB  
**Duration:** 1 day  
**Depends on:** None

**Actions:**
1. Add geolocation columns to `stores`:
   - `latitude NUMERIC`
   - `longitude NUMERIC`
   - `visit_priority INTEGER DEFAULT 0` (0=normal, higher=urgent)
   - `avg_visit_duration INTEGER` (minutes, for time estimation)
2. Create `route_sessions` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `agent_id UUID REFERENCES auth.users(id)`
   - `date DATE NOT NULL`
   - `optimized_order UUID[]` (array of store IDs in optimal order)
   - `estimated_duration INTEGER` (minutes)
   - `actual_duration INTEGER`
   - `total_distance NUMERIC` (km)
   - `starting_location JSONB` ({lat, lng})
   - `status TEXT DEFAULT 'planned'` (planned, active, completed, cancelled)
   - `created_at TIMESTAMPTZ DEFAULT now()`
3. Create index on `(agent_id, date)` for quick lookups
4. Migration: `20260416000001_route_optimization_schema.sql`

**Acceptance Criteria:**
- [ ] Stores can have lat/lng coordinates
- [ ] Route sessions track optimized visiting order
- [ ] Array type supports PostgreSQL ordering operations
- [ ] Status enum validated at DB level

**Files Modified:**
- `supabase/migrations/20260416000001_route_optimization_schema.sql`

**Verification:**
```sql
-- Test: route session creation
INSERT INTO route_sessions (agent_id, date, optimized_order, status)
VALUES ('user-uuid', CURRENT_DATE, ARRAY['store-1', 'store-2'], 'planned');
-- Expected: Success
```

---

#### Task 3.2: Route Optimization - API Integration
**Owner:** Full-stack  
**Duration:** 1.5 days  
**Depends on:** Task 3.1

**Actions:**
1. Create Edge Function `supabase/functions/optimize-route/index.ts`:
   - Accept `{ agent_id, store_ids[], starting_point? }`
   - Call Mapbox Directions API or Google Maps Directions API
   - Calculate optimal visiting order (Traveling Salesman approximation)
   - Return `{ optimized_order, estimated_duration, total_distance }`
2. Create `src/lib/routeOptimization.ts`:
   - `optimizeRoute(agentId, storeIds, startingPoint?)` - API call
   - `getOrCreateRouteSession(agentId, date)` - Check existing or generate new
   - `calculateRouteMetrics(orderedStores)` - Distance/time estimation
3. Add environment variable: `VITE_MAPBOX_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`
4. Update `src/hooks/useRealtimeSync.ts` - Add `route_sessions` to invalidation

**Acceptance Criteria:**
- [ ] Route optimization API returns order in < 5 seconds for < 30 stores
- [ ] Optimized order reduces travel distance by estimated 20%+
- [ ] API key secured in environment (not hardcoded)
- [ ] Fallback to original order if API fails
- [ ] Rate limiting handled gracefully

**Files Modified:**
- `supabase/functions/optimize-route/index.ts` (NEW)
- `src/lib/routeOptimization.ts` (NEW)
- `src/hooks/useRealtimeSync.ts`
- `.env.example` (add MAPBOX_API_KEY)

**Verification:**
```typescript
// Test: route optimization
const result = await optimizeRoute('agent-1', ['store-a', 'store-b', 'store-c']);
// Expected: { optimized_order: [...], estimated_duration: 120, total_distance: 15.5 }
```

---

#### Task 3.3: Route Optimization - UI Components
**Owner:** Frontend  
**Duration:** 0.5 days  
**Depends on:** Task 3.2

**Actions:**
1. Create `src/components/routes/RouteOptimizer.tsx`:
   - "Optimize Route" button for agent
   - Shows current vs optimized route comparison
   - Visual map preview (if coordinates available)
   - Estimated time/distance savings
2. Update `src/pages/AgentRoutes.tsx`:
   - Display stores in optimized_order from active route_session
   - Drag-drop reordering (manual override)
   - Mark visited/unvisited status
3. Create `src/components/routes/RouteMapView.tsx` - Mini map with route line

**Acceptance Criteria:**
- [ ] Agent can optimize route with single click
- [ ] Optimized route shows estimated time savings
- [ ] Manual reordering updates route_session
- [ ] Map view renders route line connecting stores
- [ ] Offline agents see cached route data

**Files Modified:**
- `src/components/routes/RouteOptimizer.tsx` (NEW)
- `src/components/routes/RouteMapView.tsx` (NEW)
- `src/pages/AgentRoutes.tsx`

**Verification:**
```typescript
// Manual: Agent clicks "Optimize Route", verify order changes
// Verify: estimated_duration shows time savings
```

---

### Wave 4: Efficiency Tools (Days 13-14)

#### Task 4.1: Bulk Operations - Database Layer
**Owner:** Backend/DB  
**Duration:** 1 day  
**Depends on:** Task 1.1 (must respect warehouse scoping)

**Actions:**
1. Create `bulk_operations` audit table:
   - `id UUID PRIMARY KEY`
   - `operation_type TEXT` (price_update, store_assignment, credit_limit)
   - `record_count INTEGER`
   - `affected_ids UUID[]`
   - `performed_by UUID REFERENCES auth.users(id)`
   - `performed_at TIMESTAMPTZ DEFAULT now()`
   - `details JSONB` (parameters used)
2. Create bulk operation functions:
   - `bulk_update_prices(product_ids[], price_change, is_percentage?)`
   - `bulk_assign_stores(store_ids[], agent_id)`
   - `bulk_update_credit_limits(store_ids[], new_limit)`
   - `bulk_archive_stores(store_ids[])`
3. All functions:
   - Validate warehouse access before updates
   - Use bulk UPDATE statements (not row-by-row)
   - Log to bulk_operations table
   - Return count of affected records
4. Migration: `20260417000001_bulk_operations.sql`

**Acceptance Criteria:**
- [ ] Bulk update 100 products in < 3 seconds
- [ ] All operations logged with before/after state
- [ ] RLS policies prevent cross-warehouse bulk operations
- [ ] Function returns accurate affected count
- [ ] Rollback capability documented

**Files Modified:**
- `supabase/migrations/20260417000001_bulk_operations.sql`

**Verification:**
```sql
-- Test: bulk price update
SELECT bulk_update_prices(
  ARRAY['prod-1', 'prod-2', 'prod-3'],
  10,
  true -- percentage
);
-- Expected: 3 records updated
```

---

#### Task 4.2: Bulk Operations - UI Components
**Owner:** Frontend  
**Duration:** 1 day  
**Depends on:** Task 4.1

**Actions:**
1. Update `src/components/shared/DataTable.tsx`:
   - Add checkbox column for multi-select
   - Add "Select All" header checkbox
   - Track selected row IDs in state
2. Create `src/components/shared/BulkActionToolbar.tsx`:
   - Shows selected count
   - Action dropdown: Bulk Update Price, Assign to Agent, Update Credit
   - Confirmation dialog with impact preview
   - Progress indicator for large operations
3. Create `src/components/bulk/BulkPriceUpdateDialog.tsx`:
   - Amount input with percentage/flat toggle
   - Preview showing sample of affected products
   - Confirm button with loading state
4. Create `src/components/bulk/BulkAssignDialog.tsx`:
   - Agent selector dropdown
   - Shows current assignments
   - Confirm with count

**Acceptance Criteria:**
- [ ] Multi-select works across pagination
- [ ] Bulk toolbar appears when rows selected
- [ ] Confirmation shows exact impact ("Update 47 products")
- [ ] Progress indicator for operations > 50 records
- [ ] Success/failure toast with details
- [ ] Failed operations show which records failed

**Files Modified:**
- `src/components/shared/DataTable.tsx`
- `src/components/shared/BulkActionToolbar.tsx` (NEW)
- `src/components/bulk/BulkPriceUpdateDialog.tsx` (NEW)
- `src/components/bulk/BulkAssignDialog.tsx` (NEW)
- `src/pages/Stores.tsx`
- `src/pages/Products.tsx`

**Verification:**
```typescript
// Manual: Select 5 stores, bulk assign to agent
// Verify: All 5 stores updated in DB
// Verify: Toast shows "5 stores assigned successfully"
```

---

### Wave 5: Resilience (Day 14)

#### Task 5.1: Offline Conflict Resolution
**Owner:** Frontend  
**Duration:** 1 day  
**Depends on:** None

**Actions:**
1. Update `src/lib/offlineQueue.ts`:
   - Add `context` field to `PendingAction` interface:
     - `storeOutstandingAtQueueTime?`
     - `productPriceAtQueueTime?`
     - `customerCreditLimitAtQueueTime?`
     - `timestampAtQueueTime`
   - Modify `addToQueue()` to capture context from current state
   - Update `syncOfflineQueue()` to send context to server
2. Create `src/lib/conflictResolver.ts`:
   - `detectConflicts(operation, currentState)` - Compare context to current
   - `ConflictType` enum: NONE, CREDIT_EXCEEDED, PRICE_CHANGED, STORE_INACTIVE
   - `resolveConflict(conflict, strategy)` - Apply resolution strategy
   - `getConflictResolutionOptions(conflict)` - Return available actions
3. Update `src/hooks/useOnlineStatus.ts`:
   - After sync, check for conflicts in response
   - Show conflict notification with details
4. Create `src/components/offline/ConflictResolutionDialog.tsx`:
   - Side-by-side view: Queued vs Current
   - Options: Apply Anyway, Modify & Apply, Discard
   - Show conflict reason clearly
   - Preview of outcome for each option

**Acceptance Criteria:**
- [ ] Context captured when operation queued offline
- [ ] Server validates context on sync (RPC function)
- [ ] Conflicts detected and surfaced to user
- [ ] User can choose resolution strategy per conflict
- [ ] Resolution choice logged for audit
- [ ] Zero silent failures (all conflicts user-visible)

**Files Modified:**
- `src/lib/offlineQueue.ts`
- `src/lib/conflictResolver.ts` (NEW)
- `src/hooks/useOnlineStatus.ts`
- `src/components/offline/ConflictResolutionDialog.tsx` (NEW)
- `src/components/shared/OfflineQueueStatus.tsx` (update for conflict badge)

**Verification:**
```typescript
// Test: Offline conflict scenario
// 1. Queue sale for store with ₹5000 outstanding
// 2. While offline, another sale makes outstanding ₹9000
// 3. Store credit limit is ₹10000
// 4. Queued sale is ₹2000 (would exceed limit)
// 5. Go online, verify conflict dialog appears
// 6. Options: Apply Anyway, Modify Amount, Discard
```

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **RLS Policy Regression** | Medium | Critical | Test all role/warehouse combinations before deploy; feature flag for rollback |
| **PDF Generation Performance** | Medium | High | Async generation with polling; fallback to HTML receipt; rate limiting |
| **Map API Rate Limits** | High | Medium | Caching; fallback to manual ordering; batch optimization |
| **Currency Conversion Errors** | Low | High | Validate rates daily; fallback to 1:1; manual override for edge cases |
| **Bulk Operation Timeout** | Medium | High | Cursor-based pagination for large batches; background job for >100 records |
| **Offline Conflict UX Confusion** | Medium | Medium | Clear messaging; tooltips explaining each option; agent training materials |
| **Cross-Warehouse Data Leak** | Low | Critical | Automated integration tests for all RLS policies; manual security audit |
| **Mobile Performance Degradation** | Medium | Medium | Lazy load receipt PDFs; optimize map component; test on low-end devices |

---

## Testing Strategy

### Unit Tests (80%+ coverage)
```typescript
// Warehouse scoping
- get_user_warehouses() returns correct warehouses
- user_has_warehouse_access() validates correctly
- RLS policies block cross-warehouse access

// Receipt generation
- Receipt record created on sale insert
- PDF generation produces valid PDF
- Resend receipt updates sent_to array

// Currency
- convert_currency() uses correct rate
- formatCurrency() respects locale
- Invalid currency codes rejected

// Route optimization
- optimizeRoute() calls Map API correctly
- Fallback to original order on API failure
- Estimated time calculated correctly

// Bulk operations
- bulk_update_prices() updates correct records
- Warehouse scoping enforced in bulk ops
- Audit trail logged correctly

// Offline conflict
- Conflict detected when credit exceeded
- Resolution strategies applied correctly
- Context captured on queue
```

### Integration Tests
- Multi-warehouse sale recording flow
- Receipt generation and download end-to-end
- Currency conversion in sale creation
- Route optimization with real Map API
- Bulk update 100+ records performance
- Offline sync with conflict scenarios

### Manual Testing Checklist
- [ ] Manager A cannot see Manager B's warehouse data
- [ ] Receipt generates and downloads on mobile
- [ ] Currency switch updates all price displays
- [ ] Route optimization shows time savings
- [ ] Bulk operation previews before committing
- [ ] Offline conflict dialog appears correctly

---

## Verification Approach

### Pre-Deployment Verification
1. Run full test suite: `npm run test`
2. Verify RLS policies: `supabase db test`
3. Load test bulk operations: `npm run test:load`
4. Mobile regression on Android APK: `npm run build:android`

### Post-Deployment Monitoring
1. Monitor error rates for 48 hours
2. Track receipt generation success rate
3. Check Map API quota usage
4. Review conflict resolution logs
5. Validate warehouse data isolation

### Success Validation
| Checkpoint | Date | Status | Notes |
|------------|------|--------|-------|
| RLS policies pass security audit | | | |
| Receipt coverage reaches 100% | | | |
| Route optimization reduces travel time | | | |
| Bulk operations performant | | | |
| Zero silent offline failures | | | |

---

## Deployment Plan

### Phase 4.1: Security First (Week 1)
- Day 1-2: Deploy Task 1.1, 1.2 (warehouse scoping)
- Day 3: Security audit and validation
- Day 4-5: Deploy Task 1.3, 2.1, 2.2 (receipts)

### Phase 4.2: Operational Features (Week 2)
- Day 6-8: Deploy Task 2.3, 2.4 (currency)
- Day 9-11: Deploy Task 3.1, 3.2, 3.3 (route optimization)
- Day 12-13: Deploy Task 4.1, 4.2 (bulk operations)
- Day 14: Deploy Task 5.1 (offline conflicts)

### Rollback Strategy
- Each feature behind feature flag
- Database migrations are backward compatible
- Rollback plan documented in runbook
- 48-hour monitoring window per feature

---

## Documentation Requirements

### User Documentation
1. **Warehouse Scoping Guide** - How multi-warehouse permissions work
2. **Receipt Management** - How to generate, download, and resend receipts
3. **Multi-Currency Setup** - How to configure exchange rates
4. **Route Optimization** - How to optimize and follow routes
5. **Bulk Operations** - How to perform bulk updates safely
6. **Offline Conflict Resolution** - How to handle sync conflicts

### Developer Documentation
1. **RLS Policy Reference** - Document all warehouse-scoped policies
2. **Receipt API Guide** - Edge function usage patterns
3. **Currency System** - Exchange rate management
4. **Route Optimization Internals** - Map API integration
5. **Bulk Operation Patterns** - Performance best practices
6. **Conflict Detection** - How context tracking works

---

## Dependencies Summary

```
Wave 1 (Days 1-4):
  Task 1.1 → Task 1.2
  Task 1.1 → Task 1.3

Wave 2 (Days 5-9):
  Task 1.3 → Task 2.1
  Task 2.1 → Task 2.2
  Task 2.3 (independent)
  Task 2.3 → Task 2.4

Wave 3 (Days 10-12):
  Task 3.1 → Task 3.2
  Task 3.2 → Task 3.3

Wave 4 (Days 13-14):
  Task 1.1 → Task 4.1
  Task 4.1 → Task 4.2

Wave 5 (Day 14):
  Task 5.1 (independent)
```

---

## Files Summary

### New Files (Estimated)
- 8 SQL migration files
- 3 Edge functions
- 12 TypeScript library/components
- 5 Test files

### Modified Files (Estimated)
- 15 existing hook files
- 8 page components
- 4 shared components
- 2 layout files
- 1 App.tsx route table

---

## Notes

1. **Security Priority**: Warehouse scoping (Task 1.1, 1.2) is highest priority - blocks all other data access work.

2. **Receipt Storage**: PDF storage uses existing Supabase Storage with `receipts` bucket (create via migration).

3. **Map API**: Default to Mapbox (more generous free tier), Google Maps fallback if needed.

4. **Offline Conflicts**: This is Phase 1 of conflict resolution - basic detection only. Advanced auto-resolution in future phase.

5. **Testing**: Allocate 20% of effort to testing - financial features require extra validation.

6. **Documentation**: Update AGENTS.md with new patterns for warehouse-aware queries.

---

*Plan Version: 1.0*  
*Last Updated: 2026-04-12*  
*Next Review: After Task 1.1 completion*