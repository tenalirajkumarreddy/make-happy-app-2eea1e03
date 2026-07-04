# HTTPsms OTP Fix & Deployment

**Date**: 2026-07-03
**Project**: Aqua Prime (BizManager)
**Type**: Fix & Deploy

## Problem Statement

The `send-otp-httpsms` edge function was silently failing when calling the HTTPsms API. The frontend received a `200 OK` response, but the OTP was never actually sent. This was a critical bug blocking customer authentication.

## Root Cause Analysis

Inspecting the deployed version 6 revealed three critical bugs:

1. **Wrong Header Name**: The function was sending the API key under `'x-send-sms'` instead of the required `'x-api-key'`.
2. **Wrong API Endpoint**: The function was hitting `https://api.httpsms.com/v1/messages` instead of `https://api.httpsms.com/v1/messages/send`.
3. **Silent Error Swallowing**: The API call was wrapped in a `try/catch` block that logged the error to the server console but still returned a `200 OK` to the frontend.

```typescript
// DEPRECATED - Old buggy code (v6)
catch (smsError) {
  console.error('HTTPsms send failed:', smsError)
  // Don't fail the request - the OTP is still stored
  // This matches the OpenSMS behavior
}
```

## Changes Applied

### 1. Fixed `supabase/functions/send-otp-httpsms/index.ts`
- **Header**: Changed `'x-send-sms'` to `'x-api-key'`.
- **Endpoint**: Changed `/v1/messages` to `/v1/messages/send`.
- **Payload**: Streamlined to only include `from`, `to`, and `content`.
- **Error Handling**: Removed the inner `try/catch` that swallowed API errors. Errors now properly propagate to the calling code.
- **Environment Validation**: Added an explicit check for the `HTTPSMS_FROM_PHONE` environment variable, returning a `500` error if it's missing.
- **Cleanup**: Removed unused `HTTPsmsPayload` interface and the `request_id`/`encrypted` fields from the initial payload draft.

### 2. Created `httpsms-webhook` Edge Function
- A new function to receive and log HTTPsms webhook events (delivery status, phone online/offline).
- **Table**: `public.httpsms_webhook_logs` with RLS policies.

### 3. Applied Database Migration
- Created `public.httpsms_webhook_logs` table with columns: `id`, `event_type`, `payload`, `message_id`, `phone`, `status`, `created_at`.
- Added `service role` insert policy and `admin` select policy.

## Deployment Status

| Function | Status | Version | Key Changes |
|---|---|---|---|
| `send-otp-httpsms` | ACTIVE | **7** | Correct header (`x-api-key`), correct endpoint (`/send`), proper error propagation |
| `httpsms-webhook` | ACTIVE | 1 | Receives HTTPsms delivery status webhooks |
| `toggle-user-ban` | ACTIVE | 5 | Syncs auth ban with `profiles.is_active` |
| `send-otp-opensms` | ACTIVE | 19 | Legacy (kept for backward compatibility) |
| `verify-otp-opensms` | ACTIVE | 17 | OTP Verification endpoint |

## Environment Variables Required

For the function to work, the following must be set in the Supabase Dashboard (Settings > Edge Functions):

| Variable | Value | Description |
|---|---|---|
| `HTTPSMS_API_KEY` | `uk_RS...` | Your HTTPsms API key |
| `HTTPSMS_FROM_PHONE` | `+917997222262` | The sender phone number registered in HTTPsms |

## Testing

After setting the environment variables, trigger an OTP request from the customer login flow. The function should now:
1. Validate the `fromPhone` environment variable.
2. Call the correct HTTPsms endpoint with the correct headers.
3. Return the actual HTTPsms error message to the frontend if the API call fails.
