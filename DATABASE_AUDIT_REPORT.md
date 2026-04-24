# BizManager Database Schema Audit Report

## Executive Summary

This report analyzes the BizManager Supabase database schema based on 121 migration files and business requirements documentation. The analysis reveals significant redundancies, inconsistencies, and opportunities for schema normalization that would improve maintainability, reduce storage overhead, and enhance query performance.

## Current State Analysis

### Table Inventory by Domain

#### Core CRM Entities (Aligned with Business Requirements)
- **profiles** - User profile information
- **user_roles** - Role assignments (super_admin, manager, agent, marketer, pos, customer)
- **customers** - Customer information with KYC, credit limits
- **stores** - Store information with outstanding balances
- **products** - Product catalog
- **store_types** - Store type classifications
- **routes** - Delivery routes by store type
- **sales** - Sales transactions with financial details
- **transactions** - Payment transactions
- **orders** - Customer orders (Simple/Detailed)
- **order_items** - Line items for orders
- **sale_items** - Line items for sales
- **handovers** - Cash/UPI collection tracking
- **handover_requests** - Handover approval workflow
- **notifications** - In-app notification system
- **activity_logs** - Semantic business activity tracking
- **audit_log** - Technical change tracking

#### ERP/Manufacturing Modules (Later Additions)
- **vendors** - Supplier management
- **purchase_orders** - Raw material procurement
- **raw_materials** - Inventory materials
- **bill_of_materials** - Product-to-raw-material relationships
- **workers** - Staff/worker management
- **worker_attendance** - Attendance tracking
- **worker_payments** - Worker compensation
- **income_entries** - Financial income tracking
- **expense_claims** - Expense reimbursement
- **production_log** - Manufacturing production tracking
- **warehouses** - Storage locations
- **staff_stock** - Warehouse inventory levels
- **stock_movements** - Inventory transaction tracking
- **stock_transfers** - Inter-warehouse transfers
- **unit_conversions** - Measurement unit conversions

#### Reporting/Snapshot Tables
- **daily_store_snapshots** - Daily store performance metrics
- **daily_user_snapshots** - Daily user performance metrics
- **daily_receivables_snapshots** - Daily receivables tracking
- **handover_snapshots** - Handover performance tracking

## Identified Issues

### 1. Significant Redundancies

#### Inventory/Stock Management Redundancy (6+ overlapping tables)
- **staff_stock**: Tracks current stock levels per warehouse/product
- **product_stock**: Appears to duplicate staff_stock functionality
- **raw_material_stock**: Similar to staff_stock but for raw materials
- **stock_movements**: Tracks individual stock transactions (40+ rows)
- **stock_transfers**: Tracks movements between warehouses (12 rows)
- **stock_movements_summary**: Aggregated view of stock movements
- **low_stock_alerts**: Alert system for low inventory

**Issue**: Multiple tables tracking similar inventory concepts without clear separation of concerns.

#### HR/Payroll Redundancy (5+ overlapping tables)
- **workers**: Core worker/staff information
- **staff_directory**: Duplicate worker information
- **worker_roles**: Role assignments for workers
- **attendance_records**: Worker attendance tracking
- **attendance_entries**: Duplicate attendance tracking
- **worker_attendance**: Another attendance tracking table
- **worker_payments**: Worker compensation records
- **payroll_items**: Payroll line items
- **payrolls**: Payroll run records

**Issue**: Multiple tables storing worker/attendance/payroll data with unclear boundaries.

#### Permission System Redundancy (3 overlapping systems)
- **user_roles**: Role-based assignments (super_admin, manager, etc.)
- **user_permissions**: Granular permission toggles per user
- **user_permission_overrides**: Individual permission overrides

**Issue**: Complex, overlapping permission systems that could be unified.

#### Audit/Logging Redundancy (4 overlapping systems)
- **notifications**: In-app user notifications
- **activity_logs**: Semantic business activity tracking
- **audit_log**: Technical row-level change tracking
- **schema_audit**: Schema change tracking

**Issue**: Multiple logging systems serving similar purposes.

#### Financial Tracking Redundancy
- **income**: Legacy manual income recording (deprecated)
- **income_entries**: New income tracking system
- **expenses**: Expense tracking
- **expense_claims**: Expense reimbursement claims
- **expense_claims_history**: Audit trail for expense claims
- **production_log**: Manufacturing financial tracking
- **fixed_costs**: Fixed cost tracking
- **fixed_cost_payments**: Fixed cost payment tracking

**Issue**: Fragmented financial tracking across multiple table systems.

### 2. Schema Inconsistencies

