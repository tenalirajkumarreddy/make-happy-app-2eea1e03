# Phone OTP Re-enablement - Complete Context

## Current Supabase State (Based on Live Database)

### ✅ What's Already Working
1. **User Base**: 7 users total, all with phone numbers verified
2. **OTP Infrastructure**: 
   - `otp_sessions` table exists (51 total sessions)
   - Recent activity: 19 OTP sessions in last 7 days (14 verified)
   - Last OTP sent: April 4, 2026 at 08:02 UTC
3. **Custom OTP System**: Legacy edge function-based OTP using `otp_sessions` + `sms_jobs` tables
4. **Settings**: 
   - Customer signup: ✅ Enabled
   - Google linking: ✅ Enabled

### ⚠️ Security Advisories Found

**1. Overly Permissive RLS Policy** (HIGH PRIORITY)
- **Table**: `public.otp_sessions`
- **Policy**: "Anonymous users can manage OTP sessions" (ALL operations)
- **Issue**: Uses `USING (true)` and `WITH CHECK (true)` - bypasses RLS entirely
- **Risk**: Anonymous users can read/modify all OTP sessions
- **Remediation**: https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

**2. Leaked Password Protection Disabled**
- Password breach detection via HaveIBeenPwned is turned off
- Recommendation: Enable in Auth settings

## Two Approaches Available

### Approach 1: Use Supabase Native Phone Auth (NEW - What I Implemented)
**Pros:**
- No edge functions needed
- Built-in rate limiting
- Multiple SMS provider options
- Simpler code

**Cons:**
- Requires SMS provider configuration (costs money)
- Creates separate auth system from existing `otp_sessions` table
- All 7 existing users would need to re-verify if migrating

**Status**: ✅ Code already updated in `src/pages/Auth.tsx`

**Next Steps:**
1. Configure SMS provider in Supabase Dashboard
2. Decide: Keep both systems or migrate fully?

### Approach 2: Re-enable Existing Edge Function System (OLD)
**What's Already Built:**
- ✅ `public.otp_sessions` table with 51 sessions
- ✅ `public.sms_jobs` table with 56 jobs  
- ✅ `public.otp_rate_limits` table for throttling
- ✅ Edge functions: `send-otp-opensms`, `verify-otp-opensms`
- ✅ OpenSMS gateway URL configured in .env
- ✅ Working until recently (last OTP 10 hours ago)

**Pros:**
- Already proven to work with your user base
- Uses OpenSMS Android relay (free SMS)
- Existing users already authenticated this way
- More control over OTP logic

**Cons:**
- Requires edge functions (was disabled to simplify)
- More moving parts to maintain

**To Re-enable:**
1. Uncomment/restore edge function code
2. Update Auth.tsx to call edge functions instead of native auth
3. Fix the RLS policy security issue first

## Recommended Action Plan

### Option A: Full Migration to Supabase Native Auth ⭐ (Recommended for Dev)
1. ✅ Already done: Updated Auth.tsx with native phone auth
2. Configure test mode SMS in Supabase (no cost for dev)
3. Gradually migrate existing users to native auth
4. Keep `otp_sessions` table for audit/transition period

### Option B: Hybrid Approach
1. Use Supabase native auth for NEW customers
2. Keep edge function system for existing 7 users
3. Gradually sunset custom OTP system

### Option C: Re-enable Custom OTP System
1. Fix RLS policy on `otp_sessions` first (CRITICAL)
2. Re-enable edge functions
3. Update Auth.tsx to use edge functions
4. Continue with OpenSMS gateway

## Immediate Security Fix Required

**Regardless of approach chosen, fix this NOW:**

```sql
-- CRITICAL: Replace overly permissive RLS policy
DROP POLICY IF EXISTS "Anonymous users can manage OTP sessions" ON public.otp_sessions;

-- New secure policies
CREATE POLICY "Users can create OTP sessions"
  ON public.otp_sessions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can read own OTP session"
  ON public.otp_sessions
  FOR SELECT
  TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::json->>'session_token');

CREATE POLICY "Users can update own OTP session"
  ON public.otp_sessions
  FOR UPDATE
  TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::json->>'session_token')
  WITH CHECK (session_token = current_setting('request.jwt.claims', true)::json->>'session_token');
```

## What I've Done

### Files Modified
1. ✅ `src/pages/Auth.tsx` - Added Supabase native phone OTP UI
2. ✅ `PHONE_OTP_SETUP.md` - Complete setup guide
3. ✅ This context document

### Code Changes
- Added state: `phoneNumber`, `otpCode`, `otpSent`
- Added handlers: `handleSendOtp()`, `handleVerifyOtp()`
- Updated UI to show phone input → OTP verification flow
- Uses `supabase.auth.signInWithOtp()` and `supabase.auth.verifyOtp()`

## Your Decision Needed

**Which approach do you prefer?**

1. **Go Native** (my implementation): Configure Supabase SMS provider, use native auth
2. **Restore Custom**: Re-enable edge functions + OpenSMS, revert my changes  
3. **Hybrid**: Keep both systems running in parallel

Let me know and I'll help you complete the setup!
