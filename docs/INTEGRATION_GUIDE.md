# OpenSMS Integration Guide

Complete guide for integrating OpenSMS with your Supabase project and authenticating users.

---

## Table of Contents

1. [Supabase Project Setup](#1-supabase-project-setup)
2. [Database Schema](#2-database-schema)
3. [Row Level Security (RLS)](#3-row-level-security-rls)
4. [Connecting the Android App](#4-connecting-the-android-app)
5. [Sending SMS from Your Backend](#5-sending-sms-from-your-backend)
6. [User Authentication](#6-user-authentication)
7. [Multi-Tenant Setup](#7-multi-tenant-setup)
8. [Webhooks & Callbacks](#8-webhooks--callbacks)
9. [Monitoring & Analytics](#9-monitoring--analytics)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Supabase Project Setup

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Enter project details:
   - **Name**: `opensms-gateway` (or your choice)
   - **Database Password**: Save this securely!
   - **Region**: Choose closest to your users
4. Wait for project to be created (~2 minutes)

### Step 2: Get Your API Keys

Once created, go to **Settings → API** and note:

| Key | Purpose | Where to Use |
|-----|---------|--------------|
| **Project URL** | `https://xxxxx.supabase.co` | Android app + Backend |
| **anon (public)** | Safe to expose, limited access | Android app |
| **service_role** | Full database access | Your backend only (KEEP SECRET!) |

```
Project URL:  https://abcdefghijkl.supabase.co
Anon Key:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Service Key:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (NEVER expose this!)
```

---

## 2. Database Schema

### Step 1: Create Tables

Go to **SQL Editor** in Supabase Dashboard and run:

```sql
-- ============================================
-- CORE TABLE: SMS Jobs
-- ============================================
CREATE TABLE public.sms_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_phone        TEXT NOT NULL,
    body            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    
    -- Template support
    template_name   TEXT,
    template_vars   JSONB,
    
    -- Device routing (optional)
    gateway_id      UUID,
    
    -- Multi-tenant support (optional)
    user_id         UUID,
    org_id          UUID
);

-- Indexes for performance
CREATE INDEX idx_sms_jobs_status ON public.sms_jobs(status);
CREATE INDEX idx_sms_jobs_gateway ON public.sms_jobs(gateway_id);
CREATE INDEX idx_sms_jobs_user ON public.sms_jobs(user_id);
CREATE INDEX idx_sms_jobs_created ON public.sms_jobs(created_at DESC);

-- ============================================
-- GATEWAY REGISTRATION (for security)
-- ============================================
CREATE TABLE public.gateways (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT NOT NULL UNIQUE,
    api_key         TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    name            TEXT DEFAULT 'OpenSMS Gateway',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ DEFAULT now(),
    
    -- Multi-tenant: assign gateway to user/org
    user_id         UUID,
    org_id          UUID
);

CREATE INDEX idx_gateways_device ON public.gateways(device_id);
CREATE INDEX idx_gateways_user ON public.gateways(user_id);

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateways;
```

### Step 2: Enable Realtime in Dashboard

1. Go to **Database → Replication**
2. Find `supabase_realtime` publication
3. Enable both `sms_jobs` and `gateways` tables

---

## 3. Row Level Security (RLS)

### Basic Setup (Single User)

For simple setups where you're the only user:

```sql
-- Enable RLS
ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

-- SMS Jobs: anon can read & update, service_role can insert
CREATE POLICY "anon_select_jobs" ON public.sms_jobs
    FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_jobs" ON public.sms_jobs
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "service_insert_jobs" ON public.sms_jobs
    FOR INSERT TO service_role WITH CHECK (true);

-- Gateways: anon can manage their own gateway
CREATE POLICY "anon_gateway_access" ON public.gateways
    FOR ALL TO anon USING (true) WITH CHECK (true);
```

### Production Setup (Multi-Tenant)

For SaaS applications with multiple users:

```sql
-- Enable RLS
ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

-- SMS Jobs: Users can only see their own jobs
CREATE POLICY "users_own_jobs" ON public.sms_jobs
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS for backend operations
CREATE POLICY "service_full_access" ON public.sms_jobs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Gateways: Users can only see their own gateways
CREATE POLICY "users_own_gateways" ON public.gateways
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Anon can register new gateways (will be assigned to user later)
CREATE POLICY "anon_register_gateway" ON public.gateways
    FOR INSERT TO anon
    WITH CHECK (user_id IS NULL);

CREATE POLICY "anon_update_own_gateway" ON public.gateways
    FOR UPDATE TO anon
    USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_active_gateway" ON public.gateways
    FOR SELECT TO anon
    USING (is_active = true);
```

---

## 4. Connecting the Android App

### Step 1: Install the APK

Transfer `app-debug.apk` to your Android device and install.

### Step 2: Configure Connection

1. Open the OpenSMS app
2. Enter your credentials:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon Key**: Your anon/public key
3. Tap **"Start Gateway"**

### Step 3: Grant Permissions

The app will request:
- ✅ SMS permission (required)
- ✅ Notification permission (required)
- ⚡ Battery optimization exemption (recommended)

### Step 4: Verify Connection

- Status should show **"Connected"**
- The gateway auto-registers in `gateways` table
- Check your Supabase dashboard: **Table Editor → gateways**

### QR Code Quick Connect (Optional)

Generate a QR code with this JSON format:

```json
{
  "url": "https://xxxxx.supabase.co",
  "key": "eyJhbGciOiJIUzI1NiIs..."
}
```

Scan from the app's Connect screen for instant setup.

---

## 5. Sending SMS from Your Backend

### Using Supabase Client Libraries

#### JavaScript/TypeScript

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xxxxx.supabase.co',
  'your-service-role-key'  // Use service_role key in backend!
)

// Send a simple SMS
async function sendSMS(phone: string, message: string) {
  const { data, error } = await supabase
    .from('sms_jobs')
    .insert({
      to_phone: phone,
      body: message,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Send using a template
async function sendOTP(phone: string, otp: string) {
  const { data, error } = await supabase
    .from('sms_jobs')
    .insert({
      to_phone: phone,
      template_name: 'otp',
      template_vars: { otp, minutes: '10' },
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Send to specific gateway
async function sendViaGateway(phone: string, message: string, gatewayId: string) {
  const { data, error } = await supabase
    .from('sms_jobs')
    .insert({
      to_phone: phone,
      body: message,
      gateway_id: gatewayId,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Check delivery status
async function getJobStatus(jobId: string) {
  const { data, error } = await supabase
    .from('sms_jobs')
    .select('status, sent_at, delivered_at, error')
    .eq('id', jobId)
    .single()

  if (error) throw error
  return data
}
```

#### Python

```python
from supabase import create_client

supabase = create_client(
    "https://xxxxx.supabase.co",
    "your-service-role-key"
)

# Send SMS
def send_sms(phone: str, message: str):
    result = supabase.table("sms_jobs").insert({
        "to_phone": phone,
        "body": message,
        "status": "pending"
    }).execute()
    return result.data[0]

# Send with template
def send_otp(phone: str, otp: str):
    result = supabase.table("sms_jobs").insert({
        "to_phone": phone,
        "template_name": "otp",
        "template_vars": {"otp": otp, "minutes": "10"},
        "status": "pending"
    }).execute()
    return result.data[0]

# Check status
def get_status(job_id: str):
    result = supabase.table("sms_jobs")\
        .select("status, sent_at, delivered_at, error")\
        .eq("id", job_id)\
        .single()\
        .execute()
    return result.data
```

#### cURL / Raw HTTP

```bash
# Send SMS via REST API
curl -X POST 'https://xxxxx.supabase.co/rest/v1/sms_jobs' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "to_phone": "+919876543210",
    "body": "Hello from OpenSMS!",
    "status": "pending"
  }'
```

### Direct SQL (Supabase Dashboard)

```sql
-- Send a single SMS
INSERT INTO sms_jobs (to_phone, body, status)
VALUES ('+919876543210', 'Your order has shipped!', 'pending');

-- Bulk send
INSERT INTO sms_jobs (to_phone, body, status)
VALUES 
  ('+919876543210', 'Message 1', 'pending'),
  ('+919876543211', 'Message 2', 'pending'),
  ('+919876543212', 'Message 3', 'pending');

-- Check pending jobs
SELECT * FROM sms_jobs WHERE status = 'pending';

-- Check delivery stats
SELECT 
  status,
  COUNT(*) as count
FROM sms_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

---

## 6. User Authentication

If you're building an app where **your users** send SMS through your system, you need authentication.

### Option A: Supabase Auth (Recommended)

#### Step 1: Enable Auth Providers

In Supabase Dashboard → **Authentication → Providers**:

- ✅ Email/Password
- ✅ Google OAuth
- ✅ GitHub OAuth
- ✅ Phone OTP (magic link via SMS!)

#### Step 2: Frontend Integration

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xxxxx.supabase.co',
  'your-anon-key'  // anon key is safe in frontend
)

// Sign up
async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })
  return { data, error }
}

// Sign in
async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

// Sign in with Google
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google'
  })
  return { data, error }
}

// Get current user
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Sign out
async function signOut() {
  await supabase.auth.signOut()
}
```

#### Step 3: Protect SMS Sending

Once authenticated, the user's JWT contains their `user_id`. RLS policies will automatically filter:

```typescript
// User sends SMS (their user_id is auto-attached by RLS)
async function sendSMS(phone: string, message: string) {
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data, error } = await supabase
    .from('sms_jobs')
    .insert({
      to_phone: phone,
      body: message,
      status: 'pending',
      user_id: user.id  // Links SMS to this user
    })
    .select()
    .single()

  return { data, error }
}

// User can only see their own SMS history
async function getMySMSHistory() {
  const { data, error } = await supabase
    .from('sms_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  
  // RLS automatically filters to user's jobs only!
  return { data, error }
}
```

### Option B: API Key Authentication

For B2B scenarios where each customer gets an API key:

#### Step 1: Create API Keys Table

```sql
CREATE TABLE public.api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    name        TEXT NOT NULL,
    user_id     UUID REFERENCES auth.users(id),
    org_id      UUID,
    is_active   BOOLEAN DEFAULT true,
    rate_limit  INT DEFAULT 100,  -- per minute
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_used   TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key ON public.api_keys(key);
```

#### Step 2: Create Edge Function for Validation

Create a Supabase Edge Function (`supabase/functions/send-sms/index.ts`):

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Get API key from header
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Create admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Validate API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('id, user_id, org_id, is_active, rate_limit')
      .eq('key', apiKey)
      .single()

    if (keyError || !keyData || !keyData.is_active) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const { to_phone, body, template_name, template_vars } = await req.json()

    if (!to_phone) {
      return new Response(JSON.stringify({ error: 'to_phone is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Insert SMS job
    const { data, error } = await supabase
      .from('sms_jobs')
      .insert({
        to_phone,
        body,
        template_name,
        template_vars,
        user_id: keyData.user_id,
        org_id: keyData.org_id,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // Update last_used
    await supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('id', keyData.id)

    return new Response(JSON.stringify({ success: true, job: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

#### Step 3: Usage with API Key

```bash
curl -X POST 'https://xxxxx.supabase.co/functions/v1/send-sms' \
  -H "x-api-key: YOUR_CUSTOMER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to_phone": "+919876543210",
    "body": "Hello from API!"
  }'
```

---

## 7. Multi-Tenant Setup

For SaaS applications with organizations:

### Database Schema

```sql
-- Organizations table
CREATE TABLE public.organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    owner_id    UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Organization members
CREATE TABLE public.org_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT DEFAULT 'member',  -- owner, admin, member
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, user_id)
);

-- RLS: Users see jobs from their organization
CREATE POLICY "org_members_see_jobs" ON public.sms_jobs
    FOR SELECT TO authenticated
    USING (
        org_id IN (
            SELECT org_id FROM org_members WHERE user_id = auth.uid()
        )
    );

-- RLS: Users can insert jobs for their organization
CREATE POLICY "org_members_insert_jobs" ON public.sms_jobs
    FOR INSERT TO authenticated
    WITH CHECK (
        org_id IN (
            SELECT org_id FROM org_members WHERE user_id = auth.uid()
        )
    );
```

### Usage

```typescript
// Get user's organizations
async function getMyOrganizations() {
  const { data, error } = await supabase
    .from('org_members')
    .select(`
      org_id,
      role,
      organizations (
        id,
        name,
        slug
      )
    `)
  return { data, error }
}

// Send SMS for an organization
async function sendOrgSMS(orgId: string, phone: string, message: string) {
  const { data, error } = await supabase
    .from('sms_jobs')
    .insert({
      to_phone: phone,
      body: message,
      org_id: orgId,
      status: 'pending'
    })
    .select()
    .single()
  return { data, error }
}
```

---

## 8. Webhooks & Callbacks

Get notified when SMS status changes:

### Option A: Database Webhooks (Supabase)

Go to **Database → Webhooks** and create:

- **Name**: `sms_status_webhook`
- **Table**: `sms_jobs`
- **Events**: `UPDATE`
- **URL**: `https://your-backend.com/webhooks/sms-status`

### Option B: Database Trigger + Edge Function

```sql
-- Create function to call webhook
CREATE OR REPLACE FUNCTION notify_sms_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM net.http_post(
            url := 'https://your-backend.com/webhooks/sms-status',
            body := json_build_object(
                'job_id', NEW.id,
                'to_phone', NEW.to_phone,
                'old_status', OLD.status,
                'new_status', NEW.status,
                'error', NEW.error,
                'sent_at', NEW.sent_at,
                'delivered_at', NEW.delivered_at
            )::text,
            headers := '{"Content-Type": "application/json"}'::jsonb
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER sms_status_changed
    AFTER UPDATE ON sms_jobs
    FOR EACH ROW
    EXECUTE FUNCTION notify_sms_status();
```

### Option C: Realtime Subscription

```typescript
// Subscribe to status changes in your backend
const subscription = supabase
  .channel('sms-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'sms_jobs',
      filter: 'status=neq.pending'
    },
    (payload) => {
      console.log('SMS status changed:', payload.new)
      // Handle the update
    }
  )
  .subscribe()
```

---

## 9. Monitoring & Analytics

### Dashboard Queries

```sql
-- Today's stats
SELECT 
    status,
    COUNT(*) as count
FROM sms_jobs
WHERE created_at >= CURRENT_DATE
GROUP BY status;

-- Hourly volume
SELECT 
    date_trunc('hour', created_at) as hour,
    COUNT(*) as sent
FROM sms_jobs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Delivery rate
SELECT 
    ROUND(
        COUNT(*) FILTER (WHERE status = 'delivered')::numeric / 
        COUNT(*)::numeric * 100, 2
    ) as delivery_rate_percent
FROM sms_jobs
WHERE created_at >= CURRENT_DATE;

-- Failed messages
SELECT id, to_phone, error, created_at
FROM sms_jobs
WHERE status = 'failed'
AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Gateway health
SELECT 
    g.id,
    g.name,
    g.last_seen_at,
    NOW() - g.last_seen_at as time_since_seen,
    COUNT(j.id) as jobs_today
FROM gateways g
LEFT JOIN sms_jobs j ON j.gateway_id = g.id 
    AND j.created_at >= CURRENT_DATE
WHERE g.is_active = true
GROUP BY g.id
ORDER BY g.last_seen_at DESC;
```

### Grafana/Metabase Integration

Connect your BI tool directly to Supabase PostgreSQL:

- **Host**: `db.xxxxx.supabase.co`
- **Port**: `5432`
- **Database**: `postgres`
- **User**: `postgres`
- **Password**: Your database password

---

## 10. Troubleshooting

### App Won't Connect

| Issue | Solution |
|-------|----------|
| "Invalid URL" | Ensure URL is `https://xxxxx.supabase.co` (no trailing slash) |
| "Unauthorized" | Check anon key is correct and not the service key |
| "Connection timeout" | Check internet, try toggling airplane mode |
| "Realtime not working" | Enable table in Database → Replication |

### SMS Not Sending

| Issue | Solution |
|-------|----------|
| Job stays "pending" | Check gateway is connected (green status) |
| "No SIM" error | Insert SIM card, check signal |
| Permission denied | Grant SMS permission in Android settings |
| Rate limited | Carrier may block bulk SMS, add delays |

### RLS Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "new row violates RLS" | Insert without required fields | Include `user_id` in insert |
| "permission denied" | Wrong key or missing policy | Use service_role for backend |
| Empty results | RLS filtering everything | Check `auth.uid()` matches data |

### Debug Queries

```sql
-- Check if Realtime is enabled
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'sms_jobs';

-- Test as anon user
SET ROLE anon;
SELECT * FROM sms_jobs LIMIT 1;
RESET ROLE;
```

---

## Quick Reference

### Environment Variables

```env
# Backend (.env)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # service_role key
SUPABASE_ANON_KEY=eyJ...     # For frontend

# Android App
# Entered via UI or QR code
```

### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/rest/v1/sms_jobs` | POST | service_role | Create SMS job |
| `/rest/v1/sms_jobs?id=eq.xxx` | GET | anon/auth | Get job status |
| `/rest/v1/gateways` | GET | anon/auth | List gateways |
| `/functions/v1/send-sms` | POST | API key | Send via Edge Function |

### Status Flow

```
pending → processing → sent → delivered
                  ↘         ↘
                   failed    failed
```

---

## Need Help?

- 📖 [Supabase Docs](https://supabase.com/docs)
- 💬 [Supabase Discord](https://discord.supabase.com)
- 🐛 Report issues in the GitHub repository
