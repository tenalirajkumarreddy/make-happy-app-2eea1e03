# BizManager Security & Robustness Concerns

**Analysis Date:** 2025-01-09

## Executive Summary

This analysis identifies critical security vulnerabilities, missing business logic validations, and robustness gaps in the BizManager codebase. Issues range from medium to high severity and should be prioritized for remediation.

---

## Critical Security Issues

### 1. Missing Authorization Checks in Offline Queue

**File:** `src/lib/offlineQueue.ts`

**Issue:** When syncing offline actions, the code does not verify that the current user still has permission to perform the action.

```typescript
// Lines 155-170: Sale sync
if (action.type === "sale") {
  const { saleData, saleItems } = action.payload as any;
  const { data: displayId } = await supabase.rpc("generate_display_id", {...});
  const { error } = await supabase.rpc("record_sale", {
    p_recorded_by: saleData.recorded_by,  // Uses queued user_id without verification
    // ...
  });
}
```

**Attack Vector:**
1. User records a sale while online (has permission at that time)
2. User's permissions are revoked by admin
3. User goes offline, then back online
4. Offline queue syncs with original `recorded_by` - sale is recorded despite revoked permissions

**Mitigation:** Re-validate permissions before executing queued actions:
```typescript
// Add permission check before sync
const hasPermission = await checkUserPermission(action.payload.recorded_by, action.type);
if (!hasPermission) {
  await markActionFailed(action.id, "Permission revoked");
  return;
}
```

---

### 2. Credit Limit Bypass via Race Condition

**File:** `src/pages/Sales.tsx` (lines 319-324)

**Issue:** Credit limit is checked on the client side before submission, but server-side enforcement in `record_sale` RPC uses the outstanding balance at the time of execution.

```typescript
// Client-side check (lines 319-324)
const creditLimitInfo = selectedStore && storeTypes && customers
  ? resolveCreditLimit(selectedStore, storeTypes, customers)
  : null;
const creditExceeded = creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit;
```

**Attack Vector:**
1. User opens sale dialog (current outstanding: ₹1000, limit: ₹5000)
2. User adds items totaling ₹4000 (new outstanding would be ₹5000)
3. Another user records a sale for same store (+₹1000) before submit
4. User submits - new outstanding becomes ₹6000, exceeding limit
5. Server-side check might not catch this if timing is right

**Status:** Server-side enforcement exists in `record_sale` RPC, but relies on row locking. Needs verification of locking behavior under concurrent load.

---

### 3. Store Access Control Gaps

**File:** `src/pages/Sales.tsx` (lines 149-172)

**Issue:** Query filters by warehouse but doesn't verify user has access to specific stores within that warehouse.

```typescript
let query = (supabase as any).from("sales").select("*");
if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
// Missing: verify user can access this specific store
if (!isAdmin) query = query.eq("recorded_by", user!.id);
```

**Impact:**
- Agent users might see sales from stores they shouldn't access
- Manager users can potentially access all stores in warehouse without explicit assignment

**Recommendation:** Apply store-level filtering based on `agent_routes` or `agent_store_types` tables.

---

### 4. Missing Input Sanitization

**File:** `src/pages/Auth.tsx` (lines 248-267)

**Issue:** Reverse geocoding response is used directly without sanitization:

```typescript
const data = await response.json();
if (data?.address) {
  const addr = data.address;
  const city = addr.city || addr.town || addr.village || addr.county || "";
  const area = addr.suburb || addr.neighbourhood || addr.road || "";
  // ... used directly in form state
}
```

**Risk:** XSS if API response contains malicious content.

**Recommendation:** Sanitize all external API responses before using in UI.

---

## Missing Business Logic Validations

### 1. Incomplete Stock Deduction Logic

**File:** `src/pages/Sales.tsx` (lines 428-456)

**Issue:** Stock check RPC is called but errors are logged and continue silently:

```typescript
const { data: stockCheck, error: stockError } = await (supabase as any)
  .rpc("check_stock_availability", {...});

if (stockError) {
  console.error("Stock check failed:", stockError);
  // Continue with sale - non-blocking
}
```

**Impact:** Sale can proceed even if stock check failed, potentially allowing overselling.

**Recommendation:** Make stock check blocking or implement post-sale reconciliation.

---

### 2. Date/Time Validation Missing

**File:** `src/pages/Sales.tsx` (lines 921-930)

**Issue:** Admin can set sale date via datetime-local input without validation:

```typescript
<div>
  <Label>Sale Date <span className="text-muted-foreground text-xs font-normal">(leave blank to use current time)</span></Label>
  <Input
    type="datetime-local"
    value={saleDate}
    onChange={(e) => setSaleDate(e.target.value)}
  />
</div>
```

**Missing Validations:**
- Future dates (could be accidental or fraudulent)
- Dates too far in the past
- Dates outside business hours

**Recommendation:** Add validation rules:
```typescript
const validateSaleDate = (date: string): boolean => {
  const saleDate = new Date(date);
  const now = new Date();
  const maxPast = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days
  return saleDate <= now && saleDate >= maxPast;
};
```

---

### 3. Payment Amount Validation Gap

**File:** `src/pages/Sales.tsx` (lines 1064-1067)

**Issue:** Payment inputs accept any numeric value without upper bound validation:

```typescript
<div className="grid grid-cols-2 gap-4">
  <div><Label>Cash (Rs)</Label><Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} /></div>
  <div><Label>UPI (Rs)</Label><Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} /></div>
</div>
```

**Missing Validations:**
- Maximum payment amount (could be data entry error)
- Cash + UPI > Total (caught for POS users but not admins)
- Negative amounts

---

### 4. Weak Proximity Check Bypass

**File:** `src/lib/proximity.ts` (lines 50-76)

**Issue:** Proximity check can be bypassed when store has no GPS coordinates:

```typescript
if (!storeLat || !storeLng) {
  return { withinRange: true, distance: null, userLocation: null, message: "...", skippedNoGps: true };
}
```

**Impact:** Agent can record sales for stores without GPS coordinates from any location.

**Recommendation:** Require GPS coordinates for all stores or escalate to manager approval when missing.

---

## Data Integrity Concerns

### 1. Business Key Collision Risk

**File:** `src/lib/offlineQueue.ts` (lines 141-175)

**Issue:** Business key for deduplication uses rounded timestamp (to minute), allowing collision:

```typescript
const minuteRounded = Math.floor(roundedTs / 60000) * 60000;
parts.push(String(minuteRounded));
return parts.join(':');  // e.g., "sale:store123:customer456:10000:1736400000000"
```

**Risk:** Two sales within the same minute with same store/customer/amount would be considered duplicates.

**Recommendation:** Include unique identifier or use millisecond precision with salt.

---

### 2. Incomplete Conflict Detection

**File:** `src/lib/conflictResolver.ts` (lines 269-394)

**Issue:** Conflict detection only checks specific scenarios, missing:
- User role changes (demotion, access revocation)
- Warehouse reassignment
- Store deletion
- Product price changes (partially implemented)

**Recommendation:** Expand conflict detection to cover all permission-related changes.

---

### 3. Stale Cache Risk in Realtime Sync

**File:** `src/hooks/useRealtimeSync.ts` (lines 121-147)

**Issue:** `shouldSkipForSubscriber` checks `payload.new?.recorded_by` which may be undefined for DELETE operations:

```typescript
if (table === "sales" || table === "transactions") {
  const recordedBy = payload.new?.recorded_by ?? payload.old?.recorded_by;
  if (recordedBy && recordedBy !== userId) return true;
}
```

**Risk:** DELETE events without `payload.new` would use `payload.old` but logic might skip necessary cache invalidations.

---

## Robustness Gaps

### 1. No Retry for Failed Realtime Connections

**File:** `src/hooks/useRealtimeSync.ts` (lines 182-189)

```typescript
sharedChannel.subscribe((status: string) => {
  if (status === 'SUBSCRIBED') {
    console.log('[Realtime] Subscribed to tables:', tables);
  } else if (status === 'CHANNEL_ERROR') {
    console.error('[Realtime] Channel error');
  }
});
```

**Issue:** No automatic reconnection logic for failed realtime subscriptions.

**Impact:** Users may not receive real-time updates after network interruption.

---

### 2. IndexedDB Transaction Failure Handling

**File:** `src/lib/offlineQueue.ts` (lines 71-101)

**Issue:** IndexedDB operations don't handle all failure scenarios:

