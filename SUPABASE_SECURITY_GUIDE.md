# Supabase Anon Key & RLS Security Deep Dive

**Complete explanation of how authentication + data access control works**

---

## What is the Supabase "Anon Key"?

### Official Terms
- **Anon Key** = `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Role:** `anon` (authenticated service role)
- **Type:** JWT (JSON Web Token)
- **Location:** Can be in frontend code, git, `.env.example`, etc.

### What It Does

```
Client App
    ↓
    Uses Anon Key to initialize Supabase client
    ↓
supabase.from("users").select()
    ↓
HTTP request to Supabase API:
    POST https://vrhptrtgrpftycvojaqo.supabase.co/rest/v1/users?select=*
    Headers: {
        Authorization: "Bearer eyJhbGc...",  ← Anon key
        apikey: "eyJhbGc..."                 ← Anon key again
    }
    ↓
Supabase receives request
    ↓
**RLS POLICY CHECK**: "Can this user access this data?"
    ↓
If RLS allows: Return data
If RLS denies: Return 403 Forbidden
```

---

## Understanding Row Level Security (RLS)

### Problem Without RLS

```sql
-- Without RLS, anyone with anon key can:
SELECT * FROM users;  -- See ALL users (BAD!)
SELECT * FROM bank_accounts;  -- See ALL bank accounts (VERY BAD!)
DELETE FROM products;  -- Delete all products (TERRIBLE!)
```

**Result:** Anyone with your public anon key can steal/delete all data. Not good.

### Solution With RLS

```sql
-- WITH RLS enabled on "users" table
-- RLS Policy: "Users can only see their own row"

CREATE POLICY "users_select_own"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Now when user tries:
SELECT * FROM users;

-- Supabase automatically adds WHERE clause:
SELECT * FROM users WHERE auth.uid() = id;

-- Result: Only their own row is returned ✅
```

---

## How Authentication Works

### 1. User Logs In

```
User enters phone number
    ↓
App calls: supabase.auth.signInWithOtp({ phone: "+919876543210" })
    ↓
Backend sends OTP via SMS (OpenSMS)
    ↓
User enters OTP
    ↓
App calls: supabase.auth.verifyOtp({ token_hash: "...", type: "sms" })
    ↓
Backend verifies OTP is valid
    ↓
**Backend creates user in auth.users table**
    ↓
**Backend issues JWT token**
    ↓
Browser stores token in sessionStorage/localStorage
```

### 2. JWT Token Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "iss": "supabase",
    "ref": "vrhptrtgrpftycvojaqo",
    "aud": "authenticated",
    "role": "authenticated",           ← User is authenticated!
    "auth_time": 1700000000,
    "exp": 1700003600,
    "email": "user@example.com",
    "phone": "+919876543210",
    "user_id": "a1b2c3d4-e5f6...",    ← Unique user ID
    "aud": "authenticated"
  },
  "signature": "... base64 ..."
}
```

**Key Point:** Token contains `user_id` which RLS policies use to check access.

---

## RLS Policies In Action

### Example 1: Customer Profile

```sql
-- Table: profiles
-- Goal: Customers can only see/edit their own profile

-- CREATE
CREATE POLICY "profiles_insert_authenticated"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- READ (most common)
CREATE POLICY "profiles_select_own"
ON profiles
FOR SELECT
USING (auth.uid() = user_id);

-- UPDATE
CREATE POLICY "profiles_update_own"
ON profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE
CREATE POLICY "profiles_delete_own"
ON profiles
FOR DELETE
USING (auth.uid() = user_id);
```

**Result:**
```
User A logs in → Token has user_id = "user-a-id"
    ↓
User A queries: SELECT * FROM profiles
    ↓
RLS adds: WHERE auth.uid() = "user-a-id"
    ↓
User A only sees their own profile ✅
User A cannot see User B's profile ✅
```

### Example 2: Agent Sees Only Assigned Stores

