# BizManager Architecture Flow Documentation

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Data Flow Patterns](#data-flow-patterns)
3. [Security & Access Control Flow](#security--access-control-flow)
4. [Offline-First Architecture](#offline-first-architecture)
5. [Real-time Synchronization](#real-time-synchronization)
6. [Error Handling Patterns](#error-handling-patterns)
7. [Performance Optimizations](#performance-optimizations)

---

## System Architecture Overview

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Web App    │  │  Mobile App  │  │   PWA App    │  │  Admin Panel │   │
│  │   (React)    │  │ (Capacitor)  │  │   (React)    │  │   (React)    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼─────────────────┼─────────────────┼─────────────────┼──────────┘
          │                 │                 │                 │
          └─────────────────┴────────┬────────┴─────────────────┘
                                     │
                              HTTP / WebSocket
                                     │
┌────────────────────────────────────┴──────────────────────────────────────┐
│                           SUPABASE LAYER                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         API Gateway                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │ │
│  │  │    Auth     │  │  PostgREST  │  │  Realtime   │  │  Storage  │  │ │
│  │  │   (JWT)     │  │   (REST)    │  │   (WS)      │  │  (Files)  │  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │ │
│  └─────────┼────────────────┼────────────────┼───────────────┼────────┘ │
│            │                │                │               │        │
└────────────┼────────────────┼────────────────┼───────────────┼────────┘
             │                │                │               │
             └────────────────┴───────┬────────┴───────────────┬──────────┘
                                      │                        │
                              ┌───────┴────────┐     ┌─────────┴────────┐
                              │ Edge Functions │     │ Database Triggers │
                              └───────┬────────┘     └───────────────────┘
                                      │
┌─────────────────────────────────────┴─────────────────────────────────────┐
│                         DATABASE LAYER (PostgreSQL)                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Tables: sales, transactions, orders, customers, stores, etc.       │ │
│  │  RPCs: record_sale, record_transaction, generate_display_id        │ │
│  │  Triggers: Outstanding recalc, Audit logging, Soft delete           │ │
│  │  RLS: Row Level Security Policies per role                          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Patterns

### Pattern 1: Standard CRUD Flow

```
User Action → React Component → React Query → Supabase Client → PostgREST → Database
                 ↑                                              ↓
                 └────────── Cache Invalidation ← Realtime ←────┘
```

**Example: Loading Sales List**

```typescript
// 1. Component requests data
const { data: sales } = useQuery({
  queryKey: ['sales', userId],
  queryFn: async () => {
    // 2. React Query checks cache
    // 3. If stale/missing, fetch from Supabase
    const { data } = await supabase
      .from('sales')
      .select('*, stores(name)')
      .eq('recorded_by', userId)
    return data
  }
})

// 4. Supabase client applies RLS policies
// 5. PostgREST executes SQL query
// 6. Database returns filtered results
// 7. React Query caches response
// 8. Component renders data
```

### Pattern 2: Atomic Transaction Flow

```
User Action → Validation → Generate ID → RPC Call → DB Transaction → Triggers → Response
                 ↑            ↑            ↑             ↑            ↑          ↓
                 └────────────┴────────────┴─────────────┴────────────┴──────────┘
                                    All-or-Nothing
```

**Example: Recording a Sale**

```typescript
// Frontend (Sales.tsx)
const handleSale = async () => {
  // 1. Client-side validation
  if (totalAmount <= 0) throw new Error('Invalid amount')
  
  // 2. Generate display ID
  const { data: displayId } = await supabase
    .rpc('generate_display_id', { prefix: 'SALE', seq_name: 'sale_display_seq' })
  
  // 3. Call atomic RPC
  const { data, error } = await supabase.rpc('record_sale', {
    p_display_id: displayId,
    p_store_id: storeId,
    p_total_amount: totalAmount,
    // ... other params
  })
  
  // 4. RPC handles everything atomically:
  //    - Lock store row (FOR UPDATE)
  //    - Insert sale record
  //    - Insert sale_items
  //    - Update store.outstanding
  //    - Check/deliver pending orders
  //    - All in single transaction
  
  // 5. Triggers fire automatically:
  //    - recalc_store_outstanding
  //    - log_activity
  
  // 6. Realtime notifies subscribers
  // 7. React Query invalidates caches
}
```

### Pattern 3: Offline-First Flow

```
Online:  User → Action → Network → Server → Confirm
                    ↓
Offline: User → Action → Queue (IndexedDB) → Sync Later → Confirm
                    ↓
                    └→ Show "Queued" State
```

**State Management**

| State | Description | UI Indicator |
|-------|-------------|--------------|
| `pending` | Action queued locally | Yellow badge |
| `syncing` | Currently uploading | Spinner |
| `synced` | Confirmed on server | Green check |
| `failed` | Max retries exceeded | Red error |

---

## Security & Access Control Flow

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Client    │────→│  Supabase   │────→│  Edge Function  │
│  (Login)    │     │    Auth     │     │ (Custom Logic)  │
└─────────────┘     └──────┬──────┘     └────────┬────────┘
                           │                     │
                           ↓                     ↓
                    ┌─────────────┐     ┌─────────────┐
                    │  auth.users │     │ user_roles  │
                    │  (Session)  │     │  (Lookup)   │
                    └─────────────┘     └──────┬──────┘
                                               │
                                               ↓
                                        ┌─────────────┐
                                        │   profiles  │
                                        │  (Metadata) │
                                        └─────────────┘
```

### Authorization Flow (RLS)

```sql
-- Example: Sales RLS Policy
CREATE POLICY "Staff can view sales" 
ON public.sales 
FOR SELECT 
TO authenticated
USING (
  -- Super admin sees all
  has_role(auth.uid(), 'super_admin') 
  OR has_role(auth.uid(), 'manager')
  -- Agents see their own
  OR (has_role(auth.uid(), 'agent') 
      AND (recorded_by = auth.uid() OR assigned_to = auth.uid()))
  -- Customers see their own
  OR (has_role(auth.uid(), 'customer') 
      AND customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      ))
);
```

### Role Resolution Flow

```
auth.uid() → resolve-user-identity Edge Function
                    │
                    ├→ Check staff_directory (email/phone)
                    ├→ Check staff_invitations
                    ├→ Check customers (phone)
                    └→ Default to 'customer'
                    │
                    ↓
            Update user_roles table
                    │
                    ↓
            Redirect to role dashboard
```

---

## Offline-First Architecture

### IndexedDB Schema

```typescript
// DB: aquaprime_offline
// Version: 3

interface PendingAction {
  id: string;              // UUID
  type: 'sale' | 'transaction' | 'visit' | 'customer' | 'store';
  payload: {
    // Sale payload
    saleData: {
      store_id: string;
      customer_id: string;
      total_amount: number;
      // ...
    };
    saleItems: Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
    }>;
  };
  createdAt: string;
  retryCount: number;
  lastError?: string;
  businessKey?: string;    // For deduplication
}

interface PendingFileUpload {
  id: string;
  type: 'kyc' | 'entity_photo' | 'store_photo';
  bucket: string;
  path: string;
  fileData: ArrayBuffer;
  contentType: string;
  metadata: Record<string, unknown>;
  retryCount: number;
}
```

### Sync Algorithm

```typescript
// useOnlineStatus.ts
const syncQueue = async () => {
  // 1. Check online status
  if (!navigator.onLine) return
  
  // 2. Get queued actions
  const actions = await getQueuedActions()
  
  // 3. Process in order (FIFO)
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'sale':
          await syncSale(action.payload)
          break
        case 'transaction':
          await syncTransaction(action.payload)
          break
        // ... other types
      }
      
      // 4. Remove on success
      await removeFromQueue(action.id)
      
    } catch (error) {
      // 5. Retry with exponential backoff
      const shouldRetry = await markActionFailed(action.id, error.message)
      if (!shouldRetry) {
        // Max retries exceeded - alert user
        logError(action, error)
      }
    }
  }
}
```

### Conflict Resolution

| Scenario | Resolution Strategy |
|----------|---------------------|
| Duplicate sale (business key match) | Skip duplicate, notify user |
| Sale with outdated outstanding | Server-side recalculation |
| Concurrent edits | Last-write-wins (timestamp) |
| Offline sale, online concurrent | Business key prevents duplicate |

---

## Real-time Synchronization

### Supabase Realtime Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   sales     │    │ transactions│    │    orders   │         │
│  │   table     │    │   table     │    │   table     │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                     ┌──────┴──────┐                            │
│                     │ Publication │                            │
│                     │ supabase_realtime                       │
│                     └──────┬──────┘                            │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   Realtime Server   │
                    │    (WebSocket)      │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Agent App   │   │ Manager App  │   │ Customer App │
   └──────────────┘   └──────────────┘   └──────────────┘
```

### Subscription Management

```typescript
// useRealtimeSync.ts - Optimized by Role

const ROLE_TABLE_MAP = {
  super_admin: ['*'], // All tables
  manager: ['sales', 'transactions', 'orders', 'handovers', 'stores', 'customers'],
  agent: ['sales', 'transactions', 'routes', 'store_visits', 'orders'],
  marketer: ['orders', 'customers', 'stores', 'transactions'],
  pos: ['sales', 'products'],
  customer: ['orders']
}

// Shared channel across components
let sharedChannel: RealtimeChannel | null = null

function ensureSharedChannel(role: string) {
  if (sharedChannel) return
  
  const tables = ROLE_TABLE_MAP[role] || []
  
  sharedChannel = supabase.channel('global-realtime-sync')
  
  tables.forEach(table => {
    sharedChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        // Invalidate affected queries
        const queryKeys = TABLE_QUERY_MAP[table]
        queryKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: [key] })
        })
      }
    )
  })
  
  sharedChannel.subscribe()
}
```

### Payload Filtering

```typescript
// Filter updates by user (for non-admins)
function shouldSkipForSubscriber(sub: RealtimeSubscriber, table: string, payload: any) {
  if (sub.isAdmin) return false
  
  const userId = sub.userId
  
  // Sales/Transactions: only if recorded_by matches
  if (table === 'sales' || table === 'transactions') {
    const recordedBy = payload.new?.recorded_by ?? payload.old?.recorded_by
    return recordedBy && recordedBy !== userId
  }
  
  // Handovers: only if involved
  if (table === 'handovers') {
    const sender = payload.new?.user_id ?? payload.old?.user_id
    const receiver = payload.new?.handed_to ?? payload.old?.handed_to
    return sender !== userId && receiver !== userId
  }
  
  return false
}
```

---

## Error Handling Patterns

### Global Error Handling

```typescript
// Error Boundary Pattern
class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error, errorInfo) {
    logError(error, { 
      context: 'ErrorBoundary',
      componentStack: errorInfo.componentStack 
    })
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}
```

### RPC Error Handling

```typescript
// Pattern: Try → Catch → Retry → Fail
async function safeRpcCall<T>(
  rpcName: string,
  params: any,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data, error } = await supabase.rpc(rpcName, params)
      if (error) throw error
      return data
    } catch (error) {
      lastError = error as Error
      
      // Exponential backoff
      if (i < maxRetries - 1) {
        await delay(1000 * Math.pow(2, i))
      }
    }
  }
  
  // All retries failed
  logError(lastError, { rpc: rpcName, params, retries: maxRetries })
  throw lastError
}
```

### User-Facing Error Messages

| Error Type | User Message | Action |
|------------|--------------|--------|
| Network Error | "You're offline. Changes saved locally." | Queue for sync |
| Validation Error | "Payment amount exceeds outstanding balance" | Block action |
| Auth Error | "Session expired. Please sign in again." | Redirect to auth |
| Server Error | "Something went wrong. Please try again." | Retry button |
| Credit Limit | "Credit limit exceeded. Contact admin." | Show contact |

---

## Performance Optimizations

### Query Optimization

```typescript
// 1. Use specific columns instead of *
// BAD
.select('*')

// GOOD
.select('id, name, outstanding, customers(name)')

// 2. Add pagination
const PAGE_SIZE = 100
const { data } = await supabase
  .from('sales')
  .select('*, stores(name)')
  .range(0, page * PAGE_SIZE - 1)
  .order('created_at', { ascending: false })

// 3. Use server-side filtering
.where('created_at', '>=', startDate)
.where('store_id', 'eq', storeId)

// 4. Use indexes (RLS policies use indexes)
// Index on: sales(recorded_by, created_at)
// Index on: stores(customer_id, is_active)
```

### Caching Strategy

```typescript
// React Query Cache Configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30 seconds
      cacheTime: 5 * 60_000, // 5 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    }
  }
})

// Specific query caching
const { data: sales } = useQuery({
  queryKey: ['sales', userId, dateRange], // Unique key
  queryFn: fetchSales,
  staleTime: 60_000, // 1 minute
})
```

### Code Splitting

```typescript
// Lazy load heavy components
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'))
const Reports = lazy(() => import('./pages/Reports'))

// Prefetch on hover
const prefetchDashboard = () => {
  const AgentDashboard = import('./pages/AgentDashboard')
}

// Route-based splitting
<Route path="/agent" element={
  <Suspense fallback={<Skeleton />}>
    <AgentDashboard />
  </Suspense>
} />
```

### Network Optimization

```typescript
// Debounce search inputs
const debouncedSearch = useDebouncedCallback((value) => {
  setSearchQuery(value)
}, 300)

// Batch mutations
const mutation = useMutation({
  mutationFn: async (items) => {
    // Batch multiple updates
    await Promise.all(items.map(item => updateItem(item)))
  }
})
```

---

## Monitoring & Debugging

### Logging Levels

```typescript
// lib/logger.ts
export const logLevels = {
  DEBUG: 0,   // Development only
  INFO: 1,    // Normal operations
  WARN: 2,    // Recoverable issues
  ERROR: 3,   // Failed operations
  FATAL: 4    // App crash
}

// Usage
logInfo('Sale recorded', { saleId, amount })
logError('RPC failed', { rpc: 'record_sale', error })
logWarn('Offline queue growing', { count: queueSize })
```

### Performance Metrics

```typescript
// Track critical paths
const measurePerformance = (name: string, fn: Function) => {
  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start
  
  logInfo('Performance', { 
    operation: name, 
    duration: `${duration.toFixed(2)}ms` 
  })
  
  return result
}
```

---

*Architecture documentation generated: 2026-04-12*