```typescript
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {...};
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);  // Only handles explicit errors
  });
}
```

**Missing:**
- `onblocked` handler for upgrade blocking
- Storage quota exceeded handling
- Corrupted database recovery

---

### 3. Geolocation Error Handling Incomplete

**File:** `src/lib/capacitorUtils.ts` (lines 95-109)

```typescript
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const position = await Geolocation.getCurrentPosition({...});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch (error) {
    logError("Geolocation error", error);
    return null;
  }
}
```

**Issue:** Returns `null` on any error, losing error context. Callers can't distinguish between:
- Permission denied
- Timeout
- Position unavailable
- Unknown error

---

### 4. Missing Request Timeout

**File:** Multiple Supabase queries

**Issue:** No timeout configured for Supabase client:

```typescript
// src/integrations/supabase/client.ts
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
    // Missing: global fetch timeout
  }
);
```

**Impact:** Hanging requests could block UI indefinitely.

---

## Edge Function Security

### 1. CORS Origin Validation Too Permissive

**File:** `supabase/functions/invite-staff/index.ts` (lines 10-15)

```typescript
const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8100",
];
```

**Issue:** Multiple localhost ports suggest development/staging origins mixed with production.

**Risk:** If `getCorsHeaders` uses wildcard matching, CSRF attacks possible from malicious local sites.

---

### 2. Missing Rate Limiting on Staff Invitation

**File:** `supabase/functions/invite-staff/index.ts`

**Issue:** No rate limiting on `invite-staff` edge function.

**Attack Vector:** Brute force creation of staff accounts.

**Recommendation:** Implement rate limiting per caller:
```typescript
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_INVITES_PER_HOUR = 10;
```

---

### 3. Input Validation Gaps

**File:** `supabase/functions/invite-staff/index.ts` (lines 113-136)

**Issue:** Limited validation on input fields:

```typescript
const { email, phone, full_name, role, avatar_url } = body;

if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
  throw new Error("Missing required field: full_name");
}
```

**Missing:**
- Full name length limits
- Avatar URL validation (could be malicious URL)
- Role whitelist check (only validates against array, not actual database roles)

---

## Mobile-Specific Concerns

### 1. QR Code Scanning Without Validation

**File:** `src/components/shared/QrScanner.tsx`

**Issue:** QR scanner likely decodes and uses data without validation (file not analyzed but pattern observed).

**Risk:** Malicious QR codes could inject data or trigger unintended actions.

---

### 2. Camera Permission Handling Incomplete

**File:** `src/lib/capacitorUtils.ts` (lines 154-162)

```typescript
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const status = await Camera.requestPermissions();
    return status.camera === "granted";
  } catch (error) {
    logError("Camera permission error", error);
    return false;
  }
}
```

**Issue:** No guidance to user on how to manually enable if denied. Returns `false` without explanation.

---

## Database Concerns

### 1. RLS Policy Complexity

**Observation:** Multiple migration files show RLS policies being added incrementally (e.g., `20260317000001_customer_self_register_rls.sql`).

**Risk:** Complex RLS policy interactions could allow unauthorized access through edge cases.

**Recommendation:** Regular RLS policy audit using `supabase_get_advisors`.

---

### 2. Migration Ordering

**Observation:** Migration files use timestamp-based naming but some have same timestamp prefix with different suffixes (e.g., `20260412000001_staff_warehouse_scoping.sql` and `20260412000001_enforce_warehouse_scoping.sql`).

**Risk:** Potential for migration ordering conflicts.

---

## Recommendations Summary

### Immediate (High Priority)

1. **Add authorization checks in offline queue sync** - Security risk
2. **Fix stock check to be blocking** - Data integrity risk
3. **Add input validation for sale dates** - Fraud risk
4. **Implement retry logic for realtime connections** - Robustness

### Short-term (Medium Priority)

1. **Add store-level access control** - Security
2. **Sanitize external API responses** - Security
3. **Add request timeouts to Supabase client** - Robustness
4. **Improve geolocation error handling** - UX

### Long-term (Low Priority)

1. **Audit RLS policies** - Security
2. **Standardize validation patterns** - Maintainability
3. **Add comprehensive logging** - Observability
4. **Implement rate limiting** - Security
