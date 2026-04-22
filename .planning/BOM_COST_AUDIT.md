# BOM & Cost Calculation Audit Report

## 🔴 CRITICAL ISSUES FOUND

### 1. Missing BOM Cost Function ❌
**Problem:** `calculate_bom_cost()` function is referenced but **NOT IMPLEMENTED**

**Location:** `20260418100001_manufacturing_cost_engine.sql` line 81
```sql
-- calculate_bom_cost(product_id, warehouse_id) -> NUMERIC  ← COMMENT ONLY
```

**Expected Behavior:**
```sql
-- Should calculate:
-- SUM(raw_material_quantity * raw_material_wac_cost) for all BOM items
```

**Impact:** Product costs cannot be calculated from BOM

---

### 2. Missing Unit Conversion Function ❌
**Problem:** `get_pieces_per_kg()` function referenced but **NOT IMPLEMENTED**

**Location:** `20260419000002_fix_function_search_paths.sql` line 94
```sql
ALTER FUNCTION public.get_pieces_per_kg SET search_path = public, pg_temp;
-- ↑ Function doesn't exist!
```

**Expected:** Convert between pieces and kg for raw materials

---

### 3. Incomplete Cost Engine Migration ❌
**File:** `20260418100001_manufacturing_cost_engine.sql`

**Issues:**
- Line 76: `recalculate_wac_on_purchase()` function shows `...` (incomplete)
- Lines 81-84: Functions listed as comments only, not actual implementations
- Missing actual function bodies for:
  - `calculate_bom_cost()`
  - `calculate_overhead_per_unit()` (partially exists elsewhere)
  - `calculate_total_product_cost()`
  - `get_pieces_per_kg()`

---

## 🟠 PARTIAL IMPLEMENTATIONS

### 1. Overhead Calculation ✅⚠️
**File:** `20260418000000_unify_manufacturing_expenses.sql`

**Status:** Implemented but has issues

**Logic:**
```sql
-- Calculates: Total Manufacturing Expenses / Total Production
-- Uses previous month data (or current if no previous)
-- Expenses marked as is_manufacturing_overhead = true
```

**Issues:**
- Falls back to current month if no data (may be misleading)
- No per-product overhead allocation (just divides by total)
- Returns 0 if no production (should this be null?)

**Code Review:**
```sql
-- Line 24: Uses previous month
v_period := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::DATE;

-- Line 41-57: Falls back to current month
IF v_total_expenses = 0 AND v_total_production = 0 THEN
  v_period := date_trunc('month', CURRENT_DATE)::DATE;
  -- ... recalculate
END IF;

-- Line 60: Simple division
RETURN ROUND(v_total_expenses / v_total_production, 2);
```

**Problem:** This gives same overhead for all products. Should be weighted by:
- Production time
- Material usage
- Machine hours
- etc.

---

### 2. BOM Upsert Function ✅
**File:** `20260418000002_bom_functions.sql`

**Status:** Implemented

**Features:**
- `upsert_bom()` - Updates/creates BOM items
- `get_bom_summary()` - Gets BOM summary
- Custom type `bom_item`

**Missing:**
- No cost calculation
- No validation of quantities
- No unit conversion handling

---

### 3. WAC (Weighted Average Cost) ⚠️
**Status:** Partially implemented

**Issues:**
- Trigger exists but function incomplete
- No `wac_cost_history` population logic
- Missing cost change logging

**File:** `20260418000011_wac_vehicles_schema.sql`
- Table `wac_cost_history` exists
- Function `log_wac_cost_change()` exists
- But no trigger to auto-update WAC

---

## 📊 CURRENT DATA MODEL

### BOM Structure
```
bill_of_materials
├── id
├── finished_product_id  → products
├── raw_material_id      → products (raw)
├── raw_material_category_id → raw_material_categories
├── quantity
├── quantity_unit        -- 'pieces', 'kg', etc.
├── notes
└── warehouse_id
```

**Issues:**
- No cost snapshot stored
- No version control
- No effective date

### Raw Materials
```
raw_materials
├── id
├── name
├── unit_cost           ← Current WAC (should be auto-calculated)
├── current_stock
├── piece_weight_grams  ← For conversion
├── pieces_per_case
└── category_id
```

**Issues:**
- `unit_cost` not auto-updating
- No WAC history
- Manual updates possible (should be read-only)

### Production Log
```
production_log
├── id
├── warehouse_id
├── product_id
├── quantity_produced
├── production_date
├── wastage_quantity
├── wastage_cost       ← Should auto-calculate
└── notes
```

**Issues:**
- `wastage_cost` not calculated
- No link to BOM for actual vs expected

---

## 🎯 REQUIRED FIXES

### Priority 1: BOM Cost Calculation

Create missing function:
```sql
CREATE OR REPLACE FUNCTION public.calculate_bom_cost(
  p_product_id UUID,
  p_warehouse_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_bom_item RECORD;
BEGIN
  FOR v_bom_item IN
    SELECT 
      bom.quantity,
      bom.quantity_unit,
      rm.unit_cost,
      rm.current_stock,
      rm.piece_weight_grams
    FROM public.bill_of_materials bom
    JOIN public.raw_materials rm ON bom.raw_material_id = rm.id
    WHERE bom.finished_product_id = p_product_id
    AND bom.warehouse_id = p_warehouse_id
  LOOP
    -- Convert quantity if needed (pieces to kg, etc.)
    -- Calculate: quantity * unit_cost
    -- Add to total
    v_total_cost := v_total_cost + (v_bom_item.quantity * v_bom_item.unit_cost);
  END LOOP;
  
  RETURN COALESCE(v_total_cost, 0);
END;
$$;
```

