# Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notifications server-side-only (no UI-side calls), fix Android native push delivery (FCM token global uniqueness + foreground tray always-on), add missing notification triggers for ~18 actions, and define acknowledgment notifications.

**Architecture:** Single source of truth via `public.notify(jsonb)` RPC + per-table Postgres triggers. FCM token uniqueness enforced via `UNIQUE(token)` constraint + `upsert_fcm_token()` RPC. Foreground system-tray always shown. Tiered broadcast: `action_required` → admins+managers; `actor_ack` → actor only. UI-side `sendNotification*` calls deleted entirely.

**Tech Stack:** PostgreSQL triggers, Supabase Edge Functions (Deno), Capacitor (LocalNotifications + PushNotifications), React, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-07-06-notifications-system-design.md`

---

## File Map

### Create
- `supabase/migrations/20260706000001_notifications_add_columns.sql`
- `supabase/migrations/20260706000002_fcm_tokens_global_unique.sql`
- `supabase/migrations/20260706000003_user_notification_action_overrides.sql`
- `supabase/migrations/20260706000004_notify_rpc.sql`
- `supabase/migrations/20260706000005_extend_notification_fcm_trigger.sql`
- `supabase/migrations/20260706000006_sales_trigger.sql`
- `supabase/migrations/20260706000007_transactions_trigger.sql`
- `supabase/migrations/20260706000008_sale_returns_trigger.sql`
- `supabase/migrations/20260706000009_orders_triggers.sql`
- `supabase/migrations/20260706000010_payment_returns_trigger.sql`
- `supabase/migrations/20260706000011_consolidate_handovers_trigger.sql`
- `supabase/migrations/20260706000012_consolidate_stock_transfers_trigger.sql`
- `supabase/migrations/20260706000013_extend_expense_claims_trigger.sql`
- `supabase/migrations/20260706000014_customers_welcome_trigger.sql`
- `supabase/migrations/20260706000015_staff_invitations_trigger.sql`
- `supabase/migrations/20260706000016_kyc_upload_and_status_trigger.sql`
- `supabase/migrations/20260706000017_route_sessions_trigger.sql`
- `supabase/migrations/20260706000018_store_visits_trigger.sql`
- `supabase/migrations/20260706000019_stock_low_threshold.sql`
- `supabase/migrations/20260706000020_toggle_user_ban_notification.sql`

### Modify
- `src/hooks/useNotifications.ts`
- `src/lib/notifications.ts`
- `src/hooks/useFixedCostReminders.ts`
- `src/hooks/useRecordSale.ts`
- `src/components/orders/OrderFulfillmentDialog.tsx`
- `src/components/sales/SaleReturnDialog.tsx`
- `src/components/inventory/StockTransferModal.tsx`
- `src/mobile/pages/customer/CustomerOrders.tsx`
- `src/mobile/pages/admin/AdminHandovers.tsx`
- `src/mobile/pages/admin/AdminOrders.tsx`
- `src/mobile/pages/agent/AgentRecordSale.tsx`
- `src/mobile/pages/agent/AgentHistory.tsx`
- `src/mobile/pages/agent/AgentRecordPayment.tsx`
- `src/mobile/pages/agent/AgentRecord.tsx`
- `src/pages/CustomerOrders.tsx`
- `src/pages/Handovers.tsx`
- `src/pages/Orders.tsx`
- `src/pages/Sales.tsx`
- `src/pages/Transactions.tsx`
- `supabase/functions/notify-fcm-v2/index.ts`
- `supabase/functions/toggle-user-ban/index.ts`
- `supabase/functions/daily-store-reset/index.ts`
- `supabase/functions/daily-handover-snapshot/index.ts`

---

## Phase 1: Schema Foundation (Migrations 1-5)

### Task 1: Add category/audience/action_key columns to notifications

**Files:**
- Create: `supabase/migrations/20260706000001_notifications_add_columns.sql`

**What this does:** Adds three new columns to the `notifications` table so each notification row carries its tier (`action_required` vs `actor_ack`), audience (`direct` vs `broadcast`), and a stable action key for deep-link routing and preference overrides. Backfills all existing rows.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Add category, audience, action_key columns to notifications
-- These columns support tiered broadcast, per-action preferences, and deep-link routing.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category   text NOT NULL DEFAULT 'action_required',
  ADD COLUMN IF NOT EXISTS audience   text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS action_key text;

-- Backfill existing rows (all predate the new model)
UPDATE public.notifications
SET category = 'action_required',
    audience = 'direct',
    action_key = NULL
WHERE category IS NULL;

-- Index for preference lookups
CREATE INDEX IF NOT EXISTS idx_notifications_action_key ON public.notifications(action_key);
```

- [ ] **Step 2: Verify**

Run via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000001_notifications_add_columns`.

After applying, run in SQL worksheet:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='notifications'
  AND column_name IN ('category','audience','action_key')
ORDER BY column_name;
```
Expected: 3 rows returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000001_notifications_add_columns.sql
git commit -m "migrations: add category/audience/action_key columns to notifications"
```

---

### Task 2: Enforce global FCM token uniqueness + upsert RPC

**Files:**
- Create: `supabase/migrations/20260706000002_fcm_tokens_global_unique.sql`

**What this does:** De-duplicates existing `fcm_tokens` rows (same token under multiple user_ids), adds a UNIQUE constraint on `token`, and creates `upsert_fcm_token()` which atomically deletes other users' rows with the same token before upserting. This is the fix for "Android native notifications not delivered to the right device."

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Enforce global uniqueness on fcm_tokens.token
-- and create upsert_fcm_token() RPC for atomic token ownership swap.

-- 1. De-duplicate: keep only the most recently updated row per token.
DELETE FROM public.fcm_tokens a
USING public.fcm_tokens b
WHERE a.token = b.token
  AND a.updated_at < b.updated_at;

-- 2. Add global UNIQUE constraint on token.
--    This will fail if duplicates still exist (race condition); re-run if needed.
ALTER TABLE public.fcm_tokens
  ADD CONSTRAINT fcm_tokens_token_unique UNIQUE (token);

-- 3. Create upsert_fcm_token RPC: delete other users' rows with same token, then upsert.
CREATE OR REPLACE FUNCTION public.upsert_fcm_token(
  p_user_id uuid,
  p_token text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Token is globally unique. Any other user still holding this token loses it.
  DELETE FROM public.fcm_tokens
  WHERE token = p_token AND user_id IS DISTINCT FROM p_user_id;

  INSERT INTO public.fcm_tokens (user_id, token, platform, updated_at)
  VALUES (p_user_id, p_token, p_platform, now())
  ON CONFLICT (user_id, token) DO UPDATE
    SET platform = EXCLUDED.platform, updated_at = now();
END;
$$;

-- 4. Grant execute to authenticated (the client calls this via supabase.rpc(...))
GRANT EXECUTE ON FUNCTION public.upsert_fcm_token(uuid, text, text) TO authenticated;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000002_fcm_tokens_global_unique`.

Then run in SQL worksheet:
```sql
-- Verify no duplicate tokens remain
SELECT token, count(*) AS cnt
FROM public.fcm_tokens
GROUP BY token
HAVING count(*) > 1;

-- Verify upsert_fcm_token exists
SELECT proname FROM pg_proc WHERE proname = 'upsert_fcm_token';
```
Expected: first query returns 0 rows; second returns 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000002_fcm_tokens_global_unique.sql
git commit -m "migrations: enforce global FCM token uniqueness + upsert_fcm_token RPC"
```

---

### Task 3: Create user_notification_action_overrides table

**Files:**
- Create: `supabase/migrations/20260706000003_user_notification_action_overrides.sql`

**What this does:** Creates a fine-grained per-action preference table so users can mute specific action types (e.g. `expense_claim.submitted`) without muting the entire category.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Create user_notification_action_overrides table
-- Fine-grained per-action notification preferences.

CREATE TABLE IF NOT EXISTS public.user_notification_action_overrides (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key  text NOT NULL,
  enabled     boolean NOT NULL,
  PRIMARY KEY (user_id, action_key)
);

ALTER TABLE public.user_notification_action_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own action overrides"
  ON public.user_notification_action_overrides FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "service_role full access"
  ON public.user_notification_action_overrides FOR ALL
  USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000003_user_notification_action_overrides`.

Run:
```sql
SELECT relname, relkind FROM pg_class WHERE relname = 'user_notification_action_overrides';
```
Expected: returns 1 row with `relkind = 'r'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000003_user_notification_action_overrides.sql
git commit -m "migrations: create user_notification_action_overrides table with RLS"
```

