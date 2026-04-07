# Google OAuth Configuration Guide

## Overview
This guide provides step-by-step instructions to configure Google OAuth for staff authentication in the Aqua Prime (Make Happy App) application.

## Current Status
- ⚠️ **BLOCKER**: Google OAuth redirect URIs need manual configuration in Supabase dashboard
- **Impact**: Staff members cannot sign in with Google accounts until this is configured
- **Priority**: HIGH
- **Estimated Time**: 5-10 minutes

---

## Required Redirect URIs

The following redirect URIs must be configured in both **Google Cloud Console** and **Supabase Auth Settings**:

### Production URLs:
```
https://aquaprimesales.vercel.app
https://vrhptrtgrpftycvojaqo.supabase.co/auth/v1/callback
```

### Development/Testing URLs:
```
http://localhost:5000
http://localhost:5173
http://localhost:8100
```

---

## Configuration Steps

### Step 1: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one if needed)
3. Navigate to **APIs & Services** → **Credentials**
4. Find or create an **OAuth 2.0 Client ID** for Web application
5. Under **Authorized redirect URIs**, add:
   ```
   https://vrhptrtgrpftycvojaqo.supabase.co/auth/v1/callback
   ```
6. Save the changes
7. Copy the **Client ID** and **Client Secret** (you'll need these for Supabase)

### Step 2: Configure Supabase Auth Settings

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **NEWZ** (`vrhptrtgrpftycvojaqo`)
3. Navigate to **Authentication** → **Providers**
4. Find **Google** provider and enable it
5. Enter the **Client ID** and **Client Secret** from Step 1
6. Under **Site URL**, set:
   ```
   https://aquaprimesales.vercel.app
   ```
7. Under **Redirect URLs**, add all URLs:
   ```
   https://aquaprimesales.vercel.app
   https://aquaprimesales.vercel.app/**
   http://localhost:5000
   http://localhost:5173
   http://localhost:8100
   capacitor://localhost
   ```
8. Save the configuration

### Step 3: Verify Edge Function

The `google-staff-exchange` edge function is already configured and ready to handle Google OAuth:
- **Location**: `supabase/functions/google-staff-exchange/index.ts`
- **Purpose**: Links Google accounts to staff_directory entries by email
- **Security**: Validates JWT tokens, prevents unauthorized access

---

## How It Works

### Authentication Flow:

1. **User clicks "Sign in with Google"** on Auth page
2. **Google OAuth redirect** → User authenticates with Google
3. **Supabase Auth callback** → Creates/signs in Supabase user with Google identity
4. **Edge function `google-staff-exchange`** is called:
   - Validates JWT token
   - Looks up email in `staff_directory`
   - Links Google account to staff profile
   - Assigns appropriate role (super_admin, manager, agent, marketer, pos)
5. **User redirected to dashboard** with correct role-based access

### Security Features:

- ✅ JWT validation on all edge function calls
- ✅ Email-based staff verification
- ✅ Role assignment from staff_directory
- ✅ Prevents unauthorized role escalation
- ✅ CORS whitelist (no wildcard origins)

---

## Testing Checklist

After configuration, test the following:

- [ ] Staff member can sign in with Google from production URL
- [ ] User is redirected to correct dashboard based on role
- [ ] Staff profile is correctly linked in `staff_directory`
- [ ] `user_roles` table has correct role assignment
- [ ] Test all staff roles: super_admin, manager, agent, marketer, pos
- [ ] Test on localhost:5000 (development)
- [ ] Test error handling (unauthorized email, inactive staff)

---

## Related Files

- **Edge Function**: `supabase/functions/google-staff-exchange/index.ts`
- **Frontend Auth**: `src/pages/Auth.tsx`
- **CORS Config**: `supabase/functions/_shared/cors.ts`
- **Database Tables**:
  - `staff_directory` - Staff email-to-role mapping
  - `staff_invitations` - Email-based invitations
  - `user_roles` - User role assignments
  - `profiles` - User profile data

---

## Troubleshooting

### Error: "Unauthorized redirect_uri"
- **Cause**: Redirect URI not configured in Google Cloud Console
- **Solution**: Add `https://vrhptrtgrpftycvojaqo.supabase.co/auth/v1/callback` to authorized URIs

### Error: "User email not available in token"
- **Cause**: Google OAuth scope doesn't include email
- **Solution**: Verify Google OAuth scopes include `email` and `profile`

### Error: "No matching staff found for this email"
- **Cause**: User's email not in `staff_directory`
- **Solution**: Add staff member to `staff_directory` with their Google email address

### Google sign-in works but user has wrong role
- **Cause**: `staff_directory.role` not set correctly
- **Solution**: Update role in `staff_directory` table for that email

---

## Post-Configuration

After successful configuration:

1. Update `docs/AUDIT_PROGRESS.md` - Mark blocker #12 as resolved ✅
2. Test with at least one user per role type
3. Monitor edge function logs for any auth errors
4. Update incident response playbook with OAuth troubleshooting steps

---

## Status Updates

**Last Updated**: 2026-04-07  
**Configured By**: _Pending manual configuration_  
**Tested By**: _Pending testing_  
**Status**: ⚠️ PENDING CONFIGURATION
