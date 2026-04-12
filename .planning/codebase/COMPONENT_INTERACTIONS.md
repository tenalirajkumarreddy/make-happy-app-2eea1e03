# BizManager Component Interactions Map

## Visual Component Hierarchy

```
App.tsx (Root)
│
├── Providers (QueryClient, AuthContext, Toast)
│
├── AppLayout (Web Layout)
│   ├── AppHeader
│   │   ├── GlobalSearch
│   │   ├── NotificationsPanel
│   │   └── UserMenu
│   │
│   ├── Sidebar
│   │   └── RoleBasedNavigation (useRouteAccess)
│   │
│   ├── Main Content Area
│   │   └── Routes (react-router)
│   │       ├── Dashboard (Role-specific)
│   │       │   ├── SuperAdminDashboard
│   │       │   ├── ManagerDashboard
│   │       │   ├── AgentDashboard
│   │       │   ├── MarketerDashboard
│   │       │   ├── PosDashboard
│   │       │   └── CustomerPortal
│   │       │
│   │       ├── Sales
│   │       │   ├── SalesList (DataTable)
│   │       │   ├── AddSaleDialog
│   │       │   │   ├── StoreSelector (QrStoreSelector)
│   │       │   │   ├── ProductSelector
│   │       │   │   ├── PaymentInputs
│   │       │   │   └── CreditLimitWarning
│   │       │   ├── SaleReceipt
│   │       │   └── ExportCSV
│   │       │
│   │       ├── Transactions
│   │       │   ├── TransactionList
│   │       │   └── RecordTransactionDialog
│   │       │
│   │       ├── Orders
│   │       │   ├── OrderList
│   │       │   ├── OrderFulfillmentDialog
│   │       │   └── CreateOrderDialog
│   │       │
│   │       ├── Customers
│   │       │   ├── CustomerList
│   │       │   ├── CreateCustomerDialog
│   │       │   └── KycReviewDialog
│   │       │
│   │       ├── Stores
│   │       │   ├── StoreList
│   │       │   ├── CreateStoreWizard
│   │       │   └── StoreDetail
│   │       │
│   │       ├── Routes
│   │       │   ├── RouteList
│   │       │   ├── RouteDetail
│   │       │   └── AgentRoutes (Mobile)
│   │       │
│   │       ├── Handovers
│   │       │   ├── HandoverList
│   │       │   ├── CreateHandoverDialog
│   │       │   └── ExpenseClaimDialog
│   │       │
│   │       ├── Reports
│   │       │   ├── PaymentOutstandingReport
│   │       │   ├── CustomerStatement
│   │       │   └── Analytics
│   │       │
│   │       └── Settings
│   │           ├── UserPermissionsPanel
│   │           └── CompanySettings
│   │
│   └── useRealtimeSync (Background)
│
└── MobileApp (Native App - Capacitor)
    ├── MobileLayout
    │   ├── MobileHeader
    │   ├── MobileNavigation (Bottom Tabs)
    │   └── MobilePages
    │       ├── AgentHome
    │       ├── AgentRoutes
    │       ├── AgentRecord (Sales)
    │       └── AgentHistory
    │
    └── Mobile Hooks
        ├── useGeolocation
        └── useNativeCamera
```

---

## Component Data Flow Matrix

| Component | Props In | Hooks Used | Data Out | Side Effects |
|-----------|----------|------------|----------|--------------|
| `Sales.tsx` | - | `useAuth`, `useQuery`, `useRouteAccess`, `usePermission` | Sales data, mutations | `addToQueue`, `logActivity`, `sendNotification` |
| `SalesList` | `data`, `columns` | - | `onRowClick`, `onDelete` | - |
| `AddSaleDialog` | `open`, `onClose` | `useQuery` (stores, products) | `onSubmit` | `record_sale` RPC |
| `StoreSelector` | `value`, `onChange` | `useQuery` (stores) | `onSelect` | - |
| `ProductSelector` | `storeTypeId` | `useQuery` (products) | `onSelect` | - |
| `QrStoreSelector` | `onSelect` | `useState` | `storeId` | Camera API |
| `useOnlineStatus` | - | `useState`, `useEffect` | `isOnline`, `syncQueue` | IndexedDB, Supabase |
| `useRealtimeSync` | - | `useAuth`, `useEffect` | - | Supabase Realtime subscriptions |
| `AuthContext.Provider` | `children` | `useState`, `useEffect` | `user`, `role`, `profile` | Supabase Auth listeners |