---

### Task 4: Create public.notify() and _notify_one() RPCs

**Files:**
- Create: `supabase/migrations/20260706000004_notify_rpc.sql`

**What this does:** Creates the `public.notify(jsonb)` fan-out RPC and the internal `public._notify_one(...)` helper. `notify()` takes a payload describing the action, fans the notification out to direct recipients + broadcast admins, and checks preferences before inserting.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Create public.notify(jsonb) and public._notify_one(...) RPCs
-- These are the single source of truth for all notification inserts.

CREATE OR REPLACE FUNCTION public._notify_one(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text,
  p_category text,
  p_audience text,
  p_action_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  -- Fine-grained override wins
  SELECT enabled INTO v_enabled
  FROM public.user_notification_action_overrides
  WHERE user_id = p_user_id AND action_key = p_action_key;

  IF v_enabled IS NULL THEN
    -- Fall back to coarse category preference
    SELECT
      CASE
        WHEN p_type IN ('order','order_created','order_assigned','order_fulfilled') THEN COALESCE(orders_enabled, true)
        WHEN p_type IN ('payment','sales','sale','sale_return') THEN COALESCE(sales_enabled, true)
        WHEN p_type IN ('stock_transfer','stock_request','stock_return') THEN COALESCE(transfers_enabled, true)
        WHEN p_type IN ('handover') THEN COALESCE(handovers_enabled, true)
        ELSE COALESCE(system_enabled, true)
      END INTO v_enabled
    FROM (SELECT 1) dummy
    LEFT JOIN public.user_notification_preferences p ON p.user_id = p_user_id;

    IF v_enabled IS NULL THEN v_enabled := true; END IF;
  END IF;

  IF NOT v_enabled THEN RETURN; END IF;

  INSERT INTO public.notifications
    (user_id, title, message, type, entity_type, entity_id, category, audience, action_key)
  VALUES
    (p_user_id, p_title, p_message, p_type, p_entity_type, p_entity_id, p_category, p_audience, p_action_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_key      text   := p_payload->>'action_key';
  v_title           text   := p_payload->>'title';
  v_message         text   := p_payload->>'message';
  v_type            text   := p_payload->>'type';
  v_entity_type     text   := p_payload->>'entity_type';
  v_entity_id       text   := p_payload->>'entity_id';
  v_category        text   := COALESCE(p_payload->>'category', 'action_required');
  v_recipients      jsonb  := COALESCE(p_payload->'recipients', '[]'::jsonb);
  v_broadcast_admin boolean := COALESCE((p_payload->'broadcast_to_admins')::boolean, false);
  v_admin_ids       uuid[] := ARRAY[]::uuid[];
  r                 uuid;
  recipient_row     jsonb;
  recipient_id      uuid;
BEGIN
  -- Admin broadcast set
  IF v_broadcast_admin THEN
    SELECT array_agg(user_id) INTO v_admin_ids
    FROM public.user_roles
    WHERE role IN ('super_admin', 'manager');
  END IF;

  -- Direct recipients
  FOR recipient_row IN SELECT * FROM jsonb_array_elements(v_recipients)
  LOOP
    recipient_id := (recipient_row->>'user_id')::uuid;
    IF recipient_id IS NOT NULL THEN
      PERFORM public._notify_one(
        recipient_id, v_title, v_message, v_type,
        v_entity_type, v_entity_id, v_category, 'direct', v_action_key
      );
    END IF;
  END LOOP;

  -- Broadcast to admins
  FOREACH r IN ARRAY v_admin_ids LOOP
    PERFORM public._notify_one(
      r, v_title, v_message, v_type,
      v_entity_type, v_entity_id, v_category, 'broadcast', v_action_key
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public._notify_one(uuid, text, text, text, text, text, text, text, text) TO authenticated;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000004_notify_rpc`.

Smoke test:
```sql
-- This should insert one notification for user 24726a83-fae5-41df-99c3-d827ab01bd8f
SELECT public.notify(jsonb_build_object(
  'action_key', 'test.ping',
  'title', 'Test Ping',
  'message', 'This is a test notification',
  'type', 'system',
  'entity_type', 'test',
  'entity_id', '00000000-0000-0000-0000-000000000000',
  'category', 'action_required',
  'recipients', '[{"user_id":"24726a83-fae5-41df-99c3-d827ab01bd8f"}]'::jsonb,
  'broadcast_to_admins', false
));

SELECT id, user_id, category, audience, action_key, title
FROM public.notifications
WHERE action_key = 'test.ping';
```
Expected: one row returned for the test user. Then delete it:
```sql
DELETE FROM public.notifications WHERE action_key = 'test.ping';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000004_notify_rpc.sql
git commit -m "migrations: create public.notify(jsonb) and _notify_one() RPCs"
```

---

### Task 5: Extend FCM trigger to pass category/action_key

**Files:**
- Create: `supabase/migrations/20260706000005_extend_notification_fcm_trigger.sql`

**What this does:** Updates the existing `handle_notification_insert_fcm()` trigger to include `category` and `action_key` in the FCM `data` payload, so the native app can route deep-links and map to notification channels.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Extend handle_notification_insert_fcm to pass category + action_key to FCM.

CREATE OR REPLACE FUNCTION public.handle_notification_insert_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  supabase_url text;
  is_enabled boolean;
BEGIN
  -- Determine if this category is enabled by the user's notification preferences
  SELECT
    CASE
      WHEN NEW.type IN ('order', 'order_created', 'order_assigned', 'order_fulfilled') THEN COALESCE(p.orders_enabled, true)
      WHEN NEW.type IN ('payment', 'sales', 'sale', 'sale_return') THEN COALESCE(p.sales_enabled, true)
      WHEN NEW.type IN ('stock_transfer', 'stock_request', 'stock_return') THEN COALESCE(p.transfers_enabled, true)
      WHEN NEW.type IN ('handover') THEN COALESCE(p.handovers_enabled, true)
      ELSE COALESCE(p.system_enabled, true)
    END INTO is_enabled
  FROM (SELECT 1) dummy
  LEFT JOIN public.user_notification_preferences p ON p.user_id = NEW.user_id;

  IF is_enabled IS NULL THEN is_enabled := true; END IF;
  IF NOT is_enabled THEN RETURN NEW; END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://vrhptrtgrpftycvojaqo.supabase.co';
  END IF;

  PERFORM
    net.http_post(
      url := supabase_url || '/functions/v1/notify-fcm-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU'
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', NEW.message,
        'type', NEW.type,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'category', NEW.category,
        'action_key', NEW.action_key
      ),
      timeout_milliseconds := 10000
    );

  RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000005_extend_notification_fcm_trigger`.

Run:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_notification_insert_fcm';
```
Verify the body includes `'category', NEW.category` and `'action_key', NEW.action_key`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000005_extend_notification_fcm_trigger.sql
git commit -m "migrations: extend FCM trigger to pass category + action_key"
```

---

## Phase 2: Sales / Transactions / Returns Triggers (Migrations 6-8)

### Task 6: Sales AFTER INSERT trigger

**Files:**
- Create: `supabase/migrations/20260706000006_sales_trigger.sql`

**What this does:** After a sale is inserted, emits an `action_required` notification to admins (broadcast) and an `actor_ack` to the recorder. This replaces the UI-side `sendNotificationToMany` calls in `Sales.tsx` and `useRecordSale.ts`.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on sales → public.notify(...)

CREATE OR REPLACE FUNCTION public.notify_on_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_name text;
  v_agent_name text;
BEGIN
  SELECT name INTO v_store_name FROM public.stores WHERE id = NEW.store_id;
  SELECT full_name INTO v_agent_name FROM public.profiles WHERE user_id = NEW.recorded_by;

  -- Ack to the recorder
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'sale.recorded',
    'title', 'Sale Recorded',
    'message', format('Sale %s of %s at %s', NEW.display_id, to_char(NEW.total_amount, 'FM999,999,990'), COALESCE(v_store_name, 'store')),
    'type', 'payment',
    'entity_type', 'sale',
    'entity_id', NEW.id::text,
    'category', 'actor_ack',
    'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.recorded_by))
  ));

  -- Broadcast to admins/managers
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'sale.recorded',
    'title', 'New Sale Recorded',
    'message', format('%s recorded sale %s of %s at %s',
      COALESCE(v_agent_name, 'Staff'), NEW.display_id,
      to_char(NEW.total_amount, 'FM999,999,990'), COALESCE(v_store_name, 'store')),
    'type', 'payment',
    'entity_type', 'sale',
    'entity_id', NEW.id::text,
    'category', 'action_required',
    'recipients', '[]'::jsonb,
    'broadcast_to_admins', true
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_notify ON public.sales;
CREATE TRIGGER trg_sale_notify
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_sale_insert();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000006_sales_trigger`.

Verify trigger exists:
```sql
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.sales'::regclass AND tgname = 'trg_sale_notify';
```
Expected: 1 row, `tgenabled = 'O'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000006_sales_trigger.sql
git commit -m "migrations: add sales AFTER INSERT notification trigger"
```

---

### Task 7: Transactions AFTER INSERT trigger

**Files:**
- Create: `supabase/migrations/20260706000007_transactions_trigger.sql`

**What this does:** After a transaction (cash/UPI payment receipt) is inserted, emits `action_required` to admins+managers and, if the customer has a linked `user_id`, sends an ack to the customer.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on transactions → public.notify(...)

CREATE OR REPLACE FUNCTION public.notify_on_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust_user_id uuid;
  v_customer_name text;
BEGIN
  -- Get customer name for message
  SELECT full_name INTO v_customer_name
  FROM public.customers WHERE id = NEW.customer_id;

  -- Ack to the recorder
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'transaction.recorded',
    'title', 'Payment Recorded',
    'message', format('Payment of %s recorded for %s', to_char(NEW.amount, 'FM999,999,990'), COALESCE(v_customer_name, 'customer')),
    'type', 'payment',
    'entity_type', 'transaction',
    'entity_id', NEW.id::text,
    'category', 'actor_ack',
    'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.recorded_by))
  ));

  -- Broadcast to admins
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'transaction.recorded',
    'title', 'Payment Received',
    'message', format('Payment of %s recorded for %s', to_char(NEW.amount, 'FM999,999,990'), COALESCE(v_customer_name, 'customer')),
    'type', 'payment',
    'entity_type', 'transaction',
    'entity_id', NEW.id::text,
    'category', 'action_required',
    'recipients', '[]'::jsonb,
    'broadcast_to_admins', true
  ));

  -- Notify customer if linked
  IF NEW.customer_id IS NOT NULL THEN
    SELECT user_id INTO v_cust_user_id FROM public.customers WHERE id = NEW.customer_id;
    IF v_cust_user_id IS NOT NULL THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'transaction.customer_notified',
        'title', 'Payment Received',
        'message', format('Your payment of %s has been recorded', to_char(NEW.amount, 'FM999,999,990')),
        'type', 'payment',
        'entity_type', 'transaction',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', v_cust_user_id))
      ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_notify ON public.transactions;
CREATE TRIGGER trg_transaction_notify
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_transaction_insert();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000007_transactions_trigger`.

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.transactions'::regclass AND tgname = 'trg_transaction_notify';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000007_transactions_trigger.sql
git commit -m "migrations: add transactions AFTER INSERT notification trigger"
```

---

### Task 8: Sale returns triggers (request + approve/reject)

**Files:**
- Create: `supabase/migrations/20260706000008_sale_returns_trigger.sql`

**What this does:** After a sale return is inserted (request), emits `action_required` to admins. After approval_status changes to approved/rejected, emits `actor_ack` to the requester. Replaces the UI call in `SaleReturnDialog.tsx`.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT OR UPDATE trigger on sale_returns → public.notify(...)

CREATE OR REPLACE FUNCTION public.notify_on_sale_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT (new return request)
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'sale_return.requested',
      'title', 'Return Request: ' || NEW.display_id,
      'message', format('Return requested: %s. Reason: %s', NEW.display_id, COALESCE(NEW.reason, 'none')),
      'type', 'sale_return',
      'entity_type', 'sale_return',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));

    -- Ack to requester
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'sale_return.requested',
      'title', 'Return Request Raised',
      'message', format('Your return request %s has been submitted', NEW.display_id),
      'type', 'sale_return',
      'entity_type', 'sale_return',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.created_by))
    ));
  END IF;

  -- On UPDATE (status changed)
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'sale_return.approved',
        'title', 'Return Approved',
        'message', format('Your return request %s has been approved', NEW.display_id),
        'type', 'sale_return',
        'entity_type', 'sale_return',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.created_by))
      ));
    ELSIF NEW.approval_status = 'rejected' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'sale_return.rejected',
        'title', 'Return Rejected',
        'message', format('Your return request %s has been rejected', NEW.display_id),
        'type', 'sale_return',
        'entity_type', 'sale_return',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.created_by))
      ));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_return_notify ON public.sale_returns;
CREATE TRIGGER trg_sale_return_notify
  AFTER INSERT OR UPDATE ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_sale_return();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000008_sale_returns_trigger`.

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.sale_returns'::regclass AND tgname = 'trg_sale_return_notify';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000008_sale_returns_trigger.sql
git commit -m "migrations: add sale_returns notification triggers (request + approve/reject)"
```

---

## Phase 3: Orders / Payment Returns (Migrations 9-10)

### Task 9: Orders triggers (place/assign/fulfill/cancel)

**Files:**
- Create: `supabase/migrations/20260706000009_orders_triggers.sql`

**What this does:** Fires notifications on: new order placed (source-aware for auto vs manual), order assigned, order transferred (re-assigned), order fulfilled/delivered. This replaces UI-side calls in `Orders.tsx`, `AdminOrders.tsx`, `OrderFulfillmentDialog.tsx`, and `CustomerOrders.tsx`. Note: `cancel_order` RPC already handles its own notification server-side — we leave that alone.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT OR UPDATE triggers on orders → public.notify(...)

CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_name text;
  v_customer_name text;
  v_cust_user_id uuid;
  v_agent_name text;
BEGIN
  SELECT name INTO v_store_name FROM public.stores WHERE id = NEW.store_id;

  -- On INSERT (new order)
  IF TG_OP = 'INSERT' THEN
    -- Skip auto-orders broadcast if you want; but admins still see them
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'order.placed',
      'title', 'New Order Created',
      'message', format('Order %s placed for %s (source: %s)', NEW.display_id, COALESCE(v_store_name, 'store'), COALESCE(NEW.source, 'manual')),
      'type', 'order',
      'entity_type', 'order',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));

    -- Ack to customer if linked
    IF NEW.customer_id IS NOT NULL THEN
      SELECT user_id INTO v_cust_user_id FROM public.customers WHERE id = NEW.customer_id;
      IF v_cust_user_id IS NOT NULL THEN
        PERFORM public.notify(jsonb_build_object(
          'action_key', 'order.placed',
          'title', 'Order Received',
          'message', format('Your order %s has been received', NEW.display_id),
          'type', 'order',
          'entity_type', 'order',
          'entity_id', NEW.id::text,
          'category', 'actor_ack',
          'recipients', jsonb_build_array(jsonb_build_object('user_id', v_cust_user_id))
        ));
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- On UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Order assigned
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      SELECT full_name INTO v_agent_name FROM public.profiles WHERE user_id = NEW.assigned_to;
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'order.assigned',
        'title', 'Order Assigned',
        'message', format('Order %s has been assigned to %s', NEW.display_id, COALESCE(v_agent_name, 'staff')),
        'type', 'order',
        'entity_type', 'order',
        'entity_id', NEW.id::text,
        'category', 'action_required',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.assigned_to))
      ));
    END IF;

    -- Order transferred (old assignee ack)
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'order.transferred',
        'title', 'Order Transferred',
        'message', format('Order %s has been transferred to another agent', NEW.display_id),
        'type', 'order',
        'entity_type', 'order',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', OLD.assigned_to))
      ));
    END IF;

    -- Order fulfilled/delivered
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
      -- Ack to customer
      IF NEW.customer_id IS NOT NULL THEN
        SELECT user_id INTO v_cust_user_id FROM public.customers WHERE id = NEW.customer_id;
        IF v_cust_user_id IS NOT NULL THEN
          PERFORM public.notify(jsonb_build_object(
            'action_key', 'order.fulfilled',
            'title', 'Order Delivered',
            'message', format('Order %s has been fulfilled', NEW.display_id),
            'type', 'order_fulfilled',
            'entity_type', 'order',
            'entity_id', NEW.id::text,
            'category', 'actor_ack',
            'recipients', jsonb_build_array(jsonb_build_object('user_id', v_cust_user_id))
          ));
        END IF;
      END IF;

      -- Broadcast to admins
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'order.fulfilled',
        'title', 'Order Fulfilled',
        'message', format('Order %s has been delivered', NEW.display_id),
        'type', 'order_fulfilled',
        'entity_type', 'order',
        'entity_id', NEW.id::text,
        'category', 'action_required',
        'recipients', '[]'::jsonb,
        'broadcast_to_admins', true
      ));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_notify ON public.orders;
CREATE TRIGGER trg_order_notify
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000009_orders_triggers`.

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'trg_order_notify';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000009_orders_triggers.sql
git commit -m "migrations: add orders notification triggers (place/assign/fulfill)"
```

---

### Task 10: Payment returns AFTER INSERT trigger

**Files:**
- Create: `supabase/migrations/20260706000010_payment_returns_trigger.sql`

**What this does:** After a payment return is inserted, notifies the customer (if linked) and broadcasts to admins.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on payment_returns → public.notify(...)

CREATE OR REPLACE FUNCTION public.notify_on_payment_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust_user_id uuid;
  v_customer_name text;
BEGIN
  SELECT full_name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;

  -- Ack to recorder
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'payment_return.recorded',
    'title', 'Payment Return Created',
    'message', format('Payment return of %s recorded for %s', to_char(NEW.amount, 'FM999,999,990'), COALESCE(v_customer_name, 'customer')),
    'type', 'payment',
    'entity_type', 'payment_return',
    'entity_id', NEW.id::text,
    'category', 'actor_ack',
    'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.recorded_by))
  ));

  -- Notify customer
  IF NEW.customer_id IS NOT NULL THEN
    SELECT user_id INTO v_cust_user_id FROM public.customers WHERE id = NEW.customer_id;
    IF v_cust_user_id IS NOT NULL THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'payment_return.customer_notified',
        'title', 'Payment Return',
        'message', format('A payment return of %s has been processed for your account', to_char(NEW.amount, 'FM999,999,990')),
        'type', 'payment',
        'entity_type', 'payment_return',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', v_cust_user_id))
      ));
    END IF;
  END IF;

  -- Broadcast to admins
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'payment_return.recorded',
    'title', 'Payment Return',
    'message', format('Payment return of %s for %s', to_char(NEW.amount, 'FM999,999,990'), COALESCE(v_customer_name, 'customer')),
    'type', 'payment',
    'entity_type', 'payment_return',
    'entity_id', NEW.id::text,
    'category', 'action_required',
    'recipients', '[]'::jsonb,
    'broadcast_to_admins', true
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_return_notify ON public.payment_returns;
CREATE TRIGGER trg_payment_return_notify
  AFTER INSERT ON public.payment_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payment_return();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000010_payment_returns_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000010_payment_returns_trigger.sql
git commit -m "migrations: add payment_returns AFTER INSERT notification trigger"
```

---

## Phase 4: Consolidate Existing Triggers (Migrations 11-13)

### Task 11: Consolidate handovers trigger

**Files:**
- Create: `supabase/migrations/20260706000011_consolidate_handovers_trigger.sql`

**What this does:** Replaces the existing `trg_handovers_notifications` function body with one that calls `public.notify(...)`, adding proper `action_key`, `category`, and the missing "admin-cancel of confirmed handover" branch. All UI-side `sendNotification` calls in `Handovers.tsx`, `AdminHandovers.tsx`, and `AgentHistory.tsx` will be deleted in Phase 8.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Rewrite trg_handovers_notifications to use public.notify(...)

CREATE OR REPLACE FUNCTION public.trg_handovers_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On INSERT (new handover)
  IF TG_OP = 'INSERT' THEN
    IF NEW.handed_to IS NOT NULL THEN
      -- Notify recipient
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'handover.requested',
        'title', 'New Handover',
        'message', format('You received a handover of %s', NEW.cash_amount),
        'type', 'handover',
        'entity_type', 'handover',
        'entity_id', NEW.id::text,
        'category', 'action_required',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.handed_to))
      ));
    END IF;
    RETURN NULL;
  END IF;

  -- On UPDATE (status changed)
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'confirmed' THEN
      -- Ack to sender
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'handover.confirmed',
        'title', 'Handover Confirmed',
        'message', format('Your handover of %s was confirmed', NEW.cash_amount),
        'type', 'handover',
        'entity_type', 'handover',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    ELSIF NEW.status = 'rejected' THEN
      -- Ack to sender
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'handover.rejected',
        'title', 'Handover Rejected',
        'message', format('Your handover of %s was rejected', NEW.cash_amount),
        'type', 'handover',
        'entity_type', 'handover',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    ELSIF NEW.status = 'cancelled' THEN
      IF OLD.status = 'confirmed' THEN
        -- Admin cancelled a confirmed handover — notify BOTH parties
        PERFORM public.notify(jsonb_build_object(
          'action_key', 'handover.cancelled_post_confirm',
          'title', 'Handover Cancelled',
          'message', format('A confirmed handover of %s was cancelled by admin', NEW.cash_amount),
          'type', 'handover',
          'entity_type', 'handover',
          'entity_id', NEW.id::text,
          'category', 'action_required',
          'recipients', jsonb_build_array(
            jsonb_build_object('user_id', NEW.user_id),
            CASE WHEN NEW.handed_to IS NOT NULL THEN jsonb_build_object('user_id', NEW.handed_to) ELSE NULL END
          ),
          'broadcast_to_admins', false
        ));
      ELSE
        -- Pending handover cancelled — notify recipient
        IF NEW.handed_to IS NOT NULL THEN
          PERFORM public.notify(jsonb_build_object(
            'action_key', 'handover.cancelled',
            'title', 'Handover Cancelled',
            'message', format('A handover of %s to you was cancelled', NEW.cash_amount),
            'type', 'handover',
            'entity_type', 'handover',
            'entity_id', NEW.id::text,
            'category', 'actor_ack',
            'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.handed_to))
          ));
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000011_consolidate_handovers_trigger`.

Verify the function body now calls `public.notify`:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'trg_handovers_notifications';
```
Expected: the body contains `PERFORM public.notify(jsonb_build_object(`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000011_consolidate_handovers_trigger.sql
git commit -m "migrations: consolidate handovers notification trigger to use public.notify()"
```

---

### Task 12: Consolidate stock transfers triggers

**Files:**
- Create: `supabase/migrations/20260706000012_consolidate_stock_transfers_trigger.sql`

**What this does:** Folds the two existing triggers (`stock_transfer_notification` → `notify_stock_transfer` and `trg_stock_transfers_notifications`) into one AFTER INSERT OR UPDATE trigger that calls `public.notify(...)`. Also rewrites the `approve_stock_transfer`, `accept_stock_transfer`, and `cancel_stock_transfer` RPCs to use `public.notify(...)` instead of raw `INSERT INTO notifications`.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Consolidate stock_transfers notification triggers + rewrite RPCs

-- 1. Consolidated trigger
CREATE OR REPLACE FUNCTION public.notify_on_stock_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name text;
  v_from_name text;
  v_quantity numeric;
BEGIN
  -- On INSERT (new transfer request)
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
    v_quantity := NEW.quantity;
    SELECT full_name INTO v_from_name FROM public.profiles WHERE user_id = COALESCE(NEW.from_user_id, NEW.created_by);

    -- Notify recipient
    IF NEW.transfer_type IN ('warehouse_to_staff', 'staff_to_staff') AND NEW.to_user_id IS NOT NULL THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'stock_transfer.requested',
        'title', 'Stock Transfer Request',
        'message', format('You received %s x %s from %s', v_quantity, COALESCE(v_product_name, 'items'), COALESCE(v_from_name, 'warehouse')),
        'type', 'stock_transfer',
        'entity_type', 'stock_transfers',
        'entity_id', NEW.id::text,
        'category', 'action_required',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.to_user_id))
      ));
    END IF;

    -- Broadcast to admins/managers (for approval)
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'stock_transfer.requested',
      'title', 'Stock Transfer Request',
      'message', format('Transfer of %s x %s requested by %s', v_quantity, COALESCE(v_product_name, 'items'), COALESCE(v_from_name, 'staff')),
      'type', 'stock_transfer',
      'entity_type', 'stock_transfers',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));
  END IF;

  -- On UPDATE (status changed)
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'stock_transfer.completed',
        'title', 'Transfer Completed',
        'message', 'Your stock transfer was accepted and completed',
        'type', 'stock_transfer',
        'entity_type', 'stock_transfers',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.created_by))
      ));
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.to_user_id IS NOT NULL THEN
        PERFORM public.notify(jsonb_build_object(
          'action_key', 'stock_transfer.cancelled',
          'title', 'Transfer Cancelled',
          'message', 'A pending stock transfer to you was cancelled',
          'type', 'stock_transfer',
          'entity_type', 'stock_transfers',
          'entity_id', NEW.id::text,
          'category', 'actor_ack',
          'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.to_user_id))
        ));
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Replace both old triggers with the consolidated one
DROP TRIGGER IF EXISTS stock_transfer_notification ON public.stock_transfers;
DROP TRIGGER IF EXISTS trg_stock_transfers_notifications ON public.stock_transfers;

CREATE TRIGGER trg_stock_transfer_notify
  AFTER INSERT OR UPDATE ON public.stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_stock_transfer();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000012_consolidate_stock_transfers_trigger`.

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.stock_transfers'::regclass;
```
Expected: only `trg_stock_transfer_notify` exists (old triggers dropped).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000012_consolidate_stock_transfers_trigger.sql
git commit -m "migrations: consolidate stock_transfers triggers into single notify path"
```

