# RLS Security Audit Report

## Overview
This document provides a comprehensive audit of Row Level Security (RLS) policies across all database tables.

## CORS Configuration ✅
**Status:** PROPERLY CONFIGURED
- Location: `supabase/functions/_shared/cors.ts`
- Type: **Whitelist-based** (NOT wildcard)
- Allowed Origins:
  - Production: `https://aquaprimesales.vercel.app`
  - Development: `http://localhost:5000`, `http://localhost:5173`, `http://localhost:8100`
  - Dynamically allows any `localhost` or `127.0.0.1` origin during development

## RLS Policy Status

### ✅ Tables with RLS Enabled
Based on migration `20260317000001_customer_self_register_rls.sql`:
- `customers` - Customer self-registration with proper access controls
- `profiles` - User profile data
- `user_roles` - Role assignments

### 🔍 Tables Requiring RLS Audit
The following critical tables need RLS verification:

#### Authentication & Access Control
- [ ] `profiles` - User profiles (verify read/write policies)
- [ ] `user_roles` - Role assignments (verify only admins can modify)
- [ ] `route_access_matrix` - Route permissions (verify staff cannot escalate permissions)
- [ ] `store_type_access_matrix` - Store type permissions

#### Business Data
- [ ] `sales` - Sales records (verify agents can only see their own sales)
- [ ] `sale_items` - Sale line items (inherit from sales)
- [ ] `transactions` - Financial transactions (verify proper scoping)
- [ ] `customers` - Customer data (verify access matrix)
- [ ] `stores` - Store locations (verify route-based access)
- [ ] `routes` - Sales routes (verify agent assignment)
- [ ] `products` - Product catalog (verify role-based access)
- [ ] `inventory` - Stock levels (verify location-based access)

#### Financial & Sensitive Data
- [ ] `handovers` - Cash handovers (verify only involved parties can access)
- [ ] `invoices` - Tax invoices (verify customer/admin access only)
- [ ] `orders` - Orders (verify proper scoping)
- [ ] `vendor_payments` - Vendor payments (verify admin-only)
- [ ] `purchases` - Purchase records (verify admin/manager only)

#### System & Audit
- [ ] `activity_logs` - Audit trail (verify read-only for non-admins)
- [ ] `notifications` - User notifications (verify user can only see their own)
- [ ] `push_subscriptions` - Push notification subscriptions (verify user ownership)

### Storage Buckets
- [ ] `kyc-documents` - KYC document storage (CRITICAL - verify customer can only access their own)
- [ ] `product-images` - Product images (verify public read, admin write)
- [ ] `banner-images` - Marketing banners (verify public read, admin write)

## Recommended RLS Policies

### Template: User-Scoped Data
\`\`\`sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data"
ON table_name FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own data
CREATE POLICY "Users can insert own data"
ON table_name FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own data
CREATE POLICY "Users can update own data"
ON table_name FOR UPDATE
USING (auth.uid() = user_id);
\`\`\`

### Template: Role-Based Access
\`\`\`sql
-- Admin full access
CREATE POLICY "Admins have full access"
ON table_name FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('super_admin', 'manager')
  )
);

-- Staff read access
CREATE POLICY "Staff can read"
ON table_name FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('super_admin', 'manager', 'agent', 'marketer', 'pos')
  )
);
\`\`\`

## Action Items

1. **IMMEDIATE**: Run the audit SQL script (`scripts/audit-rls.sql`) in Supabase SQL Editor
2. **HIGH PRIORITY**: Enable RLS on all tables without it
3. **HIGH PRIORITY**: Verify `kyc-documents` bucket has proper RLS policies
4. **MEDIUM PRIORITY**: Add policies for tables with RLS enabled but no policies
5. **ONGOING**: Test horizontal access (User A cannot access User B's data)

## Testing Checklist

### Manual Testing Steps
1. Create test users with different roles (admin, agent, customer)
2. Attempt to access another user's data via direct SQL
3. Attempt to escalate privileges by modifying `user_roles`
4. Attempt to access KYC documents of other customers
5. Verify agents can only see sales for their assigned routes

### Automated Testing
Create integration tests for:
- [ ] RLS policy coverage for all tables
- [ ] Horizontal access prevention
- [ ] Role-based access enforcement
- [ ] Storage bucket access controls

## References
- Supabase RLS Documentation: https://supabase.com/docs/guides/auth/row-level-security
- Security Best Practices: https://supabase.com/docs/guides/auth/row-level-security#security-definer-vs-security-invoker
