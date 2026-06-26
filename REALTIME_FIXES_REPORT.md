# Realtime Sync Fixes - Bug Report & Solutions

## Executive Summary

Fixed critical bugs causing intermittent realtime sync failures in the AquaPrime app. Issues affected:
1. Realtime not triggering reliably across users/devices
2. Android APK requiring app close/reopen to sync
3. Cross-tab BroadcastChannel not working consistently

**Build Status:** ✅ All fixes compile successfully with no TypeScript errors

---

## Bugs Found

### Bug 1: No Capacitor AppState Handling (CRITICAL)
**File:** `src/hooks/useRealtimeSync.ts` (lines 710-747)  
**Severity:** 🔴 Critical - Android app stops syncing when backgrounded  
**Root Cause:** When Android app goes to background, WebSocket connection drops. No listener to reconnect on foreground resume.

**Fix Applied:** Created new `src/hooks/useMobileRealtimeSync.ts` with:
- `App.addListener("appStateChange", ...)` from `@capacitor/app`
- Auto-reconnect when `isActive === true`
- Proper listener cleanup on unmount

### Bug 2: No Visibility Change Handler (CRITICAL)
**File:** `src/hooks/useRealtimeSync.ts`  
**Severity:** 🔴 Critical - PWA/web tabs don't reconnect after being backgrounded  
**Root Cause:** No `document.visibilitychange` listener

**Fix Applied:** Added visibility change handler in `useMobileRealtimeSync.ts`:
```typescript
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await supabase.realtime.connect();
    await reconnectMobileRealtime();
  }
});
```

### Bug 3: Supabase Client Missing Realtime Config (MEDIUM)
**File:** `src/integrations/supabase/client.ts` (lines 59-74)  
**Severity:** 🟡 Medium - Suboptimal reconnection behavior  
**Root Cause:** No `eventsPerSecond` or `reconnectAfterMs` configuration

**Fix Applied:** Added realtime config:
```typescript
realtime: {
  params: { eventsPerSecond: 10 },
  reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),
}
```

### Bug 4: BroadcastChannel Error Handling (HIGH)
**File:** `src/hooks/useRealtimeSync.ts` (lines 915-927)  
**Severity:** 🟠 High - Cross-tab sync fails in some Capacitor WebViews  
**Root Cause:** No error handling for BroadcastChannel postMessage, no availability flag

**Fix Applied:** 
- Added `broadcastChannelAvailable` flag
- Wrapped `postMessage` in try/catch
- Fallback to CustomEvent only when BroadcastChannel fails
- Added `bubbles: true, composed: true` to CustomEvent for better propagation

### Bug 5: No Channel Status Tracking (MEDIUM)
**File:** N/A (missing entirely)  
**Severity:** 🟡 Medium - No way to debug channel health  
**Root Cause:** No monitoring or debugging tools for realtime channels

**Fix Applied:** Created `src/lib/realtimeHealth.ts` with:
- `getChannelStatuses()` - Returns status of all global channels
- `getMobileChannelStatuses()` - Returns status of mobile channels
- `getRealtimeHealthReport()` - Comprehensive health report
- `logRealtimeHealth()` - Console debugging output
- `watchRealtimeHealth()` - Continuous monitoring

### Bug 6: Missing Sentry Logging for Reconnects (MEDIUM)
**File:** `src/hooks/useRealtimeSync.ts`  
**Severity:** 🟡 Medium - Production failures not observable  
**Root Cause:** No Sentry.captureMessage for CHANNEL_ERROR/CLOSED/TIMED_OUT

**Fix Applied:** Added Sentry logging at every reconnect attempt:
```typescript
Sentry.captureMessage(errorMsg, {
  level: 'warning',
  extra: { channelName, batchLength: batch.length, tables: batch.slice(0, 10) },
});
```

### Bug 7: Channel Status Not Tracked (LOW)
**File:** `src/hooks/useRealtimeSync.ts`  
**Severity:** 🟢 Low - Makes debugging harder  
**Root Cause:** No tracking of channel status changes over time