---

### Priority 2: WAC Auto-Calculation

Complete the trigger:
```sql
CREATE OR REPLACE FUNCTION public.recalculate_wac_on_purchase()
RETURNS TRIGGER AS $$
DECLARE
  v_old_cost NUMERIC;
  v_new_cost NUMERIC;
  v_total_qty NUMERIC;
  v_total_value NUMERIC;
BEGIN
  -- Calculate new WAC: (old_stock * old_wac + new_qty * new_price) / (old_stock + new_qty)
  
  SELECT unit_cost INTO v_old_cost
  FROM public.raw_materials
  WHERE id = NEW.raw_material_id;
  
  SELECT 
    COALESCE(SUM(current_stock), 0),
    COALESCE(SUM(current_stock * unit_cost), 0)
  INTO v_total_qty, v_total_value
  FROM public.raw_materials
  WHERE id = NEW.raw_material_id;
  
  -- Add new purchase
  v_total_qty := v_total_qty + NEW.quantity;
  v_total_value := v_total_value + (NEW.quantity * NEW.unit_price);
  
  v_new_cost := v_total_value / v_total_qty;
  
  -- Update raw_material
  UPDATE public.raw_materials
  SET unit_cost = v_new_cost
  WHERE id = NEW.raw_material_id;
  
  -- Log change
  INSERT INTO public.wac_cost_history (raw_material_id, old_cost, new_cost, reason)
  VALUES (NEW.raw_material_id, v_old_cost, v_new_cost, 'Purchase: ' || NEW.display_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### Priority 3: Production Cost Tracking

Add wastage cost calculation:
```sql
CREATE OR REPLACE FUNCTION public.calculate_production_cost(
  p_production_log_id UUID
)
RETURNS TABLE (
  bom_cost NUMERIC,
  overhead_cost NUMERIC,
  wastage_cost NUMERIC,
  total_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pl RECORD;
  v_bom_cost NUMERIC;
  v_overhead NUMERIC;
  v_wastage_cost NUMERIC;
BEGIN
  -- Get production log
  SELECT * INTO v_pl FROM public.production_log WHERE id = p_production_log_id;
  
  -- Calculate BOM cost
  v_bom_cost := public.calculate_bom_cost(v_pl.product_id, v_pl.warehouse_id);
  
  -- Get overhead per unit
  v_overhead := public.calculate_overhead_per_unit(v_pl.warehouse_id);
  
  -- Calculate wastage cost
  -- Wastage % * BOM cost * production quantity
  v_wastage_cost := (v_pl.wastage_quantity::NUMERIC / NULLIF(v_pl.quantity_produced, 0)) 
                    * v_bom_cost * v_pl.quantity_produced;
  
  RETURN QUERY SELECT 
    v_bom_cost * v_pl.quantity_produced,
    v_overhead * v_pl.quantity_produced,
    v_wastage_cost,
    (v_bom_cost + v_overhead) * v_pl.quantity_produced + v_wastage_cost;
END;
$$;
```

---

## 📋 IMPLEMENTATION PLAN

### Phase 1: Fix Critical Functions
1. ✅ Create `calculate_bom_cost()`
2. ✅ Complete `recalculate_wac_on_purchase()`
3. ✅ Create `get_pieces_per_kg()`

### Phase 2: Cost Integration
4. ✅ Create `calculate_total_product_cost()`
5. ✅ Link to Production Log
6. ✅ Update product pricing suggestions

### Phase 3: UI Updates
7. ✅ Show BOM cost in product page
8. ✅ Show cost breakdown in production
9. ✅ Cost comparison: Actual vs Expected

---

## 🔍 SPEC vs IMPLEMENTATION

| SPEC Requirement | Status | Notes |
|-----------------|--------|-------|
| BOM Structure | ✅ | Tables exist |
| Moving Average Cost | ⚠️ | Trigger incomplete |
| Overhead Allocation | ⚠️ | Implemented but basic |
| Cost Calculation | ❌ | Functions missing |
| Wastage Tracking | ⚠️ | Table exists, no cost |
| Cost History | ⚠️ | Table exists, no data |

---

## 🚨 CRITICAL GAPS

1. **No Real-time Cost Updates**
   - WAC should update automatically on purchase
   - Currently manual or missing

2. **No Unit Conversion**
   - Can't convert pieces to kg
   - Affects BOM accuracy

3. **No Production Cost Roll-up**
   - Can't see cost per unit produced
   - No comparison: Actual vs BOM

4. **No Cost Variance Analysis**
   - Can't detect over/under usage
   - No wastage analysis

---

## ✅ RECOMMENDATIONS

1. **Immediate:** Create missing functions (I can generate these)
2. **Short-term:** Add unit conversion logic
3. **Medium-term:** Add cost variance reports
4. **Long-term:** Predictive cost analytics

---

**Want me to generate the missing SQL functions now?**
