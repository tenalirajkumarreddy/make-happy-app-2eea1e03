# Manufacturing Cost Calculation Algorithm

## Overview
Complete algorithm for calculating total manufacturing cost including direct materials, labor, and overhead.

---

## 1. Cost Components Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              TOTAL MANUFACTURING COST                            │
│                     (Per Unit)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  DIRECT COSTS   │  │    LABOR COST   │  │   OVERHEAD      │ │
│  │                 │  │                 │  │                 │ │
│  │ • Raw Materials │  │ • Direct Labor  │  │ • Factory OH    │ │
│  │ • Packaging     │  │ • Setup Labor   │  │ • Utilities     │ │
│  │ • Consumables   │  │ • QC Labor      │  │ • Depreciation  │ │
│  │                 │  │                 │  │ • Maintenance   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  FORMULA:                                                        │
│  Total Cost = Direct Materials + Direct Labor + Allocated OH     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Algorithm Definitions

### 2.1 Direct Material Cost (DMC)
```typescript
function calculateDirectMaterialCost(productId: string, warehouseId: string): Decimal {
    // Uses the BOM cost function we already built
    const bomCost = calculate_bom_cost(productId, warehouseId);
    
    // Add packaging materials (if separate from BOM)
    const packagingCost = getPackagingCost(productId);
    
    // Add consumables (lubricants, cleaning supplies, etc.)
    const consumableCost = getConsumableCost(productId);
    
    return bomCost + packagingCost + consumableCost;
}
```

### 2.2 Direct Labor Cost (DLC)
```typescript
function calculateDirectLaborCost(
    productionRun: ProductionRun,
    productUnits: number
): Decimal {
    // Get labor hours for this production run
    const laborRecords = getLaborRecords(productionRun.id);
    
    let totalLaborCost = 0;
    
    for (const labor of laborRecords) {
        // Calculate cost for each worker/activity
        const workerCost = labor.hours * labor.hourlyRate * (1 + labor.benefitsPercent);
        totalLaborCost += workerCost;
    }
    
    // Cost per unit = Total labor cost / Units produced
    return totalLaborCost / productUnits;
}
```

### 2.3 Manufacturing Overhead (MOH)
```typescript
function calculateManufacturingOverhead(
    productionRun: ProductionRun,
    productUnits: number
): Decimal {
    // Get overhead rates for the period
    const overheadRates = getOverheadRates(productionRun.warehouseId);
    
    // Method 1: Direct Labor Hours Rate
    const totalLaborHours = productionRun.totalLaborHours;
    const overheadByLaborHours = totalLaborHours * overheadRates.perLaborHour;
    
    // Method 2: Machine Hours Rate
    const totalMachineHours = productionRun.totalMachineHours;
    const overheadByMachineHours = totalMachineHours * overheadRates.perMachineHour;
    
    // Method 3: Units Produced Rate
    const overheadByUnits = productUnits * overheadRates.perUnit;
    
    // Choose allocation method based on production type
    const selectedOverhead = selectAllocationMethod(
        productionRun.productionType,  // 'labor-intensive' | 'machine-intensive' | 'standard'
        overheadByLaborHours,
        overheadByMachineHours,
        overheadByUnits
    );
    
    return selectedOverhead / productUnits; // Cost per unit
}
```

---

## 3. Complete Manufacturing Cost Formula