---

## Event Flow Diagram

### Sale Recording Event Chain

```
User Clicks "Record Sale"
         │
         ▼
┌─────────────────┐
│ setShowAdd(true)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AddSaleDialog   │
│  - Store Picker │
│  - Products     │
│  - Payment      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ handleAdd()     │
│  - Validate     │
│  - Credit Check │
│  - Proximity    │
└────────┬────────┘
         │
         ▼
     ┌───┴───┐
     │       │
     ▼       ▼
┌────────┐ ┌────────────┐
│ Offline│ │ Online     │
│        │ │            │
│ Queue  │ │ RPC Call   │
└───┬────┘ └─────┬──────┘
    │            │
    ▼            ▼
┌─────────────────────────┐
│   OfflineQueue.ts       │
│   - addToQueue()        │
│   - IndexedDB           │
│                         │
│   OR                    │
│                         │
│   record_sale RPC       │
│   - Atomic transaction  │
│   - DB triggers         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Response Handling     │
│   - Success: Toast      │
│   - Error: Retry/Notify   │
│   - Invalidate Queries   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Realtime Broadcast    │
│   - Other users notified │
│   - Dashboards update    │
└─────────────────────────┘
```

---

## Hook Dependencies Graph

```
useAuth
│
├── useQueryClient (React Query)
├── supabase.auth.getUser()
├── supabase.auth.onAuthStateChange()
│
└── Returns: { user, role, profile, signOut }

usePermission(key: PermissionKey)
│
├── useAuth() ───┐
├── useQuery()   │─── user_roles, user_permissions
└── ROLE_DEFAULTS
│
└── Returns: { allowed, loading }

useRouteAccess(userId, role)
│
├── useQuery() ─── agent_routes
├── useQuery() ─── agent_store_types
│
└── Returns: { canAccessStore, canAccessRoute, enabledRouteIds, ... }

useOnlineStatus()
│
├── navigator.onLine (Browser API)
├── useState (isOnline, pendingCount, syncing)
├── useCallback (syncQueue)
│
├── Depends on: offlineQueue.ts
│   ├── openDB() ─── IndexedDB
│   ├── getQueuedActions()
│   └── removeFromQueue()
│
├── Depends on: useOnlineStatus.syncFileUploads
│   └── supabase.storage
│
└── Returns: { isOnline, pendingCount, syncing, syncQueue }

useRealtimeSync()
│
├── useAuth() ───┐
├── useQueryClient()
├── supabase.channel()
│
├── Shared State: sharedChannel (singleton)
├── Shared State: subscribers (Map)
│
└── Side Effect: Subscribe to Realtime changes
    ├── On Change: invalidateQueries()
    └── On Unmount: removeChannel()
```

---

## State Management Summary

### Local State (useState)

| Component | State Variables | Purpose |
|-----------|-----------------|---------|
| `Sales.tsx` | `showAdd`, `saving`, `selectedSaleId` | UI state |
| `Sales.tsx` | `storeId`, `items`, `cashAmount`, `upiAmount` | Form state |
| `Sales.tsx` | `filterFrom`, `filterTo`, `filterStore` | Filter state |
| `AddSaleDialog` | `searchTerm`, `selectedProducts` | Dialog state |
| `DataTable` | `sortColumn`, `sortDirection`, `page` | Table state |

### Global State (React Query Cache)

| Query Key | Data | Stale Time | Invalidated By |
|-----------|------|------------|----------------|
| `['sales', userId]` | Sales list | 30s | Realtime: sales table |
| `['stores']` | Stores list | 60s | Realtime: stores table |
| `['customers']` | Customers | 60s | Realtime: customers table |
| `['products']` | Products | 5min | Realtime: products table |
| `['my-permissions', userId]` | User permissions | 30s | - |
| `['route-access-matrix', userId]` | Route access | 5min | Realtime: agent_routes |

### Server State (Supabase)