```sql
-- Table: store_assignments
-- Goal: Agent can only see stores they're assigned to

CREATE POLICY "agent_view_assigned_stores"
ON store_assignments
FOR SELECT
USING (
  -- Current user is an agent
  auth.uid() IN (SELECT id FROM auth.users WHERE role = 'agent')
  AND
  -- AND they're assigned to this store
  auth.uid() = agent_user_id
);

-- Result:
-- Agent X can query: SELECT * FROM store_assignments
-- Supabase adds: WHERE agent_user_id = 'user-x-id'
-- Agent X only sees their assigned stores
```

### Example 3: Manager Sees Store Data

```sql
-- Table: sales
-- Goal: Manager can see sales for stores they manage

CREATE POLICY "manager_view_store_sales"
ON sales
FOR SELECT
USING (
  -- Store manager can see sales from their stores
  store_id IN (
    SELECT store_id FROM store_assignments
    WHERE manager_user_id = auth.uid()
  )
);
```

---

## Security Architecture

### Anon Key = Read-Only for Unauthenticated Users

```
Unauthenticated Request (no JWT token)
    ↓
Uses Anon Key
    ↓
Supabase: "User role = anon"
    ↓
RLS policies with "FOR authenticated" are skipped
    ↓
Only policies with "FOR all" or "FOR select" run
    ↓
Typically returns: Nothing (empty result set)
```

**Policy Example:**
```sql
-- This runs for unauthenticated users
CREATE POLICY "public_read_products"
ON products
FOR SELECT
USING (true);  -- Anyone can see products

-- This does NOT run for unauthenticated users
CREATE POLICY "customers_edit_profile"
ON profiles
FOR UPDATE
USING (auth.uid() = user_id);  -- Only authenticated
```

---

## Authenticated Key = All Permissions (Server Use Only)

```
Server-Side Code (Edge Function or Backend)
    ↓
Uses Service Role Key (NOT Anon Key)
    ↓
Supabase: "User role = service_role"
    ↓
RLS policies BYPASSED
    ↓
All data accessible (dangerous!)
```

**Key Difference:**
| Key | Use Case | Scope | Security |
|-----|----------|-------|----------|
| Anon Key | Frontend | Limited by RLS | ✅ Public-safe |
| Service Key | Backend/Functions | Full access | ❌ Private-only |

```bash
# SAFE: Can commit to git
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGc..."

# DANGEROUS: Never commit!
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
```

---

## Real-World Data Flow