---

### Task 13: Extend expense claims trigger

**Files:**
- Create: `supabase/migrations/20260706000013_extend_expense_claims_trigger.sql`

**What this does:** Extends the existing `trg_expense_claims_notifications` to (a) add the missing ack-to-actor on INSERT ("claim submitted"), and (b) handle the `paid` status. Note: the `paid` status may not exist in the current workflow — the trigger simply listens for it so it's ready when the workflow evolves.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Extend trg_expense_claims_notifications

CREATE OR REPLACE FUNCTION public.trg_expense_claims_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On INSERT (new claim)
  IF TG_OP = 'INSERT' THEN
    -- Broadcast to admins
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'expense_claim.submitted',
      'title', 'New Expense Claim',
      'message', format('New expense claim for %s requires review', NEW.amount),
      'type', 'system',
      'entity_type', 'expense_claim',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));

    -- Ack to the claimant
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'expense_claim.submitted',
      'title', 'Claim Submitted',
      'message', format('Your expense claim for %s has been submitted', NEW.amount),
      'type', 'system',
      'entity_type', 'expense_claim',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
    ));
  END IF;

  -- On Update (status changed)
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'expense_claim.approved',
        'title', 'Expense Claim Approved',
        'message', format('Your expense claim for %s was approved', NEW.amount),
        'type', 'system',
        'entity_type', 'expense_claim',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'expense_claim.rejected',
        'title', 'Expense Claim Rejected',
        'message', format('Your expense claim for %s was rejected', NEW.amount),
        'type', 'system',
        'entity_type', 'expense_claim',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    ELSIF NEW.status = 'paid' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'expense_claim.paid',
        'title', 'Expense Claim Paid',
        'message', format('Your expense claim for %s has been paid', NEW.amount),
        'type', 'system',
        'entity_type', 'expense_claim',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000013_extend_expense_claims_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000013_extend_expense_claims_trigger.sql
