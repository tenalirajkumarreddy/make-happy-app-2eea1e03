# Notifications System Design

**Date:** 2026-07-06
**Status:** Draft (awaiting user review)
**Supabase project:** `vrhptrtgrpftycvojaqo` (NEWZ)
**Scope:** Fix missing Android native notifications + audit all app actions for notification coverage + define acknowledgment notifications + collapse duplicate paths into one server-side source of truth.

---

## 1. Context

The app currently has working in-app notifications for some flows (record sale, transactions, handovers, stock transfers, expense claims) but lacks triggers for many other actions. Android native system-tray notifications are not appearing reliably. This design covers four things the user asked for:

1. List all actions that should have notifications.
2. For each action, define who sends and who receives.
3. Identify which actions need acknowledgment ("ack") notifications.
4. Diagnose and fix the in-app vs native APK gap (Android push not showing).

### What's broken today (audit summary)

1. **Same FCM token is registered under multiple `user_id`s.** `fcm_tokens` only enforces `UNIQUE (user_id, token)`, not `UNIQUE ( token)`. Production evidence: token `dDXt6efaQN6ZyfsJ0OsZ...` appears under three different user_ids (24726a83…, c8329ece…, 4aa0845e…); tokens `e1Vw8dFoQneQMcUpvI8T...` and `f_veCi6ISGSOh-J2z45p...` repeat similarly. The trigger `trg_notification_insert_fcm` calls `notify-fcm-v2`, which filters by `user_id` and picks the "most recent" token — i.e. it pushes to whichever device registered that token last, not the device currently logged in as that user. **This is the root cause of missing Android push.**

2. **Foreground FCM is explicitly suppressed.** `src/hooks/useNotifications.ts:246-260` registers `PushNotifications.addListener("pushNotificationReceived", …)` that logs `"Foreground push notification received (suppressed local copy)"` and does nothing. While the app is open on Android, no system-tray notification appears — only the in-app toast. Users testing on a physical device reasonably conclude "native notifications are broken."

3. **Duplicate notification inserts.** Three DB triggers (`trg_handovers_notifications`, `trg_stock_transfers_notifications`, `trg_expense_claims_notifications`) fire on INSERT/UPDATE. UI hooks (`Handovers.tsx`, `StockTransferModal.tsx`, `AgentHistory.tsx`, `AdminHandovers.tsx`, etc.) ALSO call `sendNotification*` for the same action. The recipient (e.g. the sender of a handover) is the same in both paths, so the user receives two notification rows for one action. Today's live `notifications` table only shows 11 rows (mostly `stock_transfer` and `system`) because most flows happened to be UI-only — server-side inserts are correct where they exist.

4. **Many actions have no trigger and no UI call.** Missing: most transaction receipt paths, customer self-registration, KYC upload + status change, sale return approval/rejection, purchase orders / vendor bills, store visit check-in, route session start/end, staff invited / staff banned (toggle-user-ban silently locks users out — no notification at all), stock low / out threshold, daily handover snapshot success/failure, auto-orders generating orders.

5. **Dead edge functions.** `notify-fcm` (v1), `notify-push`, and `notify-fcm-v2` are all deployed. Only `notify-fcm-v2` is referenced by the trigger. The other two will rot.

---

## 2. Design decisions (confirmed with user)

Four decisions were made collaboratively and are now fixed:

1. **Server-side as single source of truth.** All notification inserts move into Postgres triggers / RPC functions. All UI-side `sendNotification*` calls are deleted. This means mobile and web share the exact same path, cron / edge-function / script actions also emit notifications, and duplicates are structurally impossible.

2. **Tiered broadcast policy.** "Action-required" notifications (sale recorded, new order, transfer requested, new handover, expense claim pending, KYC submitted, staff banned, etc.) are broadcast to all super_admins + managers in addition to the named recipient. "Actor ack" notifications (your handover was confirmed, your expense claim was approved, your order was cancelled, your KYC was verified) go ONLY to the actor. The previous behavior — broadcasting EVERY notification to all admins+managers — is removed. Quieter admin inboxes, same operational visibility.

3. **FCM token is globally unique; latest user wins.** Add a `UNIQUE` constraint on `fcm_tokens(token)`. The new `upsert_fcm_token(p_user_id, p_token)` RPC deletes any row with the same token owned by a different user, then upserts `(p_user_id, p_token)`. When a shared device logs in as a different user, the previous user loses push on that device — which is correct. The Capacitor hook is migrated to call this RPC instead of `.upsert()`.