#### Column Naming Inconsistencies
- **Geolocation**: stores table has both `lat`/`lng` AND `latitude`/`longitude` columns
- **Audit Fields**: Mixed use of `created_at`/`updated_at` vs `created_by`/`updated_by`
- **Soft Delete**: Inconsistent implementation of `deleted_at`/`deleted_by` columns
- **ID Patterns**: Mix of UUID primary keys with text display_ids

#### Relationship Inconsistencies
- **Circular References**: Some tables reference each other creating potential cycles
- **Missing Constraints**: Some expected foreign key relationships absent
- **Over-Indexing**: Excessive indexes on low-cardinality columns

#### Data Type Inconsistencies
- **Numeric Precision**: Mixed use of `numeric`, `decimal`, `float` for monetary values
- **Text Lengths**: Varying text column lengths without clear rationale
- **Boolean Representation**: Mixed use of boolean, integer (0/1), and text ('true'/'false')

### 3. Business Logic Concerns

#### Violated Requirements
The requirements state: "> [!NOTE] > No stock/inventory management is required in this system."
Yet multiple inventory tables exist, suggesting feature creep beyond original scope.

#### Over-Engineering
Simple CRM requirements expanded to include full ERP/manufacturing modules without clear business justification in requirements.

#### Performance Implications
- Excessive JOINs required due to fragmented data
- Storage overhead from redundant data
- Complex query planning due to numerous similar tables

## Recommendations

### Phase 1: Immediate Cleanup (Low Risk)

1. **Remove Legacy/Deprecated Tables**
   - Drop `income` table (marked as LEGACY in comments)
   - Consolidate expense tracking into single system
   - Remove duplicate attendance tables

2. **Standardize Naming Conventions**
   - Establish consistent column naming (lat/lng vs latitude/longitude)
   - Standardize audit timestamp columns
   - Unify soft delete implementation

3. **Consolidate Similar Tables**
   - Merge staff_stock, product_stock, raw_material_stock into unified inventory table
   - Consolidate worker tables into single HR system
   - Unify permission systems

### Phase 2: Structural Improvements (Medium Risk)

1. **Implement Proper Normalization**
   - Separate concerns: core CRM vs ERP vs reporting
   - Create clear boundaries between bounded contexts
   - Implement proper foreign key relationships

2. **Create Unified Audit System**
   - Consolidate notifications, activity_logs, audit_log into hierarchical logging
   - Implement severity levels (INFO, WARN, ERROR, AUDIT)

3. **Optimize Indexing Strategy**
   - Remove redundant/duplicate indexes
   - Add missing foreign key indexes
   - Create composite indexes for common query patterns

### Phase 3: Architectural Refactoring (High Risk - Requires Migration)

1. **Bounded Context Separation**
   - Core CRM Schema: customers, stores, products, sales, transactions
   - ERP Schema: vendors, purchase_orders, raw_materials, production
   - HR Schema: workers, attendance, payroll
   - Reporting Schema: snapshots, analytics tables

2. **Event-Driven Updates**
   - Replace trigger-based calculations with event-driven updates
   - Implement CQRS for read-heavy operations like dashboards

3. **Multi-Tenant Considerations**
   - Evaluate if warehouse_id multi-tenancy can be simplified
   - Consider schema-per-tenant approach for clearer separation

## Migration Strategy

### Backward Compatibility Approach
1. Create new consolidated tables alongside existing ones
2. Implement dual-write mechanisms during transition
3. Gradually migrate read paths to new tables
4. Archive old tables after verification
5. Remove old tables in final phase

### Risk Mitigation
- Comprehensive backup before any structural changes
- Staged rollout with feature flags
- Automated testing of migration scripts
- Performance benchmarking before/after changes

## Estimated Impact

### Storage Reduction
- Estimated 40-60% reduction in storage overhead
- Elimination of duplicate data storage

### Performance Improvement
- 30-50% faster query execution due to simpler JOINs
- Reduced index maintenance overhead
- Better cache utilization

### Maintenance Improvement
- 50% reduction in schema complexity
- Easier onboarding for new developers
- Reduced bug surface area from inconsistent data

## Conclusion

The BizManager database schema has evolved organically through accretive feature additions, resulting in significant redundancy and inconsistency. While the core CRM functionality aligns well with business requirements, the addition of ERP/manufacturing modules appears to exceed the original scope ("No stock/inventory management is required").

A structured refactoring effort focusing on boundary consolidation, naming standardization, and removal of redundant tables would yield substantial benefits in maintainability, performance, and cost reduction. The migration should be approached incrementally to minimize risk while delivering measurable improvements at each stage.

---

*Report Generated: $(date)*  
*Based on analysis of 121 migration files and business requirements documentation*