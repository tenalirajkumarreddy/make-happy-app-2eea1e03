# Database Schema Comparison Guide

## Overview

This guide helps you compare the `ACTIVE_SQL.sql` file with your actual Supabase database to ensure they match exactly.

---

## Method 1: Using Supabase SQL Editor (Recommended)

### Step 1: Run Comparison Queries

1. Go to your Supabase Dashboard → SQL Editor
2. Open `SCHEMA_COMPARISON_QUERIES.sql`
3. Run each section individually
4. Record the results

### Step 2: Compare Results

Use this checklist:

#### ✅ **Tables** (Should have 23 tables)
- [ ] activity_logs
- [ ] agent_inventory
- [ ] agent_routes
- [ ] customers
- [ ] daily_balances
- [ ] daily_handover
- [ ] location_pings ⭐ (Latest addition)
- [ ] notifications
- [ ] order_items
- [ ] orders
- [ ] product_categories
- [ ] products
- [ ] profiles
- [ ] push_subscriptions ⭐ (Latest addition)
- [ ] route_sessions
- [ ] route_visits
- [ ] routes
- [ ] sale_items
- [ ] sales
- [ ] store_types
- [ ] stores
- [ ] transactions
- [ ] user_roles

#### ✅ **Enums**
- [ ] app_role (6 values: super_admin, manager, agent, marketer, pos, customer)
- [ ] payment_method (6 values: cash, upi, card, bank_transfer, cheque, other)

#### ✅ **Functions**
- [ ] update_updated_at_column
- [ ] has_role
- [ ] get_user_role
- [ ] generate_display_id
- [ ] handle_new_user
- [ ] recalc_store_outstanding
- [ ] record_sale

#### ✅ **Key Triggers**
- [ ] on_auth_user_created (creates profile + customer role)
- [ ] update_*_updated_at (on multiple tables)
- [ ] recalc_store_outstanding_trigger (on stores table)

#### ✅ **Storage Buckets**
- [ ] kyc-documents (private, 10MB limit)
- [ ] entity-photos (public, 5MB limit)

#### ✅ **RLS Enabled**
- [ ] All 23 tables have Row Level Security enabled

#### ✅ **Latest Migration**
- [ ] Version: 20260320000001_gps_pings_push_subs_kyc_storage

---

## Method 2: Using Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Generate current schema
supabase db dump --schema public > current_schema.sql

# Compare with ACTIVE_SQL.sql
diff ACTIVE_SQL.sql current_schema.sql
```

---

## Method 3: Programmatic Comparison (Node.js)

Create a script to compare schemas:

```javascript
// compare-schemas.js
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

async function compareSchemas() {
  // Get all tables
  const { data: tables } = await supabase
    .from('pg_tables')
    .select('tablename')
    .eq('schemaname', 'public');

  console.log('Current Tables:', tables.length);
  
  // Expected from ACTIVE_SQL.sql
  const expectedTables = [
    'activity_logs', 'agent_inventory', 'agent_routes', 'customers',
    'daily_balances', 'daily_handover', 'location_pings', 'notifications',
    'order_items', 'orders', 'product_categories', 'products', 'profiles',
    'push_subscriptions', 'route_sessions', 'route_visits', 'routes',
    'sale_items', 'sales', 'store_types', 'stores', 'transactions', 'user_roles'
  ];

  const currentTables = tables.map(t => t.tablename).sort();
  const missing = expectedTables.filter(t => !currentTables.includes(t));
  const extra = currentTables.filter(t => !expectedTables.includes(t));

  console.log('\n✅ Expected tables:', expectedTables.length);
  console.log('📊 Current tables:', currentTables.length);
  
  if (missing.length > 0) {
    console.log('\n❌ Missing tables:', missing);
  }
  
  if (extra.length > 0) {
    console.log('\n⚠️  Extra tables:', extra);
  }
  
  if (missing.length === 0 && extra.length === 0) {
    console.log('\n✅ All tables match!');
  }
}

compareSchemas();
```

Run with:
```bash
node compare-schemas.js
```

---

## Common Discrepancies & Fixes

### Missing Tables

**Symptom:** Table doesn't exist in current database

**Fix:**
```sql
-- Extract the CREATE TABLE statement from ACTIVE_SQL.sql
-- Run it in SQL Editor
```

### Missing Columns

**Symptom:** Table exists but missing columns (e.g., `current_lat` in route_sessions)

**Fix:**
```sql
-- Add missing column
ALTER TABLE public.route_sessions 
ADD COLUMN current_lat DOUBLE PRECISION,
ADD COLUMN current_lng DOUBLE PRECISION,
ADD COLUMN location_updated_at TIMESTAMPTZ;
```

### Missing RLS Policies

**Symptom:** Table has RLS enabled but no policies

**Fix:**
```sql
-- Copy policy from ACTIVE_SQL.sql and run
CREATE POLICY "policy_name" ON public.table_name
  FOR SELECT USING (auth.uid() = user_id);
```

### Missing Functions

**Symptom:** Function doesn't exist

**Fix:**
```sql
-- Copy entire function definition from ACTIVE_SQL.sql
-- Run in SQL Editor
```

---

## Quick Validation Script

Run this in SQL Editor for a quick health check:

```sql
-- Quick validation query
SELECT 
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') as table_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as policy_count,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public') as function_count,
  (SELECT COUNT(*) FROM storage.buckets) as bucket_count;

-- Expected results:
-- table_count: 23
-- policy_count: 40-50
-- function_count: 7-10
-- bucket_count: 2
```

---

## After Comparison

### If Schemas Match ✅
- Your `ACTIVE_SQL.sql` is accurate
- Production database is up to date
- You're ready to deploy

### If Schemas Don't Match ❌

**Option 1: Update ACTIVE_SQL.sql**
- If production has extra tables/columns you want to keep
- Export current schema and update ACTIVE_SQL.sql

**Option 2: Update Production**
- If ACTIVE_SQL.sql has the correct schema
- Run missing migrations from `supabase/migrations/`
- Or run ACTIVE_SQL.sql sections that are missing

**Option 3: Fresh Start**
- For development environments only
- Reset database
- Run complete ACTIVE_SQL.sql

---

## Automated Comparison Tool

Want to build a comparison dashboard? Here's a starter:

```typescript
// schema-diff-tool.ts
import { createClient } from '@supabase/supabase-js';

interface SchemaDiff {
  tablesMatch: boolean;
  missingTables: string[];
  extraTables: string[];
  policyCount: number;
  functionCount: number;
}

async function getSchemaStatus(): Promise<SchemaDiff> {
  // Implementation here
  // Compare live DB with ACTIVE_SQL.sql expectations
  return {
    tablesMatch: true,
    missingTables: [],
    extraTables: [],
    policyCount: 45,
    functionCount: 7
  };
}
```

---

## Support

If you find discrepancies you can't resolve:

1. Export current schema: `supabase db dump --schema public > current.sql`
2. Compare files side-by-side
3. Check migration history: `SELECT * FROM supabase_migrations.schema_migrations`
4. Review recent changes in `supabase/migrations/`

---

## Next Steps After Successful Comparison

- [ ] Document any intentional differences
- [ ] Update ACTIVE_SQL.sql version number
- [ ] Commit changes to Git
- [ ] Run comparison on staging environment
- [ ] Schedule regular schema audits

---

**Last Updated:** 2026-03-21  
**Related Files:** ACTIVE_SQL.sql, SCHEMA_COMPARISON_QUERIES.sql
