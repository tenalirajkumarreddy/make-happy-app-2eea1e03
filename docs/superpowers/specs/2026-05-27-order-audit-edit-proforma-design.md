# Order Audit Trail, Proforma Visibility, and Mobile Edit

Date: 2026-05-27

## Goal

Add audit trail (created by, edited by, fulfilled by) to all order cards, make Proforma button visible for all staff roles, and enable editing of unfulfilled orders on mobile.

## Database Changes

- Add `updated_by` (uuid, nullable, FK to auth.users) to `orders` table
- Add `fulfilled_by` (uuid, nullable, FK to auth.users) to `orders` table
- Update `record_sale` RPC to set `fulfilled_by = p_recorded_by` when delivering
- Update all frontend order UPDATE calls to set `updated_by` alongside `updated_at`

## Proforma Button

- Add Proforma button + `ProformaView` import + dialog state to **OperatorOrders** (currently missing)
- Add Proforma button + `ProformaView` import + dialog state to **MarketerOrders** (currently missing)
- Remove `order.status === "pending"` guard in **AgentRoutes** so Proforma is always visible
- **AdminOrders** already has it visible for all statuses — no change needed
- **Web Orders.tsx** already has it — no change needed

## Audit Trail — Expandable Chevron

On every order card in every orders page, add a small chevron `▸/▾` button at the bottom of the card body (before action buttons). Expanding reveals a compact row:

```
Created by Arjun • Fulfilled by Priya
```
or, if `updated_by` is set and different from `created_by`:
```
Created by Arjun • Edited by Rahul • Fulfilled by Priya
```
or, if only created (no fulfill, no edit):
```
Created by Arjun
```

Queries updated to join profiles for creator/editor/fulfiller:
- `creator_profile:profiles!orders_created_by_fkey(full_name)`
- `updater_profile:profiles!orders_updated_by_fkey(full_name)`
- `fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name)`

This affects: `AdminOrders.tsx`, `AgentRoutes.tsx`, `OperatorOrders.tsx`, `MarketerOrders.tsx`, web `Orders.tsx`

## Edit Unfulfilled Orders (Mobile)

Add an **Edit** button on pending/confirmed order cards. Opens a bottom sheet with:

### Simple orders
- Editable `requirement_note` textarea (pre-filled)

### Detailed orders
- Product list: each row has a product Select dropdown + qty Input + remove button
- Add product button (same product selection from Create Order)
- Optional editable `requirement_note` textarea

### Save
- Sets `updated_by = user.id` and `updated_at = now()`
- For detailed: deletes existing `order_items`, re-inserts new ones
- Invalidates queries, closes sheet

### Pages
- Add Edit to: `AdminOrders.tsx`, `AgentRoutes.tsx`, `OperatorOrders.tsx`, `MarketerOrders.tsx`
- Web `Orders.tsx` already has edit — no change

## Layout / Spacing

The expandable audit row sits between the last info row (total/date) and the action buttons bar, separated by thin dividers. Uses compact single-line text with `text-[10px]` and muted colors.

## Files to Modify

1. `supabase/migrations/20260527000002_orders_updated_by_fulfilled_by.sql` — new migration
2. `supabase/migrations/20260523000001_optimistic_locking_record_sale.sql` — update RPC to set fulfilled_by
3. `src/mobile/pages/admin/AdminOrders.tsx` — add edit sheet, expandable audit, profile joins, proforma already OK
4. `src/mobile/pages/agent/AgentRoutes.tsx` — add edit sheet, expandable audit, profile joins, remove proforma status guard
5. `src/mobile/pages/operator/OperatorOrders.tsx` — add edit sheet + proforma button, expandable audit, profile joins
6. `src/mobile/pages/marketer/MarketerOrders.tsx` — add edit sheet + proforma button, expandable audit, profile joins
7. `src/pages/Orders.tsx` — add expandable audit, profile joins
8. Various interfaces/types updated accordingly
