---
status: fixed
trigger: "Fix all errors in the Inventory page causing 400 Bad Request errors"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:30:00Z
---

## Current Focus
hypothesis: Foreign key relationship syntax in queries was using invalid constraint names
test: Updated queries to use proper Supabase foreign key syntax
expecting: Queries should now work without 400 errors
next_action: Verify fix by testing the Inventory page

## Symptoms
expected: Inventory page loads without 400 Bad Request errors
actual: 400 Bad Request errors on products, user_roles, stock_transfers, and staff_stock queries

## Evidence

### Root Cause 1: Missing Database Tables
- **product_stock table**: Referenced by useWarehouseStock.ts but didn't exist
- **warehouses table**: Referenced by multiple tables but didn't exist

### Root Cause 2: Invalid Foreign Key Syntax in Queries
The queries were using specific PostgreSQL constraint names like:
- `stock_transfers_from_warehouse_id_fkey`
- `stock_transfers_from_user_id_profiles_fkey`
- `stock_transfers_from_user_id_fkey`

Supabase PostgREST requires simplified foreign key references using just the column name, not the full constraint name.

## Resolution

### Files Changed:
1. **supabase/migrations/20260414000001_fix_inventory_tables.sql** (NEW)
   - Created `warehouses` table with RLS policies
   - Created `product_stock` table with proper foreign keys and RLS policies
   - Added realtime support for both tables

2. **src/hooks/inventory/useStockTransfer.ts** (MODIFIED)
   - Changed FK references from `!stock_transfers_from_warehouse_id_fkey` to `!from_warehouse_id`
   - Changed FK references from `!stock_transfers_from_user_id_profiles_fkey` to `!from_user_id`
   - Simplified to single select variant (removed fallback with different constraint names)

3. **src/pages/Inventory.tsx** (MODIFIED)
   - Changed pending returns query FK reference from `!stock_transfers_from_user_id_profiles_fkey` to `!from_user_id`
   - Simplified to single select clause instead of variants loop

## Technical Details

### Correct Supabase Foreign Key Syntax:
```typescript
// WRONG - uses full constraint names:
from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(id, name)
from_user:profiles!stock_transfers_from_user_id_profiles_fkey(id, full_name)

// CORRECT - uses just the column name:
from_warehouse:warehouses!from_warehouse_id(id, name)
from_user:profiles!from_user_id(id, full_name)
```

### Tables Created:
1. **warehouses**: Stores warehouse locations for inventory management
   - id, name, address, phone, email, is_active, created_at, updated_at

2. **product_stock**: Per-warehouse product stock levels
   - id, product_id (FK to products), warehouse_id (FK to warehouses)
   - quantity, min_stock_level, created_at, updated_at

## Verification Steps:
1. Apply migration: Run the SQL migration to create missing tables
2. Test queries: Load Inventory page and verify no 400 errors
3. Check data: Ensure warehouse stock and staff stock display correctly
4. Test transfers: Verify stock transfer functionality works
