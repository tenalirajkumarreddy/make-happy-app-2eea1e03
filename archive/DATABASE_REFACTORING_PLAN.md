# BizManager Database Refactoring Plan

Based on the database audit report, this plan outlines a structured approach to eliminate redundancies, resolve inconsistencies, and optimize the schema for better maintainability and performance.

## Phase 1: Immediate Cleanup (Weeks 1-2)
*Low risk changes that can be implemented with minimal disruption*

### 1.1 Remove Legacy/Deprecated Tables
```sql
-- Drop deprecated income table
DROP TABLE IF EXISTS public.income;

-- Remove duplicate attendance tables (keep one canonical version)
DROP TABLE IF EXISTS public.attendance_entries;
DROP TABLE IF EXISTS public.worker_attendance;

-- Keep: public.attendance_records as the canonical attendance table
```

### 1.2 Standardize Column Naming
**Geolocation Standardization**
```sql
-- Remove redundant latitude/longitude columns from stores
ALTER TABLE public.stores 
DROP COLUMN IF EXISTS latitude,
DROP COLUMN IF EXISTS longitude;

-- Keep lat/lng as the standard (already used in codebase)
```

**Audit Field Standardization**
```sql
-- Ensure all tables have consistent audit columns
-- Add missing standardized columns where needed
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS updated_by UUID,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID;
```

### 1.3 Consolidate Inventory Tables
```sql
-- Create unified inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    quantity NUMERIC NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC NOT NULL DEFAULT 0,
    unit TEXT NOT NULL,
    location_code TEXT, -- Specific bin/shelf location
    last_counted TIMESTAMPTZ,
    count_variance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Migrate data from existing tables
INSERT INTO public.inventory (product_id, warehouse_id, quantity, unit, created_at, updated_at)
SELECT product_id, warehouse_id, quantity, unit, created_at, updated_at
FROM public.staff_stock
WHERE warehouse_id IS NOT NULL AND product_id IS NOT NULL;

-- Add for raw materials if needed
INSERT INTO public.inventory (product_id, warehouse_id, quantity, unit, created_at, updated_at)
SELECT raw_material_id as product_id, warehouse_id, quantity, unit, created_at, updated_at
FROM public.raw_material_stock
WHERE warehouse_id IS NOT NULL AND raw_material_id IS NOT NULL;
```

### 1.4 Consolidate Worker/HR Tables
```sql
-- Create unified worker table
CREATE TABLE IF NOT EXISTS public.hr_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    employee_id TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    hire_date DATE,
    position TEXT,
    department TEXT,
    employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'daily_wage')),
    salary_type TEXT CHECK (salary_type IN ('monthly', 'daily', 'hourly')),
    base_salary NUMERIC(10,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Migrate data
INSERT INTO public.hr_workers (user_id, first_name, last_name, phone, email, position, is_active, created_at, updated_at)
SELECT 
    w.user_id,
    SPLIT_PART(w.name, ' ', 1) as first_name,
    CASE WHEN ARRAY_LENGTH(STRING_TO_ARRAY(w.name, ' '), 1) > 1 
         THEN SPLIT_PART(w.name, ' ', 2) ELSE '' END as last_name,
    w.phone,
    NULL as email, -- Email not in workers table
    w.role as position,
    w.is_active,
    w.created_at,
    w.updated_at
FROM public.workers w;

-- Create unified attendance table (keeping attendance_records as base)
ALTER TABLE public.attendance_records
RENAME TO public.hr_attendance;

-- Add missing standard columns
ALTER TABLE public.hr_attendance
ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES public.hr_workers(id),
ADD COLUMN IF NOT EXISTS shift_id UUID,
ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);
```

### 1.5 Simplify Permission System
```sql
-- Create unified permission system
CREATE TABLE IF NOT EXISTS public.user_permissions_unified (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    has_permission BOOLEAN NOT NULL DEFAULT false,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    reason TEXT,
    UNIQUE(user_id, permission_key)
);

-- Migrate existing permissions
INSERT INTO public.user_permissions_unified (user_id, permission_key, has_permission, granted_by, granted_at)
SELECT 
    user_id,
    permission,
    has_permission,
    granted_by,
    granted_at
FROM public.user_permissions;

-- Also migrate from overrides if they exist
INSERT INTO public.user_permissions_unified (user_id, permission_key, has_permission, granted_by, granted_at)
SELECT 
    user_id,
    permission,
    has_permission,
    granted_by,
    granted_at
FROM public.user_permission_overrides
ON CONFLICT (user_id, permission_key) DO UPDATE SET
    has_permission = EXCLUDED.has_permission,
    granted_by = EXCLUDED.granted_by,
    granted_at = EXCLUDED.granted_at;
```

