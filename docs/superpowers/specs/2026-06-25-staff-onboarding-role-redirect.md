# Staff Onboarding, Role Dashboards & Session Kill

**Date:** 2026-06-25  
**Status:** Design Approved, Awaiting Implementation  
**Scope:** Backend + Frontend (no SMS provider changes)  

## 1. Problem Statement

### Current Gaps
1. **No session kill on disable:** When an admin toggles `profiles.is_active` to `false` in `StaffDirectory.tsx` or `AdminStaffDirectory.tsx`, the disabled user remains logged in for up to 1 hour until their Supabase auth token expires.
2. **No role-aware first redirect:** Staff members logging in for the first time (who were pre-registered by admin via `invite-staff`) land on the generic auth page instead of their role-specific dashboard.
3. **Race condition in auth flow:** `AuthContext` resolves the user role asynchronously, but `ProtectedRoute` may render children before the role is known, causing a brief flash of the wrong page or redirect loop.

### Existing Infrastructure
- `supabase/functions/toggle-user-ban/index.ts` — Already implements auth ban/unban + `profiles.is_active` sync. Currently unused by the UI.
- `supabase/functions/invite-staff/index.ts` — Pre-registers staff in `staff_directory` table.
- `supabase/functions/resolve-user-identity/index.ts` — Resolves role from `staff_directory`, `user_roles`, or `customers`.
- `AuthContext.tsx` — Already checks `profiles.is_active` and signs out disabled users, but only on token refresh (~1 hour).

---

## 2. Goals

### 2.1 Session Kill (Disable Staff)
**As an admin, when I disable a staff member in the staff directory, all their active sessions across all devices must be killed immediately (within seconds).**

**Acceptance Criteria:**
- [ ] `StaffDirectory.tsx` "Disable" action calls `toggle-user-ban` edge function with `ban: true`
- [ ] `AdminStaffDirectory.tsx` "Save" action (when deactivating) calls `toggle-user-ban` with `ban: true`
- [ ] Both pages also update `staff_directory.is_active` to keep the directory in sync
- [ ] Disabled user is immediately signed out on all devices
- [ ] Disabled user cannot log in again until re-enabled
- [ ] Re-enabling a staff member calls `toggle-user-ban` with `ban: false`

### 2.2 Auth Heartbeat (Active Session Enforcement)
**As a logged-in user, if an admin disables my account while I'm using the app, I must be signed out within 30 seconds.**

**Acceptance Criteria:**
- [ ] `AuthContext` polls `profiles.is_active` every 30 seconds
- [ ] If `is_active === false`, call `supabase.auth.signOut()` immediately
- [ ] No unnecessary polling when user is not logged in
- [ ] Cleanup interval on unmount to prevent memory leaks

### 2.3 Role-Aware First-Time Redirect
**As a staff member logging in for the first time, I must be redirected to my role's dashboard instead of the generic auth page.**

**Acceptance Criteria:**
- [ ] After successful OTP verification, if `resolve_user_identity` returns a staff role, redirect to the role's dashboard route
- [ ] If existing customer, redirect to `/` (customer portal)
- [ ] If new customer (`needsOnboarding === true`), stay on `/auth` and show register + add-store steps
- [ ] The redirect must happen AFTER `AuthContext.fetchUserData()` resolves, not before

### 2.4 Loading Guard
**As a user, I must not see a flash of the wrong page while my role is being resolved.**

**Acceptance Criteria:**
- [ ] `ProtectedRoute` already shows a loading spinner while `loading === true` — verify this blocks rendering correctly
- [ ] `Auth.tsx` loading screen is shown during the entire auth resolution process
- [ ] No race condition where `role === null` causes a redirect to `/auth` for a valid staff user

---

## 3. Architecture

### 3.1 Disable Staff Flow (Session Kill)

```
Admin clicks "Disable" on StaffCard
    │
    ▼
StaffDirectory.handleToggleActive()
    │
    ├─► supabase.functions.invoke("toggle-user-ban", { user_id, ban: true })
    │       │
    │       Edge Function:
    │       1. adminClient.auth.admin.updateUserById(ban_duration: "876600h")
    │       2. profiles.update({ is_active: false })
    │       3. (Optional) staff_directory.update({ is_active: false })
    │
    ├─► supabase.from("staff_directory").update({ is_active: false })
    │
    ├─► supabase.from("profiles").update({ is_active: false })
    │       │
    │       Supabase Realtime broadcasts change
    │       │
    │       AuthContext heartbeat (30s poll)
    │       detects is_active === false
    │       → calls signOut()
    │
    ▼
All devices: onAuthStateChange → user null → redirect to /auth
```

### 3.2 First-Time Staff Login Flow (Role Redirect)

```
User enters phone → Send OTP (send-otp-opensms)
    │
    ▼
User enters OTP → Verify OTP (verify-otp-opensms)
    │
    ├─► Edge function resolves identity:
    │       - Check staff_directory by phone
    │       - Check user_roles
    │       - Check customers
    │
    ▼
Supabase session created
    │
    ▼
AuthContext.onAuthStateChange → fetchUserData(userId)
    │
    ├─► resolve_user_identity RPC
    │       │
    │       Returns: { role: "agent", onboarding_required: false }
    │       (or "manager", "marketer", "operator", "super_admin")
    │
    ▼
AuthContext sets role = "agent"
    │
    ▼
AuthContext checks role and navigates:
    ├─ role === "agent" → window.location.href = "/agent"
    ├─ role === "marketer" → window.location.href = "/marketer"
    ├─ role === "operator" → window.location.href = "/pos"
    ├─ role === "manager" || "super_admin" → window.location.href = "/"
    └─ role === "customer" → window.location.href = "/"
```

---

## 4. Component Design

### 4.1 `StaffDirectory.tsx`

**Current `handleToggleActive`:**
```typescript
const handleToggleActive = async (userId: string, active: boolean) => {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: active } as any)
      .eq("user_id", userId as any);
    if (error) throw error;
    toast.success(`Staff ${active ? "activated" : "deactivated"}`);
    queryClient.invalidateQueries({ queryKey: ["staff-directory-enriched"] });
  } catch (error) {
    toast.error("Failed to update status");
  }
};
```

