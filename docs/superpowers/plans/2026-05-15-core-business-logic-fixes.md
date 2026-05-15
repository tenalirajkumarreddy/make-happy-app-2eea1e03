# Core Business Logic Fixes Implementation Plan

**Goal:** Fix 12 business logic issues identified in the codebase audit across Supabase RPCs and frontend code.

**Architecture:** New sequential SQL migration files with `CREATE OR REPLACE FUNCTION` to fix RPCs; inline edits to frontend code.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, IndexedDB

---

### Task 1: Fix `record_sale` RPC — credit limit & outstanding validation

**Files:**
- Create: `supabase/migrations/20260515000001_fix_record_sale_rpc.sql`
- Modify: none

**Changes:**
1. Use `p_customer_id` instead of `v_store_customer_id` for credit limit resolution
2. Add validation that `p_outstanding_amount` matches `p_total_amount - p_cash_amount - p_upi_amount`
3. Validate `credit_limit_override` is positive

### Task 2: Fix `get_agent_cash_holding` — add date guard

**Files:**
- Create: `supabase/migrations/20260515000002_fix_holding_and_balance_rpcs.sql`

**Changes:**
1. Add date filter to sales/transactions in `get_agent_cash_holding` to limit scope
2. Fix `get_all_staff_balances` to use consistent `created_at` date field instead of `handover_date`

### Task 3: Fix `handle_sale_inventory` — deterministic warehouse resolution

**Files:**
- Create: `supabase/migrations/20260515000003_fix_sale_inventory_trigger.sql`

**Changes:**
1. Replace Cartesian product warehouse resolution with `LIMIT 1` subquery
2. Fix variable shadowing in `v_pending_outgoing`

### Task 4: Fix handover RPCs — validation & authorization

**Files:**
- Create: `supabase/migrations/20260515000004_fix_handover_rpcs.sql`

**Changes:**
1. `create_handover_with_type`: validate `cash_amount >= 0` and `upi_amount >= 0`
2. `confirm_handover_v2`: allow managers to confirm handovers within their team

### Task 5: Fix offline queue — add capacity limit

**Files:**
- Modify: `src/lib/offlineQueue.ts`

**Changes:**
1. Add `MAX_QUEUE_SIZE` constant (default 500)
2. Check queue size before adding new items, warn user if full