4. **Always show the system-tray notification, including when the app is foregrounded.** Remove the `pushNotificationReceived` suppression listener in `useNotifications.ts`. On Android, the default FCM behavior will then show the tray notification even while the user is actively in the app. The existing in-app toast + bell badge from Realtime still fires, so the user gets both signals.

---

## 3. Architecture

```
Action (UI / RPC / cron / edge function)
        │
        ▼
  Postgres INSERT / UPDATE on a domain table
        │
        ├──► per-table trigger ──► public.notify(payload jsonb)
        │                              (one row per recipient;
        │                               category, audience, action_key
        │                               are set by the trigger)
        │
        └──► trg_notification_insert_fcm (existing)
                    │
                    ▼
              net.http_post → notify-fcm-v2
                    │
                    ▼
              fcm_tokens (UNIQUE on token globally)
                    │
                    ▼
              FCM v1 → Android system tray (always, incl. foreground)
                    │
                    ▼
              Realtime (postgres_changes on notifications)
                    │
                    ▼
              useNotifications hook → in-app toast + bell badge + mark-as-read
```

Three pieces:
- **`public.notify(jsonb)`** — a new SECURITY DEFINER RPC that takes one JSON payload describing the action and fans the notification out to all recipients (direct + broadcast-to-admins). It inserts one row per recipient. It honors `user_notification_preferences` (extended — see schema).
- **Per-table triggers** call `public.notify(...)`. They are responsible for knowing the action_key, who the actor is, who the direct recipient is, and the broadcast tier.
- **`trg_notification_insert_fcm`** (existing, extended) — still does the `net.http_post` to `notify-fcm-v2`. The only change is it now passes `category` and `action_key` through to FCM `data` so the native app can deep-link on tap.

---

## 4. Schema changes

### 4.1 `notifications` table — add columns

```sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category   text NOT NULL DEFAULT 'action_required',
  ADD COLUMN IF NOT EXISTS audience   text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS action_key text;
```

- `category` — one of `action_required` (something happened that needs admin/manager attention) or `actor_ack` (a confirmation back to the actor that their action completed). Drives whether the row is broadcast to admins and which Android channel it uses.
- `audience` — `direct` (delivered to the named `user_id`) or `broadcast` (this row was inserted for an admin/manager as part of a fan-out). Lets one call to `public.notify(...)` produce rows tagged with their role in the fan-out.
- `action_key` — stable string like `sale.recorded`, `handover.confirmed`, `order.cancelled`, `kyc.verified`, `staff.banned`. Used by: (a) the app for deep-link routing on notification tap, (b) `user_notification_preferences` per-action overrides, (c) debugging.

Backfill the existing 11 rows: set `category='action_required'`, `audience='direct'`, `action_key=NULL`. (Existing rows predate the new model; no point guessing.)

### 4.2 `fcm_tokens` global-unique

```sql
-- Delete pre-existing duplicates, keeping the most recently updated row per token.
DELETE FROM public.fcm_tokens a USING public.fcm_tokens b
WHERE a.token = b.token
  AND a.updated_at < b.updated_at;

ALTER TABLE public.fcm_tokens
  ADD CONSTRAINT fcm_tokens_token_unique UNIQUE (token);
```

This will fail if duplicate tokens exist — the DELETE above clears them first. (Verified on the live DB: 3 users share tokens with `24726a83…`; the DELETE keeps the most recent owner of each token, which is the latest logged-in user on that device.)

### 4.3 `user_notification_preferences` — extend for `action_key` overrides

The existing per-category booleans (`orders_enabled`, `sales_enabled`, `transfers_enabled`, `handovers_enabled`, `system_enabled`) stay. They remain the coarse-grained toggle. We add an optional fine-grained override:

```sql
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
```

`public.notify(...)` checks: if a row exists in `user_notification_action_overrides` for `(user_id, action_key)`, use `enabled`; otherwise fall back to the coarse category toggle. Lets a manager mute `expense_claim.submitted` without muting all `system` notifications.

### 4.4 `public.notify(jsonb)` RPC