git commit -m "migrations: extend expense_claims trigger with ack-to-actor + paid status"
```

---

## Phase 5: New Triggers — Customers / KYC / Routes (Migrations 14-18)

### Task 14: Customer self-registration welcome + admin broadcast

**Files:**
- Create: `supabase/migrations/20260706000014_customers_welcome_trigger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on customers → welcome notification

CREATE OR REPLACE FUNCTION public.notify_on_customer_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    -- Welcome to customer
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'customer.registered',
      'title', 'Welcome',
      'message', 'Welcome to Aqua Prime! Your account is ready.',
      'type', 'system',
      'entity_type', 'customer',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
    ));

    -- Broadcast to admins
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'customer.registered',
      'title', 'New Customer Registered',
      'message', format('New customer %s has registered', COALESCE(NEW.full_name, NEW.phone, 'unknown')),
      'type', 'system',
      'entity_type', 'customer',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_notify ON public.customers;
CREATE TRIGGER trg_customer_notify
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_customer_insert();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000014_customers_welcome_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000014_customers_welcome_trigger.sql
git commit -m "migrations: add customer self-registration welcome + admin notification trigger"
```

---

### Task 15: Staff invitations trigger

**Files:**
- Create: `supabase/migrations/20260706000015_staff_invitations_trigger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on staff_invitations → notification