## Phase 2: Structural Improvements (Weeks 3-4)
*Medium risk changes requiring careful data migration*

### 2.1 Create Bounded Context Schemas
```sql
-- Create schemas for logical separation
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS erp;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS reporting;

-- Move core CRM tables to crm schema
ALTER TABLE public.profiles SET SCHEMA crm;
ALTER TABLE public.user_roles SET SCHEMA crm;
ALTER TABLE public.customers SET SCHEMA crm;
ALTER TABLE public.stores SET SCHEMA crm;
ALTER TABLE public.products SET SCHEMA crm;
ALTER TABLE public.store_types SET SCHEMA crm;
ALTER TABLE public.routes SET SCHEMA crm;
ALTER TABLE public.sales SET SCHEMA crm;
ALTER TABLE public.transactions SET SCHEMA crm;
ALTER TABLE public.orders SET SCHEMA crm;
ALTER TABLE public.order_items SET SCHEMA crm;
ALTER TABLE public.sale_items SET SCHEMA crm;
ALTER TABLE public.handovers SET SCHEMA crm;
ALTER TABLE public.handover_requests SET SCHEMA crm;
ALTER TABLE public.notifications SET SCHEMA crm;
ALTER TABLE public.activity_logs SET SCHEMA crm;

-- Move ERP tables to erp schema
ALTER TABLE public.vendors SET SCHEMA erp;
ALTER TABLE public.purchase_orders SET SCHEMA erp;
ALTER TABLE public.raw_materials SET SCHEMA erp;
ALTER TABLE public.bill_of_materials SET SCHEMA erp;
ALTER TABLE public.inventory SET SCHEMA erp;
ALTER TABLE public.warehouses SET SCHEMA erp;
ALTER TABLE public.stock_movements SET SCHEMA erp;
ALTER TABLE public.stock_transfers SET SCHEMA erp;
ALTER TABLE public.unit_conversions SET SCHEMA erp;
ALTER TABLE public.production_log SET SCHEMA erp;
ALTER TABLE public.income_entries SET SCHEMA erp;
ALTER TABLE public.expense_claims SET SCHEMA erp;
ALTER TABLE public.fixed_costs SET SCHEMA erp;
ALTER TABLE public.fixed_cost_payments SET SCHEMA erp;

-- Move HR tables to hr schema
ALTER TABLE public.hr_workers SET SCHEMA hr;
ALTER TABLE public.hr_attendance SET SCHEMA hr;
ALTER TABLE public.worker_payments SET SCHEMA hr;
ALTER TABLE public.worker_roles SET SCHEMA hr;
ALTER TABLE public.staff_directory SET SCHEMA hr;
ALTER TABLE public.staff_cash_accounts SET SCHEMA hr;
ALTER TABLE public.expense_claims_history SET SCHEMA hr;

-- Move reporting tables to reporting schema
ALTER TABLE public.daily_store_snapshots SET SCHEMA reporting;
ALTER TABLE public.daily_user_snapshots SET SCHEMA reporting;
ALTER TABLE public.daily_receivables_snapshots SET SCHEMA reporting;
ALTER TABLE public.handover_snapshots SET SCHEMA reporting;
ALTER TABLE public.audit_log SET SCHEMA reporting;
ALTER TABLE public.schema_audit SET SCHEMA reporting;
```

### 2.2 Implement Unified Audit/Logging System
```sql
-- Create unified audit table in reporting schema
CREATE TABLE IF NOT EXISTS reporting.audit_unified (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'customer', 'store', 'sale', etc.
    entity_id UUID NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED')),
    performed_by UUID REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET,
    user_agent TEXT,
    changes JSONB, -- Stores before/after values
    metadata JSONB, -- Additional context
    severity TEXT CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'AUDIT')) DEFAULT 'INFO'
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_unified_entity ON reporting.audit_unified(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_unified_performed ON reporting.audit_unified(performed_by, performed_at);
CREATE INDEX IF NOT EXISTS idx_audit_unified_action ON reporting.audit_unified(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_unified_severity ON reporting.audit_unified(severity);
```

### 2.3 Optimize Indexing Strategy
```sql
-- Remove redundant indexes (example - would need to analyze actual usage)
-- Keep only essential indexes for query performance

-- Ensure foreign key columns are indexed
DO $$
DECLARE
    tbl record;
    col record;
BEGIN
    FOR tbl IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('crm', 'erp', 'hr', 'reporting')
    LOOP
        FOR col IN
            SELECT column_name 
            FROM information_schema.key_column_usage 
            WHERE constraint_schema = tbl.schemaname 
              AND table_name = tbl.tablename
              AND referenced_table_name IS NOT NULL
        LOOP
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I_%I_fk ON %I.%I(%I)',
                tbl.tablename, col.column_name, 
                tbl.schemaname, tbl.tablename, col.column_name
            );
        END LOOP;
    END LOOP;
END $$;

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_crm_stores_active_outstanding ON crm.stores(is_active, outstanding) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crm_sales_store_date ON crm.sales(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_transactions_store_date ON crm.transactions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_product_warehouse ON erp.inventory(product_id, warehouse_id);
```