```sql
CREATE OR REPLACE FUNCTION public.notify(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_key     text   := p_payload->>'action_key';
  v_title          text   := p_payload->>'title';
  v_message        text   := p_payload->>'message';
  v_type           text   := p_payload->>'type';
  v_entity_type    text   := p_payload->>'entity_type';
  v_entity_id      text   := p_payload->>'entity_id';
  v_category       text   := COALESCE(p_payload->>'category', 'action_required');
  v_recipients     jsonb  := COALESCE(p_payload->'recipients', '[]'::jsonb);
  v_broadcast_admin boolean := COALESCE((p_payload->'broadcast_to_admins')::boolean, false);
  v_admin_ids      uuid[] := ARRAY[]::uuid[];
  r                uuid;
  recipient_row    jsonb;
  recipient_id     uuid;
  v_enabled        boolean;
BEGIN
  -- Admin broadcast set
  IF v_broadcast_admin THEN
    SELECT array_agg(user_id) INTO v_admin_ids
    FROM public.user_roles
    WHERE role IN ('super_admin', 'manager');
  END IF;

  -- Direct recipients (already an array of {user_id, audience='direct'})
  FOR recipient_row IN SELECT * FROM jsonb_array_elements(v_recipients)
  LOOP
    recipient_id := (recipient_row->>'user_id')::uuid;
    PERFORM public._notify_one(recipient_id, v_title, v_message, v_type,
      v_entity_type, v_entity_id, v_category, 'direct', v_action_key);
  END LOOP;

  -- Broadcast to admins (audience='broadcast')
  FOREACH r IN ARRAY v_admin_ids LOOP
    PERFORM public._notify_one(r, v_title, v_message, v_type,
      v_entity_type, v_entity_id, v_category, 'broadcast', v_action_key);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._notify_one(
  p_user_id uuid, p_title text, p_message text, p_type text,
  p_entity_type text, p_entity_id text, p_category text,
  p_audience text, p_action_key text
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
    -- Fall back to coarse category
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
```

The existing `trg_notification_insert_fcm` trigger stays. Its body is extended so the FCM `data` payload includes `category` and `action_key`:

```sql
body := jsonb_build_object(
  'user_id', NEW.user_id,
  'title', NEW.title,
  'message', NEW.message,
  'type', NEW.type,
  'entity_type', NEW.entity_type,
  'entity_id', NEW.entity_id,
  'category', NEW.category,
  'action_key', NEW.action_key
)
```

### 4.5 `upsert_fcm_token` RPC

```sql
CREATE OR REPLACE FUNCTION public.upsert_fcm_token(p_user_id uuid, p_token text, p_platform text DEFAULT 'android')
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
```

---

## 5. Action Notification Matrix

Status legend: **[exists]** = already wired (kept, possibly recategorized). **[dup]** = currently double-firing — UI call removed, server-side kept. **[missing]** = new. **[partial]** = some paths covered, some not.

### 5.1 Sales & Returns

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Sale recorded (`record_sale` RPC) | AFTER INSERT on `sales` | admins + managers (`audience=broadcast`) | `action_required` | yes | yes — same insert, `audience=direct` to the recorder | **[missing]** (was UI-only) |
| Transaction (cash/UPI receipt) recorded | AFTER INSERT on `transactions` | admins+managers (broadcast) + customer (if `customers.user_id` not null) | `action_required` | yes | yes to recorder | **[missing]** |
| Sale return requested | AFTER INSERT on `sale_returns` | admins+managers (broadcast) | `action_required` | yes | yes to requester | **[missing]** |
| Sale return approved / rejected | AFTER UPDATE of `approval_status` on `sale_returns` | requester only | `actor_ack` | no | (this IS the ack) | **[missing]** |
| Payment return created | AFTER INSERT on `payment_returns` | customer + admins | `action_required` | yes | yes to recorder | **[missing]** |

### 5.2 Orders

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Customer places order (manual, web + mobile) | AFTER INSERT on `orders` (source != auto) | admins+managers | `action_required` | yes | yes to ordering customer (if `customers.user_id` not null) | **[partial]** (UI today; one path) |
| Auto-orders cron generates N orders | AFTER INSERT on `orders` WHERE source = 'auto' | admins+managers | `action_required` | yes | n/a (cron) | **[missing]** |
| Order assigned to agent | AFTER UPDATE of `assigned_to` on `orders` | assigned agent | `action_required` (to agent) | no | n/a | **[exists]** (move to trigger) |
| Order transferred (re-assigned) | AFTER UPDATE of `assigned_to` on `orders` (when not NULL) | new agent + previous agent (ack) | `action_required` (new) + `actor_ack` (old) | no for ack | the ack IS the notification | **[exists]** (move to trigger) |
| Order fulfilled / delivered | AFTER UPDATE of `status='delivered'` on `orders` | customer (if exists) + admins | `actor_ack` to customer, `action_required` to admins | for admins only | n/a | **[exists]** (was UI-only in OrderFulfillmentDialog) |
| Order cancelled (admin) | `cancel_order` RPC already inserts the notification | customer | `actor_ack` | no | (this IS the ack) | **[exists]** (server-side, leave alone) |
| Order cancelled (mobile) | same RPC | customer | `actor_ack` | no | n/a | **[exists]** |