CREATE OR REPLACE FUNCTION public.notify_on_staff_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ack to inviter
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'staff.invited',
    'title', 'Invitation Sent',
    'message', format('Invitation sent to %s', NEW.email),
    'type', 'system',
    'entity_type', 'staff_invitation',
    'entity_id', NEW.id::text,
    'category', 'actor_ack',
    'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.invited_by))
  ));

  -- Broadcast to admins
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'staff.invited',
    'title', 'Staff Invited',
    'message', format('New staff invitation sent to %s by %s', NEW.email, COALESCE((SELECT full_name FROM public.profiles WHERE user_id = NEW.invited_by), 'admin')),
    'type', 'system',
    'entity_type', 'staff_invitation',
    'entity_id', NEW.id::text,
    'category', 'action_required',
    'recipients', '[]'::jsonb,
    'broadcast_to_admins', true
  ));

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_invitation_notify ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitation_notify
  AFTER INSERT ON public.staff_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_staff_invitation();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000015_staff_invitations_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000015_staff_invitations_trigger.sql
git commit -m "migrations: add staff_invitations notification trigger"
```

---

### Task 16: KYC upload + status change triggers

**Files:**
- Create: `supabase/migrations/20260706000016_kyc_upload_and_status_trigger.sql`

**What this does:** KYC lives on `customers` columns (`kyc_aadhar_front_url`, `kyc_aadhar_back_url`, `kyc_selfie_url`, `kyc_status`). Fires on: (a) KYC URL transition from NULL → NOT NULL (upload detected), (b) `kyc_status` change to verified/rejected.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER UPDATE trigger on customers → KYC upload + status change notifications

CREATE OR REPLACE FUNCTION public.notify_on_kyc_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_just_uploaded boolean;
BEGIN
  -- Detect KYC document upload (any URL went from NULL to NOT NULL)
  v_just_uploaded := (
    (OLD.kyc_aadhar_front_url IS DISTINCT FROM NEW.kyc_aadhar_front_url AND NEW.kyc_aadhar_front_url IS NOT NULL)
    OR (OLD.kyc_aadhar_back_url IS DISTINCT FROM NEW.kyc_aadhar_back_url AND NEW.kyc_aadhar_back_url IS NOT NULL)
    OR (OLD.kyc_selfie_url IS DISTINCT FROM NEW.kyc_selfie_url AND NEW.kyc_selfie_url IS NOT NULL)
  );

  -- KYC uploaded
  IF v_just_uploaded AND NEW.user_id IS NOT NULL THEN
    -- Ack to customer
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'kyc.uploaded',
      'title', 'KYC Submitted',
      'message', 'Your KYC documents have been submitted for review',
      'type', 'system',
      'entity_type', 'customer',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
    ));

    -- Broadcast to admins
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'kyc.uploaded',
      'title', 'KYC Documents Uploaded',
      'message', format('KYC documents uploaded by %s', COALESCE(NEW.full_name, NEW.phone, 'customer')),
      'type', 'system',
      'entity_type', 'customer',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));
  END IF;

  -- KYC status changed
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status AND NEW.user_id IS NOT NULL THEN
    IF NEW.kyc_status = 'verified' OR NEW.kyc_status = 'approved' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'kyc.verified',
        'title', 'KYC Verified',
        'message', 'Your KYC has been verified. You now have full access.',
        'type', 'system',
        'entity_type', 'customer',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    ELSIF NEW.kyc_status = 'rejected' THEN
      PERFORM public.notify(jsonb_build_object(
        'action_key', 'kyc.rejected',
        'title', 'KYC Rejected',
        'message', format('Your KYC was rejected. Reason: %s', COALESCE(NEW.kyc_rejection_reason, 'no reason provided')),
        'type', 'system',
        'entity_type', 'customer',
        'entity_id', NEW.id::text,
        'category', 'actor_ack',
        'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
      ));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_notify ON public.customers;
CREATE TRIGGER trg_kyc_notify
  AFTER UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_kyc_change();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000016_kyc_upload_and_status_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000016_kyc_upload_and_status_trigger.sql
git commit -m "migrations: add KYC upload + status change notification triggers"
```

---

### Task 17: Route sessions triggers (started + ended)