### Scenario: Customer Views Their Profile

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. APP (React)                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  const { data: profile } = await supabase                        │
│    .from('profiles')                                             │
│    .select('*')                                                  │
│    .eq('user_id', user.id)                                       │
│    .single();                                                    │
│                                                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP GET /rest/v1/profiles?user_id=eq.user-a-id
                   │ Headers: Authorization: Bearer <JWT token>
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. SUPABASE API                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Request arrives                                                 │
│      ↓                                                            │
│  Extract JWT token from header                                   │
│      ↓                                                            │
│  Decode JWT: user_id = "user-a-id"                              │
│      ↓                                                            │
│  Set auth.uid() = "user-a-id"                                   │
│      ↓                                                            │
│  Execute policy:                                                │
│    "WHERE auth.uid() = user_id"                                 │
│      ↓                                                            │
│  Query becomes:                                                 │
│    SELECT * FROM profiles                                       │
│    WHERE user_id = eq."user-a-id"                               │
│    AND auth.uid() = user_id  ← RLS Policy                      │
│      ↓                                                            │
│  Database returns only user-a's profile row                    │
│      ↓                                                            │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP Response: { id: "...", name: "...", ... }
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. APP (React)                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  profile = { id: "...", name: "...", ... }                      │
│  UI renders user's profile ✅                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Scenario: Hacker Tries to Access Another User's Data

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. HACKER (Browser Console)                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  const { data } = await supabase                                 │
│    .from('profiles')                                             │
│    .select('*')                                                  │
│    .eq('user_id', 'user-b-id')  ← Try to access User B         │
│    .single();                                                    │
│                                                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP GET /rest/v1/profiles?user_id=eq.user-b-id
                   │ Headers: Authorization: Bearer <User A's JWT>
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. SUPABASE API                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Extract JWT: user_id = "user-a-id"                             │
│      ↓                                                            │
│  Apply RLS policy:                                               │
│    WHERE auth.uid() = user_id                                   │
│      ↓                                                            │
│  Query becomes:                                                 │
│    SELECT * FROM profiles                                       │
│    WHERE user_id = eq."user-b-id"                               │
│    AND auth.uid() = user_id                                     │
│      ↓                                                            │
│  Evaluation:                                                    │
│    - Table: user_id = "user-b-id"                              │
│    - RLS: auth.uid() = "user-a-id" (doesn't match!)           │
│      ↓                                                            │
│  Result: 0 rows (access denied ✅)                              │
│                                                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP Response: (empty array)
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. HACKER (Browser)                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  data = []  ← No data returned!                                  │
│  Cannot access User B's profile ❌ Attack prevented!             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Checklist: Setting Up RLS Correctly

```sql
-- 1. Enable RLS on critical tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 2. Create policies for each operation (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "users_select_own" ON profiles
    FOR SELECT USING (auth.uid() = user_id);

-- 3. Test policies work correctly
-- Login as user A, try to query:
SELECT * FROM profiles;  -- Should only see User A's profile

-- 4. Deny access by default
CREATE POLICY "deny_default" ON sensitive_table
    FOR ALL USING (false);  -- Default: deny all
-- Then add specific allow policies

-- 5. Check current policies
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles';
```

---

## Summary

| Concept | What It Does | Safe to Expose? |
|---------|-------------|-----------------|
| **Anon Key** | Public API access | ✅ YES (in code) |
| **JWT Token** | Identifies user | ✅ YES (in localStorage) |
| **RLS Policies** | Enforce data access | ✅ YES (public on dashboard) |
| **Service Role Key** | Backend full access | ❌ NO (keep private) |
| **Session Token** | Server→server | ✅ YES (server-only) |

**Golden Rule:**
```
Anon Key + Valid JWT + RLS Policies = Secure Data Access ✅

Without ANY of these = Security risk ❌
```

---

## Debugging RLS Issues

### "No rows returned but should see data"

```sql
-- 1. Check if RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE tablename = 'profiles';
-- Should show: rowsecurity = True

-- 2. Check policies exist
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';

-- 3. Test with SQL directly (bypass JWT)
-- In Supabase SQL editor:
SELECT * FROM profiles WHERE user_id = 'test-user-id';

-- 4. Check JWT has correct user_id
-- In browser console:
supabase.auth.getSession().then(s => console.log(s.session.user.id))
```

### "Getting 403 Forbidden error"

```
Possible causes:
1. RLS policy too restrictive → Add policy for your role
2. JWT expired → Refresh with: await supabase.auth.refreshSession()
3. Policy has wrong condition → Debug SQL with above steps
4. User doesn't exist in auth.users → Check Supabase Auth dashboard
```

---

## Key Takeaways

✅ **The Anon Key is SAFE and PUBLIC**
- Designed to be exposed in frontend code
- Limited by RLS policies
- Identified by JWT token
- Data access enforced at database level

✅ **RLS Policies are YOUR Security Layer**
- They are the actual firewall between users and data
- Must be configured correctly per table
- Policies are PUBLIC (shown in dashboard)
- Service role key bypasses RLS (kept private)

✅ **JWT Token identifies the User**
- Includes unique user_id
- Sent with every API request in Authorization header
- RLS policies use auth.uid() to check identity
- Can be safely stored in browser

❌ **Never expose Service Role Key**
- It bypasses all RLS
- Use only in backend/Edge Functions
- If leaked, attacker gets full access

---

## See Also
- Supabase RLS Docs: https://supabase.com/docs/guides/auth/row-level-security
- JWT Overview: https://jwt.io/
- PostgreSQL Security: https://www.postgresql.org/docs/current/sql-syntax.html
