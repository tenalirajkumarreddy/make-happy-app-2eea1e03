# Test Agent Setup Guide

## Quick Setup

### Option 1: Run SQL Directly in Supabase

1. Go to your Supabase Dashboard → SQL Editor
2. Create a New Query
3. Paste the contents of `scripts/create-test-agent.sql`
4. Click "Run"

### Option 2: Using Supabase CLI

```bash
# Make sure you're in the project directory
supabase login
supabase sql < scripts/create-test-agent.sql --project-ref vrhptrtgrpftycvojaqo
```

## Test Agent Details

| Field | Value |
|-------|-------|
| **Phone** | `+919999999999` |
| **Name** | Test Agent |
| **Role** | agent |
| **Status** | Active |

## Login Instructions

1. Open the app
2. Enter phone number: `+919999999999` (or just `9999999999`)
3. Request OTP
4. Enter the OTP (check your SMS or use test OTP if configured)
5. You should be logged in as an **Agent**

## Multiple Test Users

Uncomment the "Multiple test agents" section in `scripts/create-test-agent.sql` to create:
- Test Agent 2: `+919999999998`
- Test Manager: `+919999999997`
- Test Marketer: `+919999999996`
- Test Operator: `+919999999995`

## How It Works

The `staff_directory` table acts as a pre-registration system. When a user logs in via OTP:

1. The backend checks if the phone number exists in `staff_directory`
2. If found, the user is linked to that staff record
3. The role from `staff_directory` is assigned via `user_roles` table
4. User gets access to agent features

## Troubleshooting

**User logs in as "customer" instead of "agent":**
- Make sure the phone number in `staff_directory` matches exactly (including country code)
- Check that `is_active = true` in `staff_directory`
- Verify the `role` column is set to `'agent'`

**User not found in staff_directory:**
- Check for leading/trailing spaces in phone number
- Ensure the phone format matches: `+91XXXXXXXXXX`

## Manual Verification SQL

```sql
-- Check test agent exists
SELECT * FROM public.staff_directory WHERE phone = '+919999999999';

-- Check user_roles after first login
SELECT * FROM public.user_roles WHERE role = 'agent';

-- Check staff_directory is linked to auth user
SELECT sd.*, ur.role as assigned_role
FROM public.staff_directory sd
LEFT JOIN public.user_roles ur ON sd.user_id = ur.user_id
WHERE sd.phone = '+919999999999';
```