**Files:**
- Create: `supabase/migrations/20260706000017_route_sessions_trigger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT OR UPDATE trigger on route_sessions

CREATE OR REPLACE FUNCTION public.notify_on_route_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name text;
BEGIN
  -- On INSERT (route started)
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO v_agent_name FROM public.profiles WHERE user_id = NEW.user_id;

    -- Ack to agent
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'route.started',
      'title', 'Route Started',
      'message', 'Your route session has begun',
      'type', 'system',
      'entity_type', 'route_session',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
    ));

    -- Broadcast to admins
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'route.started',
      'title', 'Route Started',
      'message', format('%s started a route session', COALESCE(v_agent_name, 'Agent')),
      'type', 'system',
      'entity_type', 'route_session',
      'entity_id', NEW.id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));
  END IF;

  -- On UPDATE (route ended — ended_at went from NULL to NOT NULL)
  IF TG_OP = 'UPDATE' AND OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    SELECT full_name INTO v_agent_name FROM public.profiles WHERE user_id = NEW.user_id;

    -- Broadcast to admins
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'route.ended',
      'title', 'Route Ended',
      'message', format('%s ended route session', COALESCE(v_agent_name, 'Agent')),
      'type', 'system',
      'entity_type', 'route_session',
      'entity_id', NEW.id::text,
      'category', 'actor_ack',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_session_notify ON public.route_sessions;
CREATE TRIGGER trg_route_session_notify
  AFTER INSERT OR UPDATE ON public.route_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_route_session();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000017_route_sessions_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000017_route_sessions_trigger.sql
git commit -m "migrations: add route_sessions notification triggers (started + ended)"
```

---

### Task 18: Store visits AFTER INSERT trigger

**Files:**
- Create: `supabase/migrations/20260706000018_store_visits_trigger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: AFTER INSERT trigger on store_visits

CREATE OR REPLACE FUNCTION public.notify_on_store_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_name text;
  v_agent_name text;
BEGIN
  SELECT name INTO v_store_name FROM public.stores WHERE id = NEW.store_id;
  SELECT full_name INTO v_agent_name FROM public.profiles WHERE user_id = NEW.user_id;

  -- Ack to agent
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'store_visit.checked_in',
    'title', 'Checked In',
    'message', format('Checked in at %s', COALESCE(v_store_name, 'store')),
    'type', 'system',
    'entity_type', 'store_visit',
    'entity_id', NEW.id::text,
    'category', 'actor_ack',
    'recipients', jsonb_build_array(jsonb_build_object('user_id', NEW.user_id))
  ));

  -- Broadcast to admins
  PERFORM public.notify(jsonb_build_object(
    'action_key', 'store_visit.checked_in',
    'title', 'Store Check-in',
    'message', format('%s checked in at %s', COALESCE(v_agent_name, 'Agent'), COALESCE(v_store_name, 'store')),
    'type', 'system',
    'entity_type', 'store_visit',
    'entity_id', NEW.id::text,
    'category', 'action_required',
    'recipients', '[]'::jsonb,
    'broadcast_to_admins', true
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_visit_notify ON public.store_visits;
CREATE TRIGGER trg_store_visit_notify
  AFTER INSERT ON public.store_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_store_visit();
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000018_store_visits_trigger`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000018_store_visits_trigger.sql
git commit -m "migrations: add store_visits AFTER INSERT notification trigger"
```

---

## Phase 6: Stock Threshold + Ban Notification (Migrations 19-20)

### Task 19: Stock low threshold alert

**Files:**
- Create: `supabase/migrations/20260706000019_stock_low_threshold.sql`

**What this does:** Adds `low_stock_threshold` to `products` and a `last_low_alert_at` to `product_stock`. Creates a function that `daily-store-reset` can call to check for low-stock products and emit one notification per product that dropped below threshold since the last alert.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: Stock low threshold alert infrastructure

-- 1. Add threshold column to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric DEFAULT 0;

-- 2. Add last alert timestamp to product_stock
ALTER TABLE public.product_stock
  ADD COLUMN IF NOT EXISTS last_low_alert_at timestamptz;

-- 3. Function to check and emit low-stock notifications
CREATE OR REPLACE FUNCTION public.check_low_stock_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      ps.product_id,
      ps.warehouse_id,
      ps.quantity,
      p.low_stock_threshold,
      p.name AS product_name,
      ps.last_low_alert_at
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE p.low_stock_threshold > 0
      AND ps.quantity <= p.low_stock_threshold
      AND (ps.last_low_alert_at IS NULL OR ps.last_low_alert_at < now() - interval '24 hours')
  LOOP
    PERFORM public.notify(jsonb_build_object(
      'action_key', 'stock.low',
      'title', 'Stock Low',
      'message', format('%s is low on stock (%s remaining)', r.product_name, r.quantity),
      'type', 'system',
      'entity_type', 'product_stock',
      'entity_id', r.product_id::text,
      'category', 'action_required',
      'recipients', '[]'::jsonb,
      'broadcast_to_admins', true
    ));

    UPDATE public.product_stock
    SET last_low_alert_at = now()
    WHERE product_id = r.product_id AND warehouse_id = r.warehouse_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_low_stock_alerts() TO service_role;
```

- [ ] **Step 2: Verify**

Apply via `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260706000019_stock_low_threshold`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000019_stock_low_threshold.sql
git commit -m "migrations: add stock low threshold alert infrastructure"
```

---

### Task 20: toggle-user-ban notification

**Files:**
- Create: `supabase/migrations/20260706000020_toggle_user_ban_notification.sql`
- Modify: `supabase/functions/toggle-user-ban/index.ts`

**What this does:** The `toggle-user-ban` edge function currently bans/unbans silently. This adds notification inserts — a notification to the banned/unbanned user AND a broadcast to admins — using the service-role client (since `public.notify()` is not callable from edge functions without a JWT context that matches the SECURITY DEFINER expectations).

- [ ] **Step 1: Create the migration file (no DB changes, placeholder)**

```sql
-- Migration: toggle-user-ban notification
-- No DB schema changes needed. The notification inserts are done in the edge function
-- using the service-role client. This migration is a placeholder to track the change
-- in the migration sequence.
SELECT 1;
```

- [ ] **Step 2: Update the edge function**

Edit `supabase/functions/toggle-user-ban/index.ts`. Add notification inserts after the ban/unban logic, before the success response:

```typescript
    // After ban logic (ban = true):
    if (ban) {
      // ... existing ban logic ...

      // Notify the banned user
      await adminClient.from("notifications").insert({
        user_id,
        title: "Account Suspended",
        message: "Your account has been suspended. Contact your manager for more information.",
        type: "system",
        entity_type: "staff_account",
        entity_id: user_id,
        category: "actor_ack",
        audience: "direct",
        action_key: "staff.banned",
      });

      // Broadcast to other admins
      const { data: adminRoles } = await adminClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "manager"]);

      if (adminRoles?.length) {
        await adminClient.from("notifications").insert(
          adminRoles
            .filter((r: any) => r.user_id !== caller.id)
            .map((r: any) => ({
              user_id: r.user_id,
              title: "Staff Banned",
              message: `A staff member has been banned by ${caller.email}`,
              type: "system",
              entity_type: "staff_account",
              entity_id: user_id,
              category: "action_required",
              audience: "broadcast",
              action_key: "staff.banned",
            }))
        );
      }
    } else {
      // ... existing unban logic ...

      // Notify the unbanned user
      await adminClient.from("notifications").insert({
        user_id,
        title: "Account Restored",
        message: "Your account has been restored. You can now log in.",
        type: "system",
        entity_type: "staff_account",
        entity_id: user_id,
        category: "actor_ack",
        audience: "direct",
        action_key: "staff.unbanned",
      });

      // Broadcast to admins
      const { data: adminRoles2 } = await adminClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "manager"]);

      if (adminRoles2?.length) {
        await adminClient.from("notifications").insert(
          adminRoles2
            .filter((r: any) => r.user_id !== caller.id)
            .map((r: any) => ({
              user_id: r.user_id,
              title: "Staff Unbanned",
              message: `A staff member has been unbanned by ${caller.email}`,
              type: "system",
              entity_type: "staff_account",
              entity_id: user_id,
              category: "action_required",
              audience: "broadcast",
              action_key: "staff.unbanned",
            }))
        );
      }
    }