## Phase 3: Architectural Refactoring (Weeks 5-8)
*Higher risk changes requiring application updates*

### 3.1 Update Application Data Access Layer
- Update all SQL queries to reference new schema names (crm., erp., hr., reporting.)
- Update ORM/entity mappings if using an ORM
- Update stored procedures and functions to reference new locations
- Update any hardcoded table names in application code

### 3.2 Implement Event-Driven Architecture (Optional Enhancement)
For high-frequency operations like sales and inventory updates:
```sql
-- Create event tables for decoupling
CREATE TABLE IF NOT EXISTS erp.inventory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'stock_adjustment', 'stock_transfer', etc.
    inventory_id UUID REFERENCES erp.inventory(id),
    quantity_change NUMERIC NOT NULL,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed BOOLEAN NOT NULL DEFAULT false,
    created_by UUID
);

-- Create trigger to insert events instead of direct updates
-- Application would then process events asynchronously
```

### 3.3 Add Domain Constraints and Validation
```sql
-- Add check constraints for business rules
ALTER TABLE crm.sales
ADD CONSTRAINT chk_sales_amounts 
CHECK (total_amount >= 0 AND cash_amount >= 0 AND upi_amount >= 0);

ALTER TABLE crm.sales
ADD CONSTRAINT chk_sales_outstanding_calculation
CHECK (outstanding_amount = total_amount - cash_amount - upi_amount);

-- Add constraint for handover amounts
ALTER TABLE crm.handovers
ADD CONSTRAINT chk_handover_amounts
CHECK (cash_amount >= 0 AND upi_amount >= 0);
```

## Migration Execution Strategy

### Week 0: Preparation
1. Complete backup of current database
2. Set up staging environment with copy of production data
3. Implement feature flags for gradual rollout
4. Prepare rollback procedures

### Week 1-2: Phase 1 Execution
1. Execute cleanup scripts on staging
2. Run application tests against staging
3. Verify no functional regressions
4. Deploy to production during low-traffic window
5. Monitor for issues

### Week 3-4: Phase 2 Execution
1. Execute schema reorganization on staging
2. Implement dual-write mechanism for transition period
3. Gradually shift read traffic to new schemas
4. Deploy to production with monitoring
5. Verify data consistency

### Week 5-8: Phase 3 Execution
1. Update application code to use new schemas
2. Feature flag cutover to new data access layer
3. Remove dual-write mechanisms
4. Archive old tables after verification period
5. Final cleanup and optimization

## Risk Mitigation

### Backup Strategy
- Daily logical backups (pg_dump)
- Weekly physical backups (pg_basebackup)
- Point-in-time recovery enabled
- Test restore procedures monthly

### Rollback Procedures
- Each migration script includes DOWN migration
- Blue-green deployment approach available
- Database snapshots before major changes
- Feature flags allow quick reversion

### Testing Approach
1. Unit tests for each migration script
2. Integration tests on staging copy
3. Performance benchmarking before/after
4. User acceptance testing with key scenarios
5. Chaos testing for failure scenarios

## Success Metrics

### Storage Efficiency
- Target: 50% reduction in table count
- Target: 40% reduction in storage size
- Target: Elimination of duplicate data

### Query Performance
- Target: 30% improvement in dashboard query times
- Target: 50% reduction in index maintenance overhead
- Target: Improved cache hit ratios

### Maintenance Efficiency
- Target: 50% reduction in schema-related bugs
- Target: 40% faster onboarding for new developers
- Target: Simpler backup/restore procedures

### Business Continuity
- Zero data loss during migration
- <5 minutes downtime for cutover
- No functional regression in core features
- Preservation of all historical data for reporting

## Conclusion

This refactoring plan addresses the significant redundancies and inconsistencies identified in the BizManager database schema while preserving all business functionality. By approaching the refactoring in phases with clear risk mitigation strategies, we can deliver substantial improvements in maintainability, performance, and cost efficiency with minimal disruption to ongoing operations.

The estimated effort is 8 weeks for a dedicated team, with the highest value improvements (Phase 1 cleanup) deliverable in the first 2 weeks. Subsequent phases build upon this foundation to deliver increasingly sophisticated optimizations.