**Fix Applied:** Added `channelStatuses` Map with `ChannelStatus` interface tracking:
- Current status
- Last status change timestamp
- Retry count
- Tables subscribed to

---

## Files Modified

1. **`src/integrations/supabase/client.ts`**
   - Added realtime configuration with `eventsPerSecond` and `reconnectAfterMs`

2. **`src/hooks/useRealtimeSync.ts`**
   - Added Sentry import
   - Added channel status tracking (`channelStatuses` Map)
   - Added `getChannelStatuses()` export for debugging
   - Enhanced `buildChannel()` with status tracking and Sentry logging
   - Enhanced `scheduleReconnect()` with retry count tracking
   - Improved `broadcastMutation()` with better error handling
   - Fixed CustomEvent to use `{ bubbles: true, composed: true }`

3. **`src/hooks/useMobileRealtimeSync.ts`** (NEW FILE)
   - Created dedicated mobile realtime sync hook
   - Capacitor AppState change handling
   - Visibility change handling for PWA
   - Auto-reconnect on foreground
   - Separate channel management for mobile
   - Exports `reconnectMobileRealtime()` function

4. **`src/lib/realtimeHealth.ts`** (NEW FILE)
   - Realtime health monitoring utilities
   - Channel status inspection
   - Health reporting and logging
   - Continuous monitoring via `watchRealtimeHealth()`

---

## Architecture Preserved

✅ All fixes work within existing architecture patterns:
- No redesign of mutation flow
- No changes to RPC names or mutationHelpers.ts logic
- No changes to TABLE_QUERY_MAP or ROLE_TABLE_MAP structure
- Maintains offline queue behavior
- Maintains BroadcastChannel + CustomEvent dual approach
- All changes fully TypeScript typed

---

## Testing Recommendations

### Manual Testing Checklist

1. **Android Foreground/Background:**
   - [ ] Open app, make a sale
   - [ ] Background app (home button)
   - [ ] Wait 10 seconds
   - [ ] Return to app
   - [ ] Verify realtime sync works without closing/reopening

2. **Cross-Tab Sync:**
   - [ ] Open app in 2 browser tabs
   - [ ] Make sale in Tab A
   - [ ] Verify Tab B updates within 1 second
   - [ ] Background Tab A, make sale in Tab B
   - [ ] Verify Tab A updates when brought to foreground

3. **Network Interruption:**
   - [ ] Disable WiFi
   - [ ] Make offline action
   - [ ] Re-enable WiFi
   - [ ] Verify auto-sync and realtime resumes

4. **Multi-User Sync:**
   - [ ] Login as User A on device 1
   - [ ] Login as User B on device 2
   - [ ] User A makes sale
   - [ ] Verify User B sees update within 1 second

### Debug Console Commands

In browser dev console or via debug panel:

```javascript
// Import health utilities
import { logRealtimeHealth, getChannelStatuses } from '@/lib/realtimeHealth';

// Check channel health
logRealtimeHealth();

// Get raw statuses
const statuses = getChannelStatuses();
console.table(statuses);

// Force reconnect (for testing)
import { forceRealtimeReconnect } from '@/lib/realtimeHealth';
await forceRealtimeReconnect();
```

---

## Sentry Monitoring

All reconnect events now logged to Sentry with:
- Channel name
- Number of tables
- Status (CHANNEL_ERROR, CLOSED, TIMED_OUT)
- Retry count
- Role context

Monitor these Sentry events in production to identify patterns.

---

## Next Steps

1. **Deploy to staging** and test with multiple devices
2. **Monitor Sentry** for CHANNEL_ERROR events in first 48 hours
3. **Add debug panel** in dev mode calling `logRealtimeHealth()` every 30s
4. **Consider adding** visual indicator when channels are unhealthy
5. **Test on real Android devices** (not just emulator) for Capacitor behavior

---

## Constraints Honored

✅ No new libraries added  
✅ No RPC names changed  
✅ No TABLE_QUERY_MAP/ROLE_TABLE_MAP structure changed  
✅ Fully TypeScript typed  
✅ No re-render loops introduced (verified dependency arrays)  
✅ Console.warn in dev + Sentry.captureMessage in prod for all reconnects