```sql
-- PostgreSQL Function for Total Manufacturing Cost
CREATE OR REPLACE FUNCTION calculate_manufacturing_cost(
    p_production_run_id UUID,
    p_product_id UUID,
    p_warehouse_id UUID
)
RETURNS TABLE (
    direct_material_cost NUMERIC,
    direct_labor_cost NUMERIC,
    manufacturing_overhead NUMERIC,
    total_cost_per_unit NUMERIC,
    total_run_cost NUMERIC,
    units_produced INTEGER
) AS $$
DECLARE
    v_units_produced INTEGER;
    v_direct_material NUMERIC;
    v_direct_labor NUMERIC;
    v_overhead NUMERIC;
    v_total_per_unit NUMERIC;
    v_total_run_cost NUMERIC;
BEGIN
    -- Get units produced in this run
    SELECT units_produced INTO v_units_produced
    FROM production_runs
    WHERE id = p_production_run_id;
    
    -- Calculate Direct Material Cost (from BOM)
    v_direct_material := calculate_bom_cost(p_product_id, p_warehouse_id);
    
    -- Calculate Direct Labor Cost
    SELECT COALESCE(SUM(labor_cost), 0) / v_units_produced
    INTO v_direct_labor
    FROM production_labor
    WHERE production_run_id = p_production_run_id;
    
    -- Calculate Manufacturing Overhead
    SELECT COALESCE(SUM(overhead_cost), 0) / v_units_produced
    INTO v_overhead
    FROM production_overhead_allocations
    WHERE production_run_id = p_production_run_id;
    
    -- Calculate totals
    v_total_per_unit := v_direct_material + v_direct_labor + v_overhead;
    v_total_run_cost := v_total_per_unit * v_units_produced;
    
    RETURN QUERY SELECT 
        v_direct_material,
        v_direct_labor,
        v_overhead,
        v_total_per_unit,
        v_total_run_cost,
        v_units_produced;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Real-Time Cost Calculation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCTION RUN START                         │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. RECORD START TIME & RESOURCES                                │
│     - Workers assigned                                           │
│     - Machines allocated                                         │
│     - Raw materials reserved (stock allocated)                   │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. DURING PRODUCTION - REAL-TIME TRACKING                       │
│     - Labor hours logged per worker                              │
│     - Machine hours tracked                                      │
│     - Material consumption recorded                              │
│     - Scrap/wastage noted                                        │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. PRODUCTION COMPLETION                                        │
│     - Actual units produced                                        │
│     - Good units vs defective units                              │
│     - Actual material consumed (vs BOM estimate)                 │
│     - Total labor hours                                          │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. COST CALCULATION TRIGGER                                     │
│     [calculate_manufacturing_cost()]                             │
│     ├─ Direct Materials: BOM cost × actual usage                 │
│     ├─ Direct Labor: hours × rate / units produced               │
│     ├─ Overhead: allocated based on method                     │
│     └─ Total Cost: Sum of all components                         │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. VARIANCE ANALYSIS                                            │
│     - Standard cost vs Actual cost                               │
│     - Material usage variance                                    │
│     - Labor efficiency variance                                  │
│     - Overhead spending variance                                   │
└───────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. COST POSTING                                                 │
│     - Update product cost history                                │
│     - Record in cost ledger                                      │
│     - Update inventory valuation (WAC)                           │
│     - Generate cost reports                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Overhead Allocation Methods

### Method 1: Direct Labor Hours (Labor-Intensive Production)
```
Overhead Rate = Total Overhead Costs / Total Direct Labor Hours
Cost per Unit = (Labor Hours per Unit × Overhead Rate) + Direct Costs
```

**Use When:**
- Manual assembly operations
- High labor content
- Minimal machine usage
- Example: Bottling plant, packaging

### Method 2: Machine Hours (Machine-Intensive Production)
```
Overhead Rate = Total Overhead Costs / Total Machine Hours
Cost per Unit = (Machine Hours per Unit × Overhead Rate) + Direct Costs
```

**Use When:**
- Automated production
- CNC machines, injection molding
- Machine depreciation is significant
- Example: Preform manufacturing

### Method 3: Units Produced (Standard Production)
```
Overhead Rate = Total Overhead Costs / Total Units Produced
Cost per Unit = Overhead Rate + Direct Costs
```

**Use When:**
- Uniform products
- Stable production volume
- Mixed labor and machine usage
- Example: Mass production lines

### Method 4: Activity-Based Costing (ABC)
```
Cost Driver Rate = Cost Pool / Cost Driver Volume
Allocated Cost = Activity Usage × Cost Driver Rate
```

**Activities & Drivers:**
| Activity | Cost Driver | Rate Calculation |
|----------|-------------|------------------|
| Machine Setup | Setup Hours | Setup Costs / Total Setup Hours |
| Quality Control | Inspections | QC Costs / Total Inspections |
| Material Handling | Moves | Handling Costs / Total Moves |
| Production Runs | Number of Runs | Setup Costs / Total Runs |

---

## 6. Database Schema for Manufacturing Cost

```sql
-- Production Run Master Table
CREATE TABLE production_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT UNIQUE,
    product_id UUID REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id),
    
    -- Planning
    planned_units INTEGER NOT NULL,
    planned_start TIMESTAMP WITH TIME ZONE,
    planned_end TIMESTAMP WITH TIME ZONE,
    
    -- Actual Production
    units_produced INTEGER DEFAULT 0,
    good_units INTEGER DEFAULT 0,
    defective_units INTEGER DEFAULT 0,
    
    -- Timestamps
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status TEXT CHECK (status IN ('planned', 'in-progress', 'completed', 'cancelled')),
    
    -- Cost Summary
    standard_cost_per_unit NUMERIC(12,2),
    actual_cost_per_unit NUMERIC(12,2),
    total_actual_cost NUMERIC(12,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Labor Tracking
CREATE TABLE production_labor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_run_id UUID REFERENCES production_runs(id),
    worker_id UUID REFERENCES workers(id),
    
    -- Time Tracking
    clock_in TIMESTAMP WITH TIME ZONE,
    clock_out TIMESTAMP WITH TIME ZONE,
    total_hours NUMERIC(5,2),
    
    -- Cost
    hourly_rate NUMERIC(10,2),
    benefits_percent NUMERIC(5,2) DEFAULT 0, -- e.g., 0.30 for 30%
    labor_cost NUMERIC(10,2), -- calculated: hours × rate × (1 + benefits)
    
    -- Activity
    activity_type TEXT, -- 'production', 'setup', 'qc', 'maintenance'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Material Consumption (Actual vs Planned)
CREATE TABLE production_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_run_id UUID REFERENCES production_runs(id),
    raw_material_id UUID REFERENCES raw_materials(id),
    
    -- Planned vs Actual
    planned_quantity NUMERIC(10,3),
    actual_quantity NUMERIC(10,3),
    wastage_quantity NUMERIC(10,3) DEFAULT 0,
    
    -- Cost
    unit_cost NUMERIC(10,2), -- WAC at time of consumption
    total_cost NUMERIC(12,2), -- actual_quantity × unit_cost
    
    -- Variance
    usage_variance NUMERIC(10,3), -- planned - actual
    cost_variance NUMERIC(12,2),
    
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Machine Usage & Overhead
CREATE TABLE production_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_run_id UUID REFERENCES production_runs(id),
    machine_id UUID REFERENCES machines(id),
    
    -- Usage
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    total_hours NUMERIC(5,2),
    
    -- Cost
    hourly_rate NUMERIC(10,2), -- depreciation + power + maintenance
    total_cost NUMERIC(12,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Overhead Allocation
CREATE TABLE overhead_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_run_id UUID REFERENCES production_runs(id),
    
    allocation_method TEXT CHECK (allocation_method IN ('labor-hours', 'machine-hours', 'units', 'abc')),
    
    -- Allocation Base
    base_quantity NUMERIC(10,2), -- hours or units
    overhead_rate NUMERIC(10,4), -- cost per base unit
    
    -- Allocated Amount
    allocated_amount NUMERIC(12,2),
    
    -- Details
    allocation_period DATE,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cost History (Snapshot for reporting)
CREATE TABLE product_cost_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    
    -- Date Range
    effective_from DATE,
    effective_to DATE,
    
    -- Cost Components
    direct_material_cost NUMERIC(10,2),
    direct_labor_cost NUMERIC(10,2),
    manufacturing_overhead NUMERIC(10,2),
    total_cost NUMERIC(10,2),
    
    -- Source
    source_type TEXT CHECK (source_type IN ('production', 'manual', 'import')),
    production_run_id UUID REFERENCES production_runs(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 7. Cost Variance Analysis

### 7.1 Material Usage Variance
```
MUV = (Actual Quantity - Standard Quantity) × Standard Price

Example:
- Standard: 1.1 preforms per bottle @ ₹4.50
- Actual: 1.15 preforms per bottle @ ₹4.46
- MUV = (1.15 - 1.1) × 4.50 = 0.05 × 4.50 = ₹0.225 (Unfavorable)
```

### 7.2 Material Price Variance
```
MPV = (Actual Price - Standard Price) × Actual Quantity

Example:
- Standard Price: ₹4.50
- Actual Price: ₹4.46 (updated WAC)
- Actual Quantity: 1.15
- MPV = (4.46 - 4.50) × 1.15 = -0.04 × 1.15 = -₹0.046 (Favorable)
```

### 7.3 Labor Efficiency Variance
```
LEV = (Actual Hours - Standard Hours) × Standard Rate

Example:
- Standard: 0.5 hours per unit @ ₹100/hour
- Actual: 0.45 hours per unit @ ₹100/hour
- LEV = (0.45 - 0.5) × 100 = -0.05 × 100 = -₹5 (Favorable)
```

### 7.4 Overhead Spending Variance
```
OSV = Actual Overhead - (Actual Base × Standard Rate)

Example:
- Standard Rate: ₹50 per machine hour
- Actual Hours: 0.2 hours
- Actual Overhead: ₹12
- OSV = 12 - (0.2 × 50) = 12 - 10 = ₹2 (Unfavorable)
```

---

## 8. Integration Points

### 8.1 With Inventory System
```typescript
// When production completes:
function completeProduction(run: ProductionRun) {
    // 1. Calculate actual costs
    const costs = calculateManufacturingCost(run);
    
    // 2. Reduce raw material stock
    for (const material of run.materialsConsumed) {
        reduceStock(material.rawMaterialId, material.actualQuantity);
    }
    
    // 3. Add finished goods to stock with calculated cost
    addStock(run.productId, run.goodUnits, costs.totalCostPerUnit);
    
    // 4. Update WAC for finished product
    updateProductWAC(run.productId, costs.totalCostPerUnit);
}
```

### 8.2 With BOM System
```typescript
// Standard cost from BOM vs Actual cost from production
function compareCosts(productId: string) {
    const standardCost = calculate_bom_cost(productId); // From BOM
    const actualCost = getLastProductionCost(productId); // From production runs
    
    const variance = actualCost - standardCost;
    const variancePercent = (variance / standardCost) × 100;
    
    return {
        standardCost,
        actualCost,
        variance,
        variancePercent,
        isWithinTolerance: Math.abs(variancePercent) < 5
    };
}
```

### 8.3 With Sales & Pricing
```typescript
// Minimum selling price calculation
function calculateMinimumPrice(productId: string) {
    const manufacturingCost = getCurrentCost(productId);
    const desiredMargin = 0.20; // 20% margin
    const minimumPrice = manufacturingCost / (1 - desiredMargin);
    
    return {
        manufacturingCost,
        minimumPrice,
        recommendedRetail: minimumPrice × 1.5 // 50% markup
    };
}
```

---

## 9. Cost Reporting Dashboard

### Key Metrics to Track
| Metric | Formula | Target |
|--------|---------|--------|
| Material Cost % | (DM / Total Cost) × 100 | 60-70% |
| Labor Cost % | (DL / Total Cost) × 100 | 15-25% |
| Overhead % | (OH / Total Cost) × 100 | 10-15% |
| Cost Variance % | (Actual - Standard) / Standard | < ±5% |
| Yield Rate | Good Units / Total Units | > 95% |
| Cost per Unit | Total Cost / Units | Trend down |

### SQL for Cost Analysis Report
```sql
SELECT 
    pr.display_id,
    p.name as product_name,
    pr.units_produced,
    pr.planned_units,
    
    -- Cost Components
    pch.direct_material_cost,
    pch.direct_labor_cost,
    pch.manufacturing_overhead,
    pch.total_cost,
    
    -- Variance Analysis
    pr.standard_cost_per_unit,
    pr.actual_cost_per_unit,
    (pr.actual_cost_per_unit - pr.standard_cost_per_unit) as cost_variance,
    
    -- Efficiency
    ROUND((pr.good_units::NUMERIC / pr.units_produced) * 100, 2) as yield_percent,
    
    -- Cost Breakdown Percentages
    ROUND((pch.direct_material_cost / pch.total_cost) * 100, 1) as material_pct,
    ROUND((pch.direct_labor_cost / pch.total_cost) * 100, 1) as labor_pct,
    ROUND((pch.manufacturing_overhead / pch.total_cost) * 100, 1) as overhead_pct

FROM production_runs pr
JOIN products p ON pr.product_id = p.id
LEFT JOIN product_cost_history pch ON pr.id = pch.production_run_id
WHERE pr.status = 'completed'
  AND pr.actual_end >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY pr.actual_end DESC;
```

---

## 10. Implementation Priority

### Phase 1: Core BOM Cost ✅ COMPLETE
- [x] BOM structure and versioning
- [x] Raw material WAC calculation
- [x] calculate_bom_cost() function

### Phase 2: Production Tracking (Next)
- [ ] Production runs table
- [ ] Material consumption tracking
- [ ] Labor time tracking
- [ ] calculate_manufacturing_cost() function

### Phase 3: Overhead Allocation
- [ ] Overhead rates configuration
- [ ] Allocation method selection
- [ ] Period-end overhead distribution

### Phase 4: Variance Analysis
- [ ] Standard cost setup
- [ ] Variance calculation triggers
- [ ] Cost reports and dashboards

### Phase 5: Integration
- [ ] Production to inventory posting
- [ ] Cost ledger integration
- [ ] Financial reporting

---

## 11. Usage Example

```typescript
// Create a production run
const productionRun = {
    productId: '44dad210-a5e4-4db0-99e6-1c823f7103ab',
    warehouseId: '67f904b6-94f8-4fe8-a585-4774c6b2142c',
    plannedUnits: 1000,
    plannedStart: new Date('2024-01-20T08:00:00'),
    plannedEnd: new Date('2024-01-20T17:00:00')
};

// During production
const costs = await calculateManufacturingCost({
    productionRunId: productionRun.id,
    productId: productionRun.productId,
    warehouseId: productionRun.warehouseId
});

// Result:
// {
//     directMaterialCost: 6.91,
//     directLaborCost: 2.50,
//     manufacturingOverhead: 1.20,
//     totalCostPerUnit: 10.61,
//     totalRunCost: 10610.00,
//     unitsProduced: 1000
// }

// Compare with BOM standard cost
const variance = costs.totalCostPerUnit - 6.91; // Standard from BOM
// Variance = 10.61 - 6.91 = ₹3.70 (includes labor + overhead)
```

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-19  
**Status:** Algorithm Design Complete - Ready for Implementation
