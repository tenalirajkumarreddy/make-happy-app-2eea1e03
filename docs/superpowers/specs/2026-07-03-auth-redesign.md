# Customer Auth Flow Redesign

**Date**: 2026-07-03
**Project**: Aqua Prime (BizManager)
**Type**: UX Redesign

## Problem Statement

The existing customer authentication had a **3-step login process** (phone → register → add store) all happening within the `/auth` page. This was confusing for returning users who just wanted to log in. Additionally, the phone input didn't enforce a `+91` prefix, the OTP input was a single text box, and error messages were generic ("edge function error" instead of actionable feedback like "Wrong OTP").

## Changes Implemented

### 1. New 6-Digit OTP Input Component

**File**: `src/components/auth/OTPInput.tsx`

- **6 separate input boxes** for each digit
- **Auto-focus navigation**: Arrow keys, Backspace, Delete
- **Paste support**: Automatically distributes digits across all boxes
- **Visual feedback**: Focus ring, error state with shake animation
- **Accessibility**: Proper aria-labels for each box

### 2. Simplified Login Page

**File**: `src/pages/Auth.tsx`

**Before**: 3-step flow (phone → register name → add store) all on the same page
**After**: Clean 2-step flow (phone → OTP) only

**Phone Input Changes**:
- `+91` prefix is now **hardcoded and visible** as a non-editable prefix
- Input is restricted to exactly **10 digits**
- Auto-strips non-digits

**OTP Input Changes**:
- Replaced single text input with the **new 6-box OTPInput component**
- Added **60-second countdown timer** for resending OTP
- "Resend OTP" button appears only after the countdown finishes

**Error Handling**:
- Maps specific backend errors to user-friendly messages:
  - `Invalid OTP` / `verify` / `expired` → `"Wrong OTP. Please check the code and try again."`
  - `rate limit` / `Too many` → `"Too many attempts. Please wait a moment before trying again."`
  - `not configured` / `env` → `"Service temporarily unavailable. Please try again later."`
  - Generic network errors → `"Network issue. Please check your connection and try again."`
- Errors are displayed **inline** below the form instead of only via toast

### 3. New Customer Onboarding Page

**File**: `src/pages/AuthOnboarding.tsx`

Moved the registration and store creation steps from the login page to a **dedicated post-login onboarding page** (`/auth/onboarding`).

**Onboarding Flow**:
1. **Step 1 (Profile)**: Enter full name
2. **Step 2 (Store)**: Enter store name, capture GPS location, add address
3. **On submit**: Creates customer, profile, user_roles, and store records atomically

**Key Fix**: The `onboarding_complete` flag is now only set to `true` **after all onboarding steps are finished**. Previously, it was set too early (after name entry), which could cause issues if the user abandoned the flow before adding their store.

**Auth Guards**:
- Redirects to `/auth` if not logged in
- Redirects to `/` if logged in but doesn't need onboarding
- Shows loading spinner while auth state is being determined

### 4. Updated Routing

**File**: `src/App.tsx`

```tsx
<Route path="/auth" element={<Auth />} />
<Route path="/auth/onboarding" element={<AuthOnboarding />} />
```

### 5. Updated Auth Context

**File**: `src/contexts/AuthContext.tsx`

- When `needsOnboarding` is `true`, users are redirected to `/auth/onboarding`
- When `needsOnboarding` is `false` and the user is a customer, they go to `/`
- Staff role redirects remain unchanged

### 6. Updated Protected Route

**File**: `src/components/auth/ProtectedRoute.tsx`

-_ns: When a logged-in user with `needsOnboarding` tries to access a protected route, they are now redirected to `/auth/onboarding` instead of `/auth`.

## User Flow Summary

```
New Customer:
  /auth → Enter +91 phone + Get OTP → Enter 6-digit OTP → /auth/onboarding → Name → Store → /

Returning Customer:
  /auth → Enter +91 phone + Get OTP → Enter 6-digit OTP → /
```

## Files Modified

| File | Changes |
|---|---|
| `src/pages/Auth.tsx` | Complete rewrite with 2-step flow, +91 prefix, 6-box OTP, countdown timer |
| `src/pages/AuthOnboarding.tsx` | New page for post-login customer onboarding |
| `src/components/auth/OTPInput.tsx` | New reusable 6-digit OTP input component |
| `src/App.tsx` | Added `/auth/onboarding` route |
| `src/contexts/AuthContext.tsx` | Redirect to `/auth/onboarding` for new customers |
| `src/components/auth/ProtectedRoute.tsx` | Redirect to `/auth/onboarding` for onboarding users |
| `src/index.css` | Added shake animation for OTP error state |
