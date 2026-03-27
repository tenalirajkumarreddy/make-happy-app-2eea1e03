# Quick Start Guide

Get OpenSMS running in 5 minutes!

---

## 🚀 Option 1: Minimal Setup (Testing)

### 1. Create Supabase Project
Go to [supabase.com](https://supabase.com) → New Project

### 2. Run This SQL
```sql
-- One-click setup: Copy & paste into SQL Editor
CREATE TABLE public.sms_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.sms_jobs FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_jobs;
```

### 3. Configure App
- Install APK on Android
- Enter **Project URL** + **Anon Key** (from Settings → API)
- Tap **Start Gateway**

### 4. Send Your First SMS
```sql
INSERT INTO sms_jobs (to_phone, body, status)
VALUES ('+919876543210', 'Hello from OpenSMS!', 'pending');
```

✅ **Done!** Check your phone.

---

## 🔒 Option 2: Production Setup (Secure)

### 1. Run Complete Schema
```sql
-- Tables
CREATE TABLE public.sms_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_phone TEXT NOT NULL,
    body TEXT,
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    template_name TEXT,
    template_vars JSONB,
    gateway_id UUID,
    user_id UUID
);

CREATE TABLE public.gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL UNIQUE,
    api_key TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
    name TEXT DEFAULT 'OpenSMS Gateway',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

-- Android app can read/update jobs
CREATE POLICY "anon_read" ON public.sms_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update" ON public.sms_jobs FOR UPDATE TO anon USING (true);

-- Only backend can insert jobs
CREATE POLICY "service_insert" ON public.sms_jobs FOR INSERT TO service_role WITH CHECK (true);

-- Gateway registration
CREATE POLICY "gateway_access" ON public.gateways FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateways;
```

### 2. Backend Integration

**Node.js:**
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Send SMS
await supabase.from('sms_jobs').insert({
  to_phone: '+919876543210',
  body: 'Your OTP is 1234',
  status: 'pending'
})
```

**Python:**
```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

supabase.table('sms_jobs').insert({
    'to_phone': '+919876543210',
    'body': 'Your OTP is 1234',
    'status': 'pending'
}).execute()
```

**cURL:**
```bash
curl -X POST 'https://xxx.supabase.co/rest/v1/sms_jobs' \
  -H "apikey: SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to_phone": "+919876543210", "body": "Hello!", "status": "pending"}'
```

---

## 📱 App Setup Checklist

- [ ] APK installed
- [ ] Project URL entered (no trailing slash)
- [ ] Anon key entered (NOT service key)
- [ ] SMS permission granted
- [ ] Notification permission granted
- [ ] Battery optimization disabled (recommended)
- [ ] Status shows "Connected" (green)

---

## 🔧 Common Issues

| Problem | Solution |
|---------|----------|
| "Disconnected" | Check URL/key, verify Realtime enabled |
| SMS not sending | Grant SMS permission, check SIM |
| Job stuck on "pending" | Verify app is connected |
| RLS error on insert | Use `service_role` key in backend |

---

## 📊 Check Status

```sql
-- Recent jobs
SELECT id, to_phone, status, created_at 
FROM sms_jobs 
ORDER BY created_at DESC 
LIMIT 10;

-- Stats
SELECT status, COUNT(*) 
FROM sms_jobs 
GROUP BY status;
```

---

## Next Steps

- 📖 Read full [Integration Guide](./INTEGRATION_GUIDE.md)
- 🔐 Set up [user authentication](./INTEGRATION_GUIDE.md#6-user-authentication)
- 📶 Configure [dual SIM](../README.md) in Settings
- 🔔 Add [webhooks](./INTEGRATION_GUIDE.md#8-webhooks--callbacks) for status updates
