# Production Page Redesign

## Context
`Production.tsx` at `/production` is currently a broken "Feasibility Calculator" calling nonexistent RPC `calculate_feasibility`. The codebase already has a production infrastructure: `production_log` table, `bill_of_materials`, `record_production` RPC (simple insert), and `process_production_log` RPC (insert + BOM deduction + stock addition). An admin `ProductionLog.tsx` exists at `/admin/production-log`.

## Problem
The current page is non-functional. It only shows a product selector + quantity input + "Check Availability" button, calling an RPC that doesn't exist.

## Design

### Accounting Model: Consumption-Based
- Production recording **only increases finished goods stock**
- Raw material consumption (including wastage) is calculated at end-of-day: `Opening Stock + Purchases - Closing Stock = Actual Consumption`
- The gap between theoretical BOM consumption and actual closing stock is the wastage
- This avoids the problem of BOM-based deduction under-counting due to wastage

### Production.tsx — New Implementation

**Form fields:**
- Product (dropdown of finished products)
- Quantity produced (integer, positive)
- Wastage quantity (integer, default 0)
- Production date (default today)
- Notes (optional text)

**New RPC: `record_production_with_stock`**
- Inserts into `production_log`
- Upserts `product_stock` (adds quantity_produced to finished goods)
- Inserts `stock_movements` record (type = 'production')
- Returns `{success, production_log_id, error}`

**Post-recording display:**
- Success toast notification
- Auto-reset form
- Refresh recent logs list

**Stats section:**
- Total units produced today
- Total wastage today
- Wastage rate %
- Number of records today

**Recent logs:**
- Table showing: Date, Product, Quantity, Wastage, Yield%, Notes
- Filtered to current warehouse
- Sorted by production date desc

### Mobile (APK) Coverage
- Mobile already wraps `Production.tsx` via `MobilePageWrapper` for `super_admin`
- Add `production` menu entry for `manager` role in `STAFF_MENU_BY_ROLE` under a "Manufacturing" section (matches super_admin structure)

### New RPC SQL
```sql
CREATE OR REPLACE FUNCTION public.record_production_with_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced INTEGER,
  p_wastage_quantity INTEGER DEFAULT 0,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, production_log_id UUID, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log_id UUID;
  v_rows_affected INTEGER;
BEGIN
  -- Validate
  IF p_quantity_produced <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Quantity must be positive'::TEXT; RETURN;
  END IF;
  IF p_wastage_quantity < 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Wastage cannot be negative'::TEXT; RETURN;
  END IF;

  -- Insert production log
  INSERT INTO public.production_log (warehouse_id, product_id, quantity_produced, wastage_quantity, production_date, notes, created_by)
  VALUES (p_warehouse_id, p_product_id, p_quantity_produced, p_wastage_quantity, p_production_date, p_notes, p_created_by)
  RETURNING id INTO v_log_id;

  -- Add finished goods to stock
  UPDATE public.product_stock
  SET quantity = quantity + p_quantity_produced, updated_at = now()
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, p_quantity_produced, now());
  END IF;

  -- Log stock movement
  INSERT INTO public.stock_movements (product_id, warehouse_id, quantity, type, reference_id, reason, created_by, created_at)
  VALUES (p_product_id, p_warehouse_id, p_quantity_produced, 'production', v_log_id::text, 'Production batch', p_created_by, now());

  RETURN QUERY SELECT true, v_log_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, SQLERRM;
END;
$$;
```

## What Is Not Included
- End-of-day closing stock reconciliation (separate feature)
- Feasibility/BOM requirement checker (removed)
- BOM editing (exists at `/inventory/boms`)