| Table | Primary Key | Relationships | Indexes |
|-------|-------------|---------------|---------|
| `sales` | id (uuid) | store_id, customer_id, recorded_by | recorded_by, created_at |
| `sale_items` | id (uuid) | sale_id, product_id | sale_id |
| `transactions` | id (uuid) | store_id, recorded_by | recorded_by, created_at |
| `orders` | id (uuid) | store_id, customer_id, created_by | status, created_at |
| `stores` | id (uuid) | customer_id, store_type_id, route_id | customer_id, is_active |
| `customers` | id (uuid) | user_id (auth) | phone (unique) |
| `user_roles` | user_id (uuid) | - | user_id (unique) |

---

## API Call Patterns

### Standard Query Pattern

```typescript
// Read Data
const { data, isLoading, error } = useQuery({
  queryKey: ['sales', userId, filters],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*, stores(name), customers(name)')
      .eq('recorded_by', userId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },
  staleTime: 30_000
})
```

### Mutation Pattern

```typescript
// Write Data
const mutation = useMutation({
  mutationFn: async (saleData) => {
    // 1. Generate display ID
    const { data: displayId } = await supabase
      .rpc('generate_display_id', { prefix: 'SALE', seq_name: 'sale_display_seq' })
    
    // 2. Call atomic RPC
    const { data, error } = await supabase
      .rpc('record_sale', { 
        p_display_id: displayId,
        ...saleData 
      })
    
    if (error) throw error
    return data
  },
  onSuccess: () => {
    // 3. Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    
    // 4. Show success
    toast.success('Sale recorded')
  },
  onError: (error) => {
    // 5. Handle error
    toast.error(error.message)
  }
})
```

### Offline-Aware Pattern

```typescript
const handleAction = async () => {
  // Check online status
  if (!navigator.onLine) {
    // Queue for later
    await addToQueue({
      id: crypto.randomUUID(),
      type: 'sale',
      payload: saleData,
      businessKey: generateBusinessKey('sale', params),
      createdAt: new Date().toISOString()
    })
    toast.warning('Saved offline - will sync when online')
    return
  }
  
  // Execute immediately
  await mutation.mutateAsync(saleData)
}
```

---

## Edge Cases & Boundary Conditions

### Sales Recording

| Scenario | Handling |
|----------|----------|
| Credit limit exceeded | Block sale, show warning |
| Store has no GPS | Allow with warning (skippedNoGps) |
| Offline during sale | Queue for sync with business key dedupe |
| Concurrent sales | Row-level locking prevents race conditions |
| Sale amount = 0 | Validation error |
| Invalid product ID | Foreign key constraint error |

### Authentication

| Scenario | Handling |
|----------|----------|
| Session expired | Redirect to login |
| Role not found | Default to 'customer' |
| Staff directory entry missing | Create on first login |
| Phone number duplicate | Normalize and block |
| OTP expired | Allow retry with rate limiting |

### Synchronization

| Scenario | Handling |
|----------|----------|
| Sync fails after 3 retries | Mark as failed, alert user |
| Duplicate business key | Skip duplicate action |
| Server conflict | Server-side recalculation wins |
| Large queue (100+ items) | Batch process, show progress |
| File upload fails | Retry with exponential backoff |

---

## Testing Points

### Unit Test Targets

1. **Hooks**
   - `usePermission` - returns correct permission
   - `useRouteAccess` - filters stores correctly
   - `useOnlineStatus` - detects online/offline

2. **Utilities**
   - `generateBusinessKey` - consistent hashing
   - `checkProximity` - distance calculations
   - `resolveCreditLimit` - credit logic

3. **Components**
   - `DataTable` - sorting, pagination
   - `QrStoreSelector` - QR code scanning
   - `SaleReceipt` - receipt generation

### Integration Test Flows

1. **Complete Sale Flow**
   ```
   Login → Navigate Sales → Select Store → Add Products 
   → Enter Payment → Submit → Verify DB → Verify Outstanding
   ```

2. **Offline Sync Flow**
   ```
   Go Offline → Record Sale → Verify Queue → Go Online 
   → Verify Sync → Verify DB
   ```

3. **Real-time Update Flow**
   ```
   User A: Open Sales → User B: Record Sale → 
   Verify User A sees new sale
   ```

4. **Credit Limit Flow**
   ```
   Create Order near limit → Attempt sale over limit 
   → Verify blocked → Adjust limit → Verify allowed
   ```

---

*Component interactions documented: 2026-04-12*