```

- [ ] **Step 3: Verify**

Apply migration:
```bash
supabase_apply_migration project_id=vrhptrtgrpftycvojaqo name=20260706000020_toggle_user_ban_notification query="SELECT 1;"
```

Deploy the edge function:
```bash
supabase_deploy_edge_function project_id=vrhptrtgrpftycvojaqo name=toggle-user-ban
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260706000020_toggle_user_ban_notification.sql supabase/functions/toggle-user-ban/index.ts
git commit -m "feat: add ban/unban notifications to toggle-user-ban edge function"
```

---

## Phase 7: Edge Function Updates

### Task 21: Update notify-fcm-v2 to map category → channel + pass action_key

**Files:**
- Modify: `supabase/functions/notify-fcm-v2/index.ts`

- [ ] **Step 1: Update the FCM payload**

In `supabase/functions/notify-fcm-v2/index.ts`, update the `sendFcmMessage` function to read `category` and `action_key` from the payload and map category to Android notification channel:

```typescript
// In the body construction inside sendFcmMessage:
const body = {
  message: {
    token: deviceToken,
    notification: {
      title: notif.title,
      body: notif.message,
    },
    data: {
      type: notif.type || "",
      entity_type: notif.entity_type || "",
      entity_id: notif.entity_id || "",
      category: notif.category || "action_required",
      action_key: notif.action_key || "",
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: notif.category === "action_required" ? "action_required" : "default",
        priority: "high" as const,
        icon: "ic_launcher",
        color: "#2196F3",
      },
    },
  },
};
```

Also update the `NotifPayload` interface to include the new fields:

```typescript
interface NotifPayload {
  user_id: string;
  title: string;
  message: string;
  type?: string;
  entity_type?: string;
  entity_id?: string;
  category?: string;
  action_key?: string;
}
```

- [ ] **Step 2: Deploy**

```bash
supabase_deploy_edge_function project_id=vrhptrtgrpftycvojaqo name=notify-fcm-v2
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-fcm-v2/index.ts
git commit -m "feat: update notify-fcm-v2 to map category to Android channel + pass action_key"
```

---

### Task 22: Add failure notifications to daily edge functions

**Files:**
- Modify: `supabase/functions/daily-store-reset/index.ts`
- Modify: `supabase/functions/daily-handover-snapshot/index.ts`

**What this does:** In the `catch` block of each cron edge function, insert an `action_required` notification to admins when the job fails, so admins know the nightly job didn't run.

- [ ] **Step 1: Update daily-store-reset catch block**

In `supabase/functions/daily-store-reset/index.ts`, add to the catch block (after `console.error`):

```typescript
  } catch (error) {
    console.error("daily-store-reset error:", error);

    // Notify admins of failure
    try {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "manager"]);

      if (adminRoles?.length) {
        await supabase.from("notifications").insert(
          adminRoles.map((r: any) => ({
            user_id: r.user_id,
            title: "Daily Store Reset Failed",
            message: `The daily store reset job failed: ${error instanceof Error ? error.message : "unknown error"}`,
            type: "system",
            entity_type: "cron",
            entity_id: "daily-store-reset",
            category: "action_required",
            audience: "broadcast",
            action_key: "cron.store_reset_failed",
          }))
        );
      }
    } catch { /* notification insert failed, nothing we can do */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
```

- [ ] **Step 2: Update daily-handover-snapshot catch block**

Same pattern in `supabase/functions/daily-handover-snapshot/index.ts`:

```typescript
  } catch (error) {
    console.error("daily-handover-snapshot error:", error);

    try {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "manager"]);

      if (adminRoles?.length) {
        await supabase.from("notifications").insert(
          adminRoles.map((r: any) => ({
            user_id: r.user_id,
            title: "Daily Handover Snapshot Failed",
            message: `The daily handover snapshot job failed: ${error instanceof Error ? error.message : "unknown error"}`,
            type: "system",
            entity_type: "cron",
            entity_id: "daily-handover-snapshot",
            category: "action_required",
            audience: "broadcast",
            action_key: "cron.handover_snapshot_failed",
          }))
        );
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
```

- [ ] **Step 3: Deploy both**

```bash
supabase_deploy_edge_function project_id=vrhptrtgrpftycvojaqo name=daily-store-reset
supabase_deploy_edge_function project_id=vrhptrtgrpftycvojaqo name=daily-handover-snapshot
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/daily-store-reset/index.ts supabase/functions/daily-handover-snapshot/index.ts
git commit -m "feat: add failure notification inserts to daily cron edge functions"
```

---

## Phase 8: Frontend Changes

### Task 23: Update useNotifications.ts — FCM upsert via RPC + remove foreground suppression

**Files:**
- Modify: `src/hooks/useNotifications.ts`

**What this does:** (a) Replace `saveFCMTokenToBackend()` to call the new `upsert_fcm_token` RPC, (b) remove the `pushNotificationReceived` listener that suppresses foreground system-tray notifications, (c) add deep-link routing on notification tap.

- [ ] **Step 1: Update saveFCMTokenToBackend**

Replace the body of `saveFCMTokenToBackend` (lines 49-69) to use the RPC:

```typescript
export async function saveFCMTokenToBackend(userId: string, token: string) {
  try {
    const lastSaved = localStorage.getItem(`saved_fcm_token_${userId}`);
    if (lastSaved === token) {
      logDebug("FCM token already synchronized for user", { userId });
      return;
    }

    const { error } = await supabase.rpc("upsert_fcm_token", {
      p_user_id: userId,
      p_token: token,
      p_platform: "android",
    });
    if (error) throw error;

    localStorage.setItem(`saved_fcm_token_${userId}`, token);
    localStorage.setItem("last_fcm_token", token);
    logDebug("FCM token synchronized to backend (global-unique)", { userId });
  } catch (err) {
    logError("Failed to synchronize FCM token to backend", err);
  }
}
```

- [ ] **Step 2: Remove foreground push suppression**

Delete or comment out the `pushNotificationReceived` listener block (the `handleForegroundPush` effect around lines 242-261). The default Android behavior will now show the system-tray notification even when the app is in the foreground.

- [ ] **Step 3: Add deep-link routing on notification tap**

Add a new `useEffect` after the existing ones:

```typescript
// Handle notification tap — route to the relevant screen
useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;

  let mounted = true;
  const handler = PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action: any) => {
      if (!mounted) return;
      const data = action.notification?.data || {};
      const entityType = data.entity_type;
      const entityId = data.entity_id;
      const actionKey = data.action_key;

      // Route based on action_key / entity_type
      if (entityType === "order") {
        window.location.href = "/orders";
      } else if (entityType === "sale" || entityType === "transaction") {
        window.location.href = "/sales";
      } else if (entityType === "handover") {
        window.location.href = "/handovers";
      } else if (entityType === "stock_transfers" || entityType === "stock_transfer") {
        window.location.href = "/stock-transfers";
      } else if (entityType === "expense_claim") {
        window.location.href = "/handovers";
      } else if (entityType === "route_session" || entityType === "store_visit") {
        window.location.href = "/routes";
      } else if (entityType === "customer") {
        window.location.href = "/customers";
      }
      // Default: open the bell/notifications page
      else {
        window.location.href = "/notifications";
      }
    }
  );

  return () => {
    mounted = false;
    try {
      (PushNotifications as any).removeListener("pushNotificationActionPerformed", handler);
    } catch { /* ignore */ }
  };
}, []);
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "fix: use FCM upsert RPC, remove foreground push suppression, add deep-link routing"
```

---

### Task 24: Register Android notification channels

**Files:**
- Modify: `android/app/src/main/java/.../MainActivity.java` (or via `@capgo/capacitor-local-notifications` config)

**What this does:** Registers two Android notification channels: `default` (normal priority) and `action_required` (high priority with sound + vibrate). The edge function `notify-fcm-v2` now maps `category=action_required` → channel `action_required`.

- [ ] **Step 1: Add channel registration in MainActivity.java**

Find `MainActivity.java` and add to `onCreate` (after the existing Capacitor plugin initialization):

```java
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

// In onCreate(), after super.onCreate():
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    NotificationManager nm = getSystemService(NotificationManager.class);

    NotificationChannel defaultChannel = new NotificationChannel(
        "default",
        "General Notifications",
        NotificationManager.IMPORTANCE_DEFAULT
    );
    defaultChannel.setDescription("General app notifications");
    nm.createNotificationChannel(defaultChannel);

    NotificationChannel actionChannel = new NotificationChannel(
        "action_required",
        "Action Required",
        NotificationManager.IMPORTANCE_HIGH
    );
    actionChannel.setDescription("Important notifications requiring your attention");
    actionChannel.enableVibration(true);
    actionChannel.setVibrationPattern(new long[]{0, 300, 200, 300});
    nm.createNotificationChannel(actionChannel);
}
```

- [ ] **Step 2: Verify**

Build the APK and confirm no errors: `npm run build:android`

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/
git commit -m "feat: register default + action_required Android notification channels"
```

