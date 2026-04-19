# Mobile App Sync Tasks

## Summary
- ✅ Archived old mobile to `WASTE/mobile-old-20260419-071119/`
- ✅ Kept mobile-v2 as the active version (matches screenshot)
- 🔄 Need to rename mobile-v2 to mobile
- 🔄 Need to sync all security fixes and improvements from web

## Critical Sync Tasks

### 1. Security Fixes (High Priority)
- [ ] Sync offline queue permission validation
- [ ] Add credit limit validation to offline sales
- [ ] Update AgentRecord.tsx to use atomic record_transaction RPC
- [ ] Add sale date validation (30 days past, 1 day future)

### 2. Data Integrity (High Priority)
- [ ] Stock check is now atomic in RPC - remove client-side check
- [ ] Add business key collision fix with millisecond + salt
- [ ] Update proximity check to handle missing GPS

### 3. Error Handling (Medium Priority)
- [ ] Replace console.error with structured logging
- [ ] Add proper error boundaries
- [ ] Implement retry logic for failed operations

### 4. Feature Parity
- [ ] Sync offline queue improvements
- [ ] Add retry logic for realtime connections
- [ ] Implement request timeouts

## Files to Update in mobile-v2

### Agent Flow
- `/src/mobile-v2/pages/agent/AgentRecord.tsx` - Major updates needed
- `/src/mobile-v2/pages/agent/AgentHome.tsx` - Add permission checks
- `/src/mobile-v2/pages/agent/AgentRoutes.tsx` - Sync route session handling

### Shared Components
- `/src/mobile-v2/components/OfflineQueueStatus.tsx` - Create if missing
- `/src/mobile-v2/components/ConflictResolver.tsx` - Create if missing

### Hooks/Utils to Add
- `/src/mobile-v2/lib/offlineQueue.ts` - Sync with web version
- `/src/mobile-v2/lib/permissionCheck.ts` - Add permission validation
- `/src/mobile-v2/lib/offlineCreditValidation.ts` - Add credit limit offline

## Implementation Steps

### Phase 1: Security (Immediate)
1. Update AgentRecord.tsx to validate permissions before sync
2. Add offline credit limit validation
3. Use atomic RPC for transactions

### Phase 2: Data Integrity
1. Remove separate stock check (now in RPC)
2. Update business key generation
3. Add GPS fallback handling

### Phase 3: Polish
1. Add proper loading states
2. Implement retry mechanisms
3. Add error recovery

## Testing Checklist
- [ ] Sale records with credit limit validation
- [ ] Offline sale queuing
- [ ] Transaction recording
- [ ] Route session handling
- [ ] Stock check with insufficient stock
- [ ] GPS proximity checks
