# Auth Redesign — Phone-Centric, Single Source of Truth

## Problem

User creation is scattered across 4+ code paths (invite-staff, verify-otp-opensms, Auth.tsx client-side, resolve-user-identity), each manually creating profiles and roles differently. The `handle_new_user` DB trigger exists only in reference schemas — never deployed. AuthContext has redundant fetches, stale caching, and disconnected ban mechanisms.

## Design

### Principle

**One trigger creates every user. Edge functions only upgrade roles.**

### 1. DB Layer — `handle_new_user` trigger

Deploy the missing trigger. Every `INSERT ON auth.users` creates:
- `profiles` row (user_id, full_name, email, phone)
- `user_roles` row (user_id, role: 'customer')
- Auto-links `customers` table by phone number

Staff edge functions (invite-staff, verify-otp-opensms, google-staff-exchange) then **upgrade** the role from `customer` to the staff role — never create from scratch.

### 2. Phone OTP Flow — Simplified verify-otp-opensms

Current: 5-step identity cascade (invitations → staff_directory → user_roles → app_users → customers → onboarding)

New: 2 steps
1. Verify OTP → create/ensure auth user (trigger auto-creates profile + customer role)
2. Check `staff_invitations` by phone → if match, insert `staff_directory` + upsert `user_roles` to staff role
3. Return session + resolution type

Removed: manual profile insert, manual customer role insert, app_users legacy path, user_roles re-check, customers-by-user-id fallback.

### 3. Staff Invitation — invite-staff (mostly as-is)

- Email path: creates auth user (trigger creates profile/customer role) → upgrades to staff role + creates staff_directory
- Phone path: records staff_invitations row → picked up by verify-otp-opensms on first login

Removed: manual profile insert, manual user_roles insert (trigger handles it).

### 4. AuthContext — Unified

- `initAuth`: getSession → if session, call `fetchUserData` once
- `onAuthStateChange SIGNED_IN`: set user, call `fetchUserData` (debounced 300ms to coalesce rapid events)
- `fetchUserData`: single path via `resolve_user_identity` RPC → returns role, onboarding status
- Cache: IndexedDB with 5-min TTL
- Ban check: both `profiles.is_active` AND `auth.user.banned_until`
- Removed: `resolveUserType()` legacy fallback, double-fetch on init, manual per-table queries

### 5. Google OAuth Staff Path

- AuthContext checks post-login: if role is `customer` AND `staff_directory` has record for user's email → call `google-staff-exchange` → re-fetch user data
- Google OAuth for customers works normally (trigger handles it)

### 6. Ban — Unified

- `toggle-user-ban` edge function: sets BOTH `auth.users.ban_duration` AND `profiles.is_active`
- AuthContext: checks `profiles.is_active` in fetchUserData, throws USER_DISABLED
- Auth-level ban: Supabase SDK returns null session → auto-signout via onAuthStateChange

### 7. Onboarding

- `/onboarding` placeholder removed (was dead-end redirect)
- New customers go through Auth.tsx 2-step flow (Register → Add Store) which is already embedded there
- Staff skip onboarding entirely (role is set at invitation time)

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260613000001_handle_new_user_trigger.sql` | **New** — create trigger function + trigger |
| `supabase/functions/verify-otp-opensms/index.ts` | Simplify to 2-step identity resolution, remove manual profile/role creates |
| `supabase/functions/invite-staff/index.ts` | Remove manual profile/user_roles creates (trigger handles it) |
| `supabase/functions/google-staff-exchange/index.ts` | Already correct (upgrades role, doesn't create from scratch) |
| `supabase/functions/toggle-user-ban/index.ts` | Add `profiles.is_active` update |
| `src/contexts/AuthContext.tsx` | Single fetch, debounce, 5-min TTL cache, Google OAuth staff wiring, remove legacy fallback |
| `src/pages/Auth.tsx` | Minor: no changes to flow, just ensure compatibility |
| `src/pages/Onboarding.tsx` | Remove or simplify |
| `src/lib/authCache.ts` | Add TTL/expiry |
| `src/components/auth/ProtectedRoute.tsx` | Remove `/onboarding` redirect |

## Migration Plan

1. Deploy trigger migration first (non-breaking — only fires on future inserts)
2. Update edge functions (verify-otp-opensms, invite-staff, toggle-user-ban)
3. Update AuthContext + authCache
4. Clean up Onboarding.tsx
5. Full build + test

## Rollback

- Revert trigger: `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; DROP FUNCTION IF EXISTS handle_new_user;`
- Revert edge functions to previous versions
- Revert AuthContext changes