**Required changes:**
- Add loading state per card (`disablingId: string | null`)
- Call `toggle-user-ban` before updating local tables
- Update `staff_directory.is_active` in addition to `profiles.is_active`
- Handle errors gracefully (if `toggle-user-ban` fails, don't update local state)

**New `handleToggleActive`:**
```typescript
const [disablingId, setDisablingId] = useState<string | null>(null);

const handleToggleActive = async (userId: string, currentActive: boolean) => {
  setDisablingId(userId);
  try {
    // 1. Kill/allow Supabase auth sessions
    const { error: banError } = await supabase.functions.invoke("toggle-user-ban", {
      body: { user_id: userId, ban: !currentActive },
    });
    if (banError) throw banError;

    // 2. Update staff_directory
    const { error: dirError } = await supabase
      .from("staff_directory")
      .update({ is_active: !currentActive })
      .eq("user_id", userId);
    if (dirError) throw dirError;

    // 3. Update profiles (idempotent — toggle-user-ban already did this)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_active: !currentActive })
      .eq("user_id", userId);
    if (profileError) throw profileError;

    toast.success(`Staff ${!currentActive ? "activated" : "deactivated"}`);
    queryClient.invalidateQueries({ queryKey: ["staff-directory-enriched"] });
  } catch (err: any) {
    toast.error(err.message || "Failed to update status");
  } finally {
    setDisancyId(null);
  }
};
```

### 4.2 `AdminStaffDirectory.tsx`

**Current `handleSave`:**
```typescript
const handleSave = async () => {
  // ... updates staff_directory, user_roles, profiles ...
  toast.success("Staff updated");
  // Missing: toggle-user-ban call
};
```

**Required changes:**
- After updating `staff_directory`, `user_roles`, and `profiles`, call `toggle-user-ban`
- Only call when `formActive` (the target state) differs from `editingStaff.is_active` (the current state)

```typescript
const handleSave = async () => {
  if (!editingStaff) return;
  setFormSaving(true);
  try {
    // ... existing updates to staff_directory, user_roles, profiles ...

    // NEW: Call toggle-user-ban if active status changed
    if (formActive !== editingStaff.is_active) {
      const { error: banError } = await supabase.functions.invoke("toggle-user-ban", {
        body: { user_id: editingStaff.user_id, ban: !formActive },
      });
      if (banError) throw banError;
    }

    toast.success("Staff updated");
    qc.invalidateQueries({ queryKey: ["staff-directory"] });
    setEditingStaff(null);
  } catch (err: any) {
    toast.error(err.message || "Error updating staff");
  } finally {
    setFormSaving(false);
  }
};
```

### 4.3 `AuthContext.tsx` — Heartbeat

**Add inside `AuthProvider`:**

```typescript
useEffect(() => {
  if (!user) return;

  const interval = setInterval(async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("user_id", user.id)
        .single();

      if (data && !data.is_active) {
        await signOut();
      }
    } catch (e) {
      logError("Auth heartbeat failed", e);
    }
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, [user, signOut]);
```

### 4.4 `AuthContext.tsx` — Role-Aware Redirect

**Add inside `fetchUserData`, after role is resolved:**

```typescript
const ROLE_DASHBOARD_MAP: Record<string, string> = {
  super_admin: "/",
  manager: "/",
  agent: "/agent",
  marketer: "/marketer",
  operator: "/pos",
  customer: "/",
};

// After setting role, profile, customer, needsOnboarding:
if (resolvedRole && resolvedRole !== "customer") {
  const target = ROLE_DASHBOARD_MAP[resolvedRole];
  if (target && window.location.pathname !== target) {
    window.location.href = target; // Force redirect, bypass React Router state
  }
} else if (resolvedCustomer) {
  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
} else if (needsOnboarding) {
  // Let Auth.tsx handle the onboarding UI state
}
```

**Important:** Use `window.location.href` instead of `navigate()` from React Router to force a full page reload, which avoids the race condition between React Router's internal state and the auth context.

### 4.5 `ProtectedRoute.tsx` — Verify Loading Guard

**Current implementation already correct — no changes needed:**
```typescript
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, needsOnboarding, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/auth" replace />;

  return <>{children}</>;
}
```

**Verification:** Ensure `<Suspense>` in `App.tsx` wraps `AppShell` so that lazy-loaded components don't render before `ProtectedRoute` has a chance to redirect.

---

## 5. Edge Functions

### 5.1 `toggle-user-ban` (No changes needed)

Already correctly handles both ban and unban:

```typescript
if (ban) {
  await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
  await adminClient.from("profiles").update({ is_active: false }).eq("user_id", user_id);
} else {
  await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
  await adminClient.from("profiles").update({ is_active: true }).eq("user_id", user_id);
}
```

**Verification needed:** Ensure this function is deployed and accessible.

---

## 6. Data Flow & State Management

### 6.1 State Changes on Disable

| Table | Before | After | Source |
|---|---|---|---|
| `profiles.is_active` | `true` | `false` | `toggle-user-ban` edge function + UI update |
| `staff_directory.is_active` | `true` | `false` | UI update in `StaffDirectory.tsx` / `AdminStaffDirectory.tsx` |
| `auth.users.banned` | `false` | `true` (876600h) | `toggle-user-ban` edge function |

### 6.2 State Changes on Enable

| Table | Before | After | Source |
|---|---|---|---|
| `profiles.is_active` | `false` | `true` | `toggle-user-ban` edge function + UI update |
| `staff_directory.is_active` | `false` | `true` | UI update |
| `auth.users.banned` | `true` | `false` | `toggle-user-ban` edge function |

---

## 7. Error Handling

| Scenario | Expected Behavior |
|---|---|
| `toggle-user-ban` fails (network) | Show toast error, do NOT update local state, keep card in current state |
| `toggle-user-ban` succeeds but `profiles` update fails | Log error, toast success for auth ban but warn about profile sync |
| User is disabled while offline | Heartbeat won't fire until online, but auth token will still be invalid on next API call |
| Admin tries to disable themselves | Edge function should allow it, but UI should warn "You are about to disable your own account" |
| Re-enabling a banned user | `toggle-user-ban` with `ban: false` sets `ban_duration: "none"`, user can log in again |

---

## 8. Testing Strategy

### 8.1 Unit Tests
- `toggle-user-ban` edge function: mock `auth.admin.updateUserById` and verify correct params
- `AuthContext` heartbeat: mock `setInterval` and verify `signOut` is called when `is_active === false`

### 8.2 Integration Tests
- Pre-register staff via `invite-staff`, log in with that phone, verify redirect to role dashboard
- Disable staff via `StaffDirectory`, verify `profiles.is_active === false` and `auth.users.banned === true`
- From disabled user's device, verify kicked out within 30 seconds
- Re-enable staff, verify can log in again

### 8.3 Manual Tests
- Disable staff on one device, verify signed out on another device within 30s
- Disable admin's own account, verify can still re-enable (emergency recovery)

---

## 9. Out of Scope

- **OpenSMS → HTTPsms migration:** Will be handled in a separate PR after this work is complete.
- **New admin UI for staff management:** Reuse existing `StaffDirectory.tsx` and `AdminStaffDirectory.tsx`.
- **Email-based staff invitation flow:** Already handled by `invite-staff` edge function.
- **Realtime subscription for `profiles` changes:** Polling is sufficient for this use case.

---

## 10. File Change Summary

| File | Change Type | Description |
|---|---|---|
| `src/pages/StaffDirectory.tsx` | Modify | Wire `toggle-user-ban` in `handleToggleActive`, add `staff_directory` sync, add loading state |
| `src/pages/AdminStaffDirectory.tsx` | Modify | Wire `toggle-user-ban` in `handleSave` when active status changes |
| `src/contexts/AuthContext.tsx` | Modify | Add heartbeat interval (30s), add role-aware redirect after `fetchUserData` |
| `supabase/functions/toggle-user-ban/index.ts` | Verify | Ensure deployed and handles `ban: false` correctly (no code changes expected) |
| `src/components/auth/ProtectedRoute.tsx` | Verify | Confirm loading state blocks rendering (no changes expected) |
| `src/App.tsx` | Verify | Confirm `<Suspense>` wraps `<AppShell>` inside `<ProtectedRoute>` (no changes expected) |

---

## 11. Rollback Plan

If issues arise:
1. Revert `StaffDirectory.tsx` and `AdminStaffDirectory.tsx` changes — staff can still be disabled via Supabase dashboard
2. Remove heartbeat `useEffect` from `AuthContext.tsx` — reverts to previous behavior (1-hour token expiry)
3. Remove role redirect from `AuthContext.tsx` — reverts to generic auth flow

---

## 12. Post-Implementation

After this is merged and verified:
1. **HTTPsms migration** — Separate PR to swap `send-otp-opensms` → `send-otp-httpsms`
2. **Realtime for profiles** — Optional: replace 30s polling with Supabase Realtime subscription on `profiles` table
3. **Audit logging** — Log all disable/enable actions to an admin activity log table