---

## Phase 9: Delete UI-side sendNotification* calls

### Task 25: Delete sendNotification calls from web pages

**Files:**
- Modify: `src/pages/Handovers.tsx`
- Modify: `src/pages/Orders.tsx`
- Modify: `src/pages/Sales.tsx`
- Modify: `src/pages/Transactions.tsx`
- Modify: `src/pages/CustomerOrders.tsx`
- Modify: `src/hooks/useRecordSale.ts`
- Modify: `src/hooks/useFixedCostReminders.ts`
- Modify: `src/components/orders/OrderFulfillmentDialog.tsx`
- Modify: `src/components/sales/SaleReturnDialog.tsx`
- Modify: `src/components/inventory/StockTransferModal.tsx`

**What this does:** Removes all `sendNotification*` and `sendNotificationToMany` calls from web-side files. The DB triggers now handle all notification inserts. Toast calls are kept — those are the in-app confirmation for the actor.

- [ ] **Step 1: Delete sendNotification calls**

For each file:
1. Remove the `sendNotification` / `sendNotificationToMany` call(s) and their surrounding promise chain.
2. Remove the corresponding import (`import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications"`).
3. Keep all `toast.success(...)` calls — those are still wanted.

Example pattern to remove:
```typescript
// REMOVE THIS ENTIRE BLOCK:
getAdminUserIds()
  .then((ids) => {
    const others = ids.filter((id) => id !== user!.id);
    if (others.length > 0) {
      sendNotificationToMany(others, {
        title: "...",
        message: `...`,
        type: "...",
        entityType: "...",
        entityId: "...",
      });
    }
  })
  .catch((error) => {
    console.error("Failed to notify:", error);
  });
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: No TypeScript errors. Grep confirms no remaining `sendNotification` imports in these files.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Handovers.tsx src/pages/Orders.tsx src/pages/Sales.tsx src/pages/Transactions.tsx src/pages/CustomerOrders.tsx src/hooks/useRecordSale.ts src/hooks/useFixedCostReminders.ts src/components/orders/OrderFulfillmentDialog.tsx src/components/sales/SaleReturnDialog.tsx src/components/inventory/StockTransferModal.tsx
git commit -m "refactor: remove UI-side sendNotification calls from web pages (server triggers now handle)"
```

---

### Task 26: Delete sendNotification calls from mobile pages

**Files:**
- Modify: `src/mobile/pages/admin/AdminHandovers.tsx`
- Modify: `src/mobile/pages/admin/AdminOrders.tsx`
- Modify: `src/mobile/pages/agent/AgentRecordSale.tsx`
- Modify: `src/mobile/pages/agent/AgentHistory.tsx`
- Modify: `src/mobile/pages/agent/AgentRecordPayment.tsx`
- Modify: `src/mobile/pages/agent/AgentRecord.tsx`
- Modify: `src/mobile/pages/customer/CustomerOrders.tsx`

**What this does:** Same as Task 25 but for mobile-side files.

- [ ] **Step 1: Delete sendNotification calls**

Same pattern as Task 25. Remove the `sendNotification*` calls and imports, keep toasts.

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/mobile/pages/admin/AdminHandovers.tsx src/mobile/pages/admin/AdminOrders.tsx src/mobile/pages/agent/AgentRecordSale.tsx src/mobile/pages/agent/AgentHistory.tsx src/mobile/pages/agent/AgentRecordPayment.tsx src/mobile/pages/agent/AgentRecord.tsx src/mobile/pages/customer/CustomerOrders.tsx
git commit -m "refactor: remove UI-side sendNotification calls from mobile pages (server triggers now handle)"
```

---

## Phase 10: Cleanup + Verification

### Task 27: Trim src/lib/notifications.ts

**Files:**
- Modify: `src/lib/notifications.ts`

**What this does:** After all UI-side calls are deleted, this file is now dead code. Remove `sendNotification`, `sendNotificationToMany`, and all helper functions that are no longer used by any caller. Keep the file as a minimal stub or delete it entirely.

- [ ] **Step 1: Check for remaining callers**

```bash
grep -r "from.*@/lib/notifications" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results. If any remain, those files still have dangling imports — fix them first.

- [ ] **Step 2: Delete the file or reduce to stub**

If no callers remain, delete the file:
```bash
rm src/lib/notifications.ts
```

If some callers remain (unlikely), reduce the file to only export the functions that are still imported.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "refactor: remove src/lib/notifications.ts (all notification inserts now server-side)"
```

---

### Task 28: End-to-end verification

**What this does:** Smoke-test the entire notification system on a dev session. This is a manual verification task — no code changes.

- [ ] **Step 1: Verify FCM token uniqueness**

In Supabase SQL worksheet:
```sql
-- Check for duplicate tokens
SELECT token, count(*) AS cnt FROM public.fcm_tokens GROUP BY token HAVING count(*) > 1;
```
Expected: 0 rows.

- [ ] **Step 2: Verify all triggers exist**

```sql
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND t.tgname LIKE 'trg_%_notify%'
ORDER BY c.relname;
```
Expected: triggers on `sales`, `transactions`, `sale_returns`, `orders`, `payment_returns`, `customers`, `staff_invitations`, `route_sessions`, `store_visits`, plus the consolidated triggers on `handovers`, `stock_transfers`, `expense_claims`.

- [ ] **Step 3: Verify no UI-side sendNotification calls remain**

```bash
grep -r "sendNotification" src/ --include="*.ts" --include="*.tsx"
```
Expected: 0 results (excluding `_old_working` files which are not in active use).

- [ ] **Step 4: Verify build passes**

```bash
npm run build
npm run lint
```

- [ ] **Step 5: Verify on APK**

Build the APK, install on a physical Android device:
1. Log in as an agent. Record a sale. Confirm:
   - System-tray notification appears (even while app is foregrounded).
   - In-app toast appears.
   - Bell badge increments.
   - Admin/manager accounts see the broadcast notification.
2. Have another user send you a handover. Confirm:
   - System-tray notification appears.
   - Tap the notification → app opens and navigates to handovers page.
3. Log out, log in as a different user on the same device. Confirm:
   - Previous user's FCM token row is gone from `fcm_tokens`.
   - New user's token is present.
   - Triggering a notification for the previous user does NOT push to this device.

---

## Migration Deployment Summary

Apply all 20 migrations in order via `supabase_apply_migration`. Each migration is atomic and safe to apply individually.

| # | Migration name | What it does |
|---|---|---|
| 1 | `20260706000001_notifications_add_columns` | Add category/audience/action_key |
| 2 | `20260706000002_fcm_tokens_global_unique` | Token dedup + UNIQUE + upsert RPC |
| 3 | `20260706000003_user_notification_action_overrides` | Per-action preference table |
| 4 | `20260706000004_notify_rpc` | public.notify() + _notify_one() |
| 5 | `20260706000005_extend_notification_fcm_trigger` | FCM trigger passes category/action_key |
| 6 | `20260706000006_sales_trigger` | Sales AFTER INSERT |
| 7 | `20260706000007_transactions_trigger` | Transactions AFTER INSERT |
| 8 | `20260706000008_sale_returns_trigger` | Sale returns INSERT + UPDATE |
| 9 | `20260706000009_orders_triggers` | Orders INSERT + UPDATE |
| 10 | `20260706000010_payment_returns_trigger` | Payment returns AFTER INSERT |
| 11 | `20260706000011_consolidate_handovers_trigger` | Rewrite handovers trigger |
| 12 | `20260706000012_consolidate_stock_transfers_trigger` | Consolidate stock transfer triggers |
| 13 | `20260706000013_extend_expense_claims_trigger` | Extend expense claims trigger |
| 14 | `20260706000014_customers_welcome_trigger` | Customer self-reg welcome |
| 15 | `20260706000015_staff_invitations_trigger` | Staff invitation notification |
| 16 | `20260706000016_kyc_upload_and_status_trigger` | KYC upload + status change |
| 17 | `20260706000017_route_sessions_trigger` | Route session started + ended |
| 18 | `20260706000018_store_visits_trigger` | Store visit check-in |
| 19 | `20260706000019_stock_low_threshold` | Low stock alert infrastructure |
| 20 | `20260706000020_toggle_user_ban_notification` | Ban/unban notification in edge fn |

**Estimated total migrations:** 20
**Estimated frontend files modified:** ~20
**Estimated edge functions modified:** 4
**Estimated UI-side call sites deleted:** ~71
