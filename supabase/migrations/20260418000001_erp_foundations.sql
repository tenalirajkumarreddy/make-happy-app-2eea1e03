-- Phase 1: ERP Foundations
-- This migration establishes the foundational tables and types for new ERP modules.

BEGIN;

-- Section 1: Raw Materials, Vendors, and Purchasing
-- Create a vendors table to manage suppliers of raw materials.
CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendors_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON "public"."vendors" FOR ALL USING (("auth"."uid"() IN ( SELECT "user_id" FROM "public"."user_roles" WHERE "warehouse_id" = "vendors"."warehouse_id")));

-- Create a purchase_orders table for tracking raw material procurement.
CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL, -- References raw_materials via a view or is a generic product id
    "quantity" numeric NOT NULL,
    "price" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text", -- pending, completed, cancelled
    "notes" "text",
    "order_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "warehouse_id" "uuid" NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id"),
    CONSTRAINT "purchase_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id"),
    CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON "public"."purchase_orders" FOR ALL USING (("auth"."uid"() IN ( SELECT "user_id" FROM "public"."user_roles" WHERE "warehouse_id" = "purchase_orders"."warehouse_id")));


-- Create a bill_of_materials table to link products to their raw material components.
CREATE TABLE IF NOT EXISTS "public"."bill_of_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "raw_material_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "notes" "text",
    CONSTRAINT "bill_of_materials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bill_of_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE,
    CONSTRAINT "bill_of_materials_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."products"("id") ON DELETE CASCADE -- Assuming raw materials are also in products table
);
ALTER TABLE "public"."bill_of_materials" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all authenticated users" ON "public"."bill_of_materials" FOR SELECT USING (auth.role() = 'authenticated');


-- Section 2: Staff, Workers, and Payroll
-- Create a workers table for daily wage or monthly salary staff.
CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "role" "text",
    "salary_type" "text" DEFAULT 'daily'::"text", -- daily, monthly
    "salary_amount" numeric DEFAULT 0,
    "warehouse_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON "public"."workers" FOR ALL USING (("auth"."uid"() IN ( SELECT "user_id" FROM "public"."user_roles" WHERE "warehouse_id" = "workers"."warehouse_id")));


-- Create a worker_shifts table to define shift timings and costs.
CREATE TABLE IF NOT EXISTS "public"."worker_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "cost" numeric,
    "warehouse_id" "uuid" NOT NULL,
    CONSTRAINT "worker_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "worker_shifts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."worker_shifts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON "public"."worker_shifts" FOR ALL USING (("auth"."uid"() IN ( SELECT "user_id" FROM "public"."user_roles" WHERE "warehouse_id" = "worker_shifts"."warehouse_id")));


-- Create an attendance table to track worker attendance.
CREATE TABLE IF NOT EXISTS "public"."worker_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "shift_id" "uuid",
    "date" "date" NOT NULL,
    "status" "text" NOT NULL, -- present, absent, half_day
    "manual_amount" numeric,
    "notes" "text",
    "recorded_by" "uuid" DEFAULT "auth"."uid"(),
    "warehouse_id" "uuid" NOT NULL,
    CONSTRAINT "worker_attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "worker_attendance_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE,
    CONSTRAINT "worker_attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."worker_shifts"("id") ON DELETE SET NULL,
    CONSTRAINT "worker_attendance_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."worker_attendance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to own warehouse data" ON "public"."worker_attendance" FOR ALL USING (("auth"."uid"() IN ( SELECT "user_id" FROM "public"."user_roles" WHERE "warehouse_id" = "worker_attendance"."warehouse_id")));


-- Section 3: Enhanced Access Control
-- Create a table for individual user permission overrides.
CREATE TABLE IF NOT EXISTS "public"."user_permission_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission" "text" NOT NULL,
    "has_permission" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    UNIQUE("user_id", "permission")
);
ALTER TABLE "public"."user_permission_overrides" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admin to manage all" ON "public"."user_permission_overrides" FOR ALL USING ((get_my_claim('role'::"text") = '"super_admin"'::"jsonb"));
CREATE POLICY "Allow users to read their own overrides" ON "public"."user_permission_overrides" FOR SELECT USING (("auth"."uid"() = "user_id"));


COMMIT;