### 5.3 Handovers (DB trigger + UI dup → collapse)

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Handover requested | AFTER INSERT on `handovers` | `handed_to` user | `action_required` | no | yes to sender: "Handover sent to {name}" | **[dup]** — UI call removed |
| Handover confirmed | AFTER UPDATE of `status='confirmed'` on `handovers` | original sender (`user_id`) | `actor_ack` | no | (this IS the ack) | **[dup]** — UI call removed |
| Handover rejected | AFTER UPDATE of `status='rejected'` on `handovers` | original sender | `actor_ack` | no | (this IS the ack) | **[dup]** — UI call removed |
| Handover cancelled (pending, by sender) | AFTER UPDATE of `status='cancelled'` | `handed_to` | `actor_ack` | no | n/a | **[dup]** — UI call removed |
| Handover cancelled (confirmed, by admin) | AFTER UPDATE of `status='cancelled'` (was confirmed) | both sender + receiver | `action_required` | yes | n/a | **[missing]** |
| Admin adjusts staff holding balance | (UI-only) → move to a new `balance_adjustments` AFTER INSERT trigger | affected staff | `action_required` | yes | n/a | **[partial]** (UI today) |
| Admin transfers between staff | AFTER INSERT on `handovers` where `handover_type='transfer'` AND the actor is an admin/manager (detected inside the trigger by checking the calling session's role against `user_roles`) | both staff | `action_required` | yes | n/a | **[missing]** — the trigger distinguishes "agent-initiated transfer" (no admin broadcast) from "admin-initiated transfer" (broadcast to other admins). The existing `handover_type='transfer'` value is reused; the discriminator is the actor role, not a new enum value. |

### 5.4 Stock Transfers & Stock Requests (DB trigger + UI dup → collapse)

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Stock transfer requested | AFTER INSERT on `stock_transfers` | admins/managers (for approval) + recipient (if `to_user` not null) | `action_required` | yes | yes to requester: "Transfer requested" | **[dup]** — UI call removed. Existing `trg_stock_transfers_notifications` + `notify_stock_transfer` consolidated into one trigger. |
| Transfer approved / rejected | `approve_stock_transfer` RPC already inserts | requester (+ sender + recipient if different) | `actor_ack` | no | n/a | **[exists]** (leave alone) |
| Transfer accepted (recipient) | `accept_stock_transfer` RPC already inserts | requester (creator) | `actor_ack` | no | n/a | **[exists]** |
| Transfer cancelled | `cancel_stock_transfer` RPC already inserts | recipient + admins | `actor_ack` to recipient, `action_required` to admins | yes | n/a | **[exists]** |
| Stock request to warehouse submitted | AFTER INSERT on `stock_requests` | warehouse operators (`role='operator'` for the `to_warehouse_id`) | `action_required` | (to operators, not admins) | n/a | **[missing]** |
| Stock request fulfilled / rejected | AFTER UPDATE of `status` on `stock_requests` | requester | `actor_ack` | no | (this IS the ack) | **[missing]** |
| Stock low / out threshold crossed | new nightly scheduled function inside `daily-store-reset` that scans `product_stock` (no threshold column exists today — migration 19 adds `low_stock_threshold numeric DEFAULT 0` to `products`; alerts fire only when threshold > 0) | admins+managers | `action_required` | yes | n/a | **[missing]** |

### 5.5 Expense Claims (DB trigger already covers insert + approve/reject)

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Expense claim submitted | AFTER INSERT on `expense_claims` | admins+managers | `action_required` | yes | yes to staff: "Claim submitted ₹X" | **[partial]** (broadcast exists; ack missing) |
| Expense claim approved | AFTER UPDATE `status='approved'` (already in trigger) | staff | `actor_ack` | no | n/a | **[exists]** |
| Expense claim rejected | AFTER UPDATE `status='rejected'` (already in trigger) | staff | `actor_ack` | no | n/a | **[exists]** |
| Expense claim paid (separate from approve) | AFTER UPDATE `status='paid'` on `expense_claims` (new status value) | staff | `actor_ack` | no | n/a | **[missing]** |

### 5.6 Identity & Access

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Customer self-registers | AFTER INSERT on `customers` where `user_id` is not null | admins+managers (broadcast) + new customer (direct welcome) | `action_required` (admins) + `actor_ack` (customer welcome) | yes | yes: "Welcome to {brand}" | **[missing]** |
| Staff invited (`invite-staff` edge function) | AFTER INSERT on `staff_invitations` | admins | `action_required` | yes | yes: "Invitation sent to {email}" to inviter | **[missing]** |
| Staff banned (`toggle-user-ban` edge function) | edge function inserts row BEFORE banning (otherwise the banned user can't read it) | banned user (direct) + admins (broadcast) | `action_required` (admins) + `actor_ack` to user ("Your account has been suspended. Contact your manager.") | yes | n/a | **[missing]** |
| Staff unbanned | edge function inserts row | unbanned user + admins | `actor_ack` | no to user, yes to admins | n/a | **[missing]** |
| KYC document uploaded | Triggered when customer uploads Aadhaar/selfie to the `kyc-documents` bucket (Supabase Storage). Implementation: AFTER UPDATE of `kyc_aadhar_front_url`/`kyc_aadhar_back_url`/`kyc_selfie_url` on `customers` (these are NULL until upload → set to the storage path). Detect transition NULL→NOT NULL. | admins+managers | `action_required` | yes | yes: "KYC submitted" to customer | **[missing]** |
| KYC status changed (verified/rejected) | AFTER UPDATE of `kyc_status` on `customers` (verified schema values today: unknown, but the column exists; the trigger reads `NEW.kyc_status` and only fires when it transitions to a terminal value like `'verified'` or `'rejected'`) | customer | `actor_ack` | no | (this IS the ack) | **[missing]** |

### 5.7 Routes & Visits

| Action | Trigger event | Recipient(s) | Tier / category | Broadcast admins? | Ack to actor? | Status |
|---|---|---|---|---|---|---|
| Agent starts route session | AFTER INSERT on `route_sessions` | admins+managers | `action_required` | yes | yes to agent: "Route started" | **[missing]** |
| Agent checks in at store | AFTER INSERT on `store_visits` | admins | `action_required` | yes | yes to agent: "Checked in at {store}" | **[missing]** |
| Route session ended (summary) | AFTER UPDATE of `ended_at` on `route_sessions` | admins | `actor_ack` to admins (unusual but useful) | n/a | yes to agent: "Route ended, {N} visits" | **[missing]** |
| Proximity check fails (agent tries to record sale outside store geofence) | Detection inside `src/lib/proximity.ts`. Today the proximity lib raises an exception that propagates back to the UI as a toast; this design adds an inline `public.notify(...)` call from within `record_sale` (or a new helper the proximity lib uses when called from the agent flow) when the proximity pre-check fails before the sale is recorded. Recipients: admins + the agent. | admins + agent | `action_required` | yes | yes to agent immediately | **[missing]** (lower priority — could defer to a follow-up; the geometry detection lives in TS today, so the notify path needs an explicit `perform public.notify(...)` from the SQL side or an out-of-band client-side call only for this case) |

### Matrix summary
- ~30 distinct notification events.
- 9 already work.
- 3 are duplicates that collapse to single inserts once UI calls are removed.
- 18+ are missing and will be added.

---

## 6. Mobile / Native APK changes

### 6.1 `src/hooks/useNotifications.ts`

- **Delete the `pushNotificationReceived` listener** (the `handleForegroundPush` block, currently lines 246-260). After removal: Android's default FCM behavior shows the system-tray notification even while the app is foregrounded.
- **Replace `saveFCMTokenToBackend()`** body to call the new `upsert_fcm_token` RPC instead of `supabase.from('fcm_tokens').upsert(...)`. One round-trip, atomic, globally-unique guarantees enforced server-side.
- **Foreground FCM data passthrough** — keep `pushNotificationReceived` for ONE thing only: parsing the `data` payload to route the toast correctly (e.g. show a CTA in the toast). Do not suppress the system-tray copy.
- **Deep-link on tap** — add a `pushNotificationActionPerformed` listener that reads `data.action_key`, `data.entity_type`, `data.entity_id` and navigates to the appropriate screen via the app router. (Today the FCM payload already includes `type/entity_type/entity_id`; we just add `action_key`/`category` and route on tap.)

### 6.2 Android notification channels

Register two notification channels in the native Android app (`android/app/src/main/java/.../MainActivity.java`, onCreate):
- `default` — existing channel, normal priority.
- `action_required` — high priority, sound + vibrate, used for sale recorded / new order / handover requested / staff banned.

The edge function `notify-fcm-v2` already sets `channelId: "default"` in the FCM payload. Update it to map `data.category === 'action_required'` → `channelId: 'action_required'`, otherwise `default`.

### 6.3 Edge function (`notify-fcm-v2`)

Two small changes:
- Read `category` and `action_key` from the request body; pass into the FCM `data` payload.
- Map `category` → `android.notification.channelId`.

`notify-fcm` (v1) and `notify-push` are dead (only `notify-fcm-v2` is referenced by the trigger). They are left in place during rollout and removed via the Supabase dashboard after the new trigger is verified working.

---

## 7. Cleanup

### 7.1 Delete UI-side `sendNotification*` calls (~71 sites)

Files & approximate call counts (from grep):

- `src/hooks/useFixedCostReminders.ts` — 1 call
- `src/hooks/useRecordSale.ts` — 1 call (sale recorded)
- `src/components/orders/OrderFulfillmentDialog.tsx` — 2 calls
- `src/components/sales/SaleReturnDialog.tsx` — 1 call
- `src/components/inventory/StockTransferModal.tsx` — 1 call
- `src/mobile/pages/customer/CustomerOrders.tsx` — 1 call
- `src/mobile/pages/admin/AdminHandovers.tsx` — 6 calls
- `src/mobile/pages/admin/AdminOrders.tsx` — 3 calls
- `src/mobile/pages/agent/AgentRecord_old_working.tsx` — 2 calls (file is `_old`, likely skip)
- `src/mobile/pages/agent/AgentRecordSale.tsx` — 1 call
- `src/mobile/pages/agent/AgentHistory.tsx` — 5 calls
- `src/mobile/pages/agent/AgentRecordPayment.tsx` — 1 call
- `src/mobile/pages/agent/AgentRecord.tsx` — 2 calls
- `src/pages/CustomerOrders.tsx` — 1 call
- `src/pages/Handovers.tsx` — 9 calls
- `src/pages/Orders.tsx` — 4 calls (one already re-implemented server-side by `cancel_order` RPC — remove the redundant UI call too)
- `src/pages/Orders_old_working.tsx` — 4 calls (file is `_old`, skip)
- `src/pages/Sales.tsx` — 1 call
- `src/pages/Sales_old_working.tsx` — 1 call (skip)
- `src/pages/StockTransfers.tsx` — import only
- `src/pages/Transactions.tsx` — 1 call

Order of deletion:
1. Apply all DB migrations (schema + triggers + `notify()` RPC).
2. Verify each trigger fires by doing a representative action in a dev session.
3. Delete UI-side calls in one sweep per file. Keep the corresponding `toast.success(...)` calls — those are still wanted.

### 7.2 Trim `src/lib/notifications.ts`

After deletion:
- Remove `sendNotification` and `sendNotificationToMany` (no callers).
- Keep `getBroadcastRolesUserIds`, `getApproverUserIds`, `getUsersByRole`, `getAgentsForStore` ONLY if a non-notification consumer needs them. (Audit: only `useFixedCostReminders` (notifications) and `Orders.tsx` (getCustUserId for order) use them — most will be safe to remove.)
- Net: this file shrinks to near zero; the rest moves server-side.

### 7.3 Dead edge functions

`notify-fcm` and `notify-push` are not invoked by any trigger or any code. Remove them via the Supabase dashboard after the new path is verified (not via migration — edge function lifecycle is dashboard-managed).

---

## 8. Migration plan

Apply in this order. Each migration is one file under `supabase/migrations/` with a date-prefixed name.

1. **`20260706000001_notifications_add_columns.sql`** — add `category`, `audience`, `action_key` to `notifications`; backfill existing rows.
2. **`20260706000002_fcm_tokens_global_unique.sql`** — de-duplicate existing rows, add `UNIQUE (token)`, add `upsert_fcm_token` RPC. Note: this migration will need to run during a low-traffic window because a registration that happens between the DELETE and the ALTER could insert a conflicting row. (Wrap the migration in a transaction; for an extra safety net, take an advisory lock.)
3. **`20260706000003_user_notification_action_overrides.sql`** — create the action overrides table with RLS.
4. **`20260706000004_notify_rpc.sql`** — create `public.notify(jsonb)` + `public._notify_one(...)`.
5. **`20260706000005_extend_notification_fcm_trigger.sql`** — extend `handle_notification_insert_fcm` to pass `category` and `action_key` to FCM.
6. **`20260706000006_sales_trigger.sql`** — AFTER INSERT on `sales` → `public.notify(...)` with `action_key='sale.recorded'`.
7. **`20260706000007_transactions_trigger.sql`** — AFTER INSERT on `transactions` → `action_key='transaction.recorded'`.
8. **`20260706000008_sale_returns_trigger.sql`** — AFTER INSERT (return requested) + AFTER UPDATE of `approval_status` (approved/rejected). `action_key` ∈ `sale_return.requested|approved|rejected`.
9. **`20260706000009_orders_triggers.sql`** — AFTER INSERT (new order, source-aware), AFTER UPDATE of `assigned_to` (assigned/transferred), AFTER UPDATE of `status` (delivered/cancelled if not via RPC). `action_key` ∈ `order.placed|order.assigned|order.transferred|order.fulfilled|order.cancelled`.
10. **`20260706000010_payment_returns_trigger.sql`** — AFTER INSERT on `payment_returns`.
11. **`20260706000011_consolidate_handovers_trigger.sql`** — rewrite `trg_handovers_notifications` to call `public.notify(...)` with categories, action_keys, and the new "admin-cancel of confirmed handover" branch.
12. **`20260706000012_consolidate_stock_transfers_trigger.sql`** — fold `notify_stock_transfer` and `trg_stock_transfers_notifications` into one AFTER INSERT OR UPDATE trigger that calls `public.notify(...)`. The `approve_stock_transfer`, `accept_stock_transfer`, `cancel_stock_transfer` RPCs already insert notifications directly; rewrite them to call `public.notify(...)` for consistency (optional but cleaner).
13. **`20260706000013_extend_expense_claims_trigger.sql`** — extend `trg_expense_claims_notifications` to also fire on `status='paid'` (the `paid` status value may need to be introduced via an applied data migration that updates `expense_claims.status` from `approved` to `paid` once payment is recorded — confirm the current workflow before adding), and to add the ack to actor on INSERT.
14. **`20260706000014_customers_trigger.sql`** — AFTER INSERT where `user_id IS NOT NULL` → welcome (direct) + admin broadcast.
15. **`20260706000015_staff_invitations_trigger.sql`** — AFTER INSERT → admin broadcast + ack to inviter.
16. **`20260706000016_customers_kyc_trigger.sql`** — AFTER INSERT on `customers` where `user_id` is not null (welcome + admin broadcast). AFTER UPDATE of `kyc_aadhar_front_url`/`kyc_aadhar_back_url`/`kyc_selfie_url` from NULL to NOT NULL (upload ack + admin alert). AFTER UPDATE of `kyc_status` to a verified/rejected value (ack to customer).
17. **`20260706000017_route_sessions_trigger.sql`** — AFTER INSERT (started) + AFTER UPDATE of `ended_at` (ended).
18. **`20260706000018_store_visits_trigger.sql`** — AFTER INSERT (checked in).
19. **`20260706000019_stock_low_threshold.sql`** — add a `low_stock_threshold numeric DEFAULT 0` column to `products`. Extend `daily-store-reset` (or add a small scheduled function) to scan `product_stock` and emit one `action_required` notification per product whose `quantity` has dropped below the threshold since the last run (track "already alerted" via a `last_low_alert_at` timestamp column on `product_stock` to avoid spamming).
20. **`20260706000020_toggle_user_ban_notification.sql`** — modify `supabase/functions/toggle-user-ban/index.ts` to insert a notification row BEFORE invoking `auth.admin.updateUserById(... ban_duration ...)` for both ban and unban. (Server-side RPC `notify` not reachable from edge function — inline the insert using the service-role client.)

Edge function deploys (after the migrations land):
- `notify-fcm-v2` — update to read `category`/`action_key` and map to channel.
- `toggle-user-ban` — update per migration 20.
- `auto-orders` — optionally: now emits via the orders trigger, so no code change needed, but verify.
- `daily-store-reset`, `daily-handover-snapshot`, `daily-snapshot`, `daily-replenishment-worker` — for any failure-ack notification we want, add an inline `notifications.insert` in their catch blocks using the service-role client.

Frontend changes (after the migrations land and DB is verified):
- `useNotifications.ts` — removed foreground suppression; FCM upsert via RPC; deep-link routing on tap.
- Android native — register `default` + `action_required` channels.
- Delete UI-side `sendNotification*` calls per Section 7.1.
- Trim `src/lib/notifications.ts` per Section 7.2.

---

## 9. Testing approach

### 9.1 Server-side, per action

For every action in the matrix, open a Supabase SQL worksheet and run the action's RPC (or insert mock rows directly), then SELECT from `notifications` to verify:
- The expected number of rows were inserted.
- Each row has the right `user_id`, `category`, `audience`, `action_key`.
- `user_notification_preferences` (set to false for the action's category) suppresses delivery.
- `user_notification_action_overrides` (set to true/false for the specific `action_key`) overrides the category preference.

### 9.2 FCM token uniqueness

In a dev session:
- Log in as user A on device X. Confirm `fcm_tokens` has one row `(A, token_X)`.
- Log out, log in as user B on the same device X. Confirm `fcm_tokens` now has `(B, token_X)` and the row for A is gone.
- Trigger an action that notifies A. Confirm no push to device X (no row to send to).
- Trigger an action that notifies B. Confirm push arrives on device X.

### 9.3 Foreground system tray

On an Android APK:
- Open the app (foreground).
- Trigger any action that notifies the logged-in user (e.g. have another user send you a handover).
- Confirm: the system-tray notification appears AND the in-app toast appears AND the bell badge increments.

### 9.4 Dedup verification

- Trigger a handover (sender A → recipient B).
- Confirm exactly ONE notification row for B (`category=action_required`, `audience=direct`, `action_key=handover.requested`).
- B confirms handover.
- Confirm exactly ONE notification row for A (`category=actor_ack`, `audience=direct`, `action_key=handover.confirmed`).

### 9.5 Tiered broadcast

- Trigger "sale recorded" by an agent. Confirm:
  - One `actor_ack` to the agent (audience=direct).
  - One `action_required` to each admin/manager (audience=broadcast).
  - No actor_ack to admins.
- Trigger "expense claim approved" by an admin for a staff member. Confirm:
  - One `actor_ack` to the staff (audience=direct).
  - No broadcast to admins (this is an ack, not an attention-needed action).

---

## 10. Out of scope (follow-up specs)

- Admin UI for `user_notification_action_overrides` (per-action mute settings screen). The RPC `notify()` honors it from day one, but no UI ships with this design. Follow-up.
- Email notifications. Out of scope.
- ListView / bell dropdown in the web app (already exists — keep).
- Push notification delivery receipts / read receipts to the server (FCM delivery metrics). Out of scope.
- Replacing the existing FCM v1 HTTP endpoint with the new FCM HTTP v1 API (we're already on the new one via the service-account JWT auth).
- iOS — the project is Android-primary today. The same FCM plumbing will work on iOS once Capacitor is configured, but this spec does not include iOS-specific setup.
- Notification batching / digest (e.g. "you have 5 unread"). Out of scope; the bell badge + dropdown covers it.

---

## 11. Risks

- **Migration 2 (`fcm_tokens` global unique) takes a row-level write lock during dedup.** On a busy DB this could briefly delay new token registrations. Mitigation: run during low-traffic window, in a transaction, with an advisory lock. The lock hold time is small (deleting ~5 rows based on the live data we observed).
- **Existing UI calls being deleted before the trigger is verified.** Mitigation: migrations land first, get verified via dev SQL runs, THEN UI calls are deleted in a separate change.
- **`notify()` SECURITY DEFINER opens a path for any client to call it.** Mitigation: the RPC is only intended for triggers to call; revoke EXECUTE from `anon` and `authenticated` roles, only allow via SECURITY DEFINER triggers / RPCs in the public schema.
- **Edge function `notify-fcm-v2` is invoked via `net.http_post` from within the DB trigger.** This already works today; we are not changing the mechanism. If the edge function is down, notifications still get inserted (in-app delivery still works); only the native push is affected.
- **`toggle-user-ban` inserting the notification BEFORE the ban.** If the ban call fails, the user gets a "you've been suspended" notification but isn't actually suspended. Mitigation: wrap ban-and-notify in a best-effort sequence — notify only AFTER ban succeeds (the user won't be able to read it next session, but they'll see it now since their current session token is still valid).
