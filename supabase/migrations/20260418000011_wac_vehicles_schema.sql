-- Migration for WAC Cost History and Vehicles

BEGIN;

-- Create the vehicles table
CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "license_plate" "text" NOT NULL,
    "make" "text",
    "model" "text",
    "max_weight_kg" numeric DEFAULT 1000,
    "max_volume_cbm" numeric DEFAULT 10,
    "status" "text" DEFAULT 'active',
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" 
ON "public"."vehicles" 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow full access to admin users" 
ON "public"."vehicles" 
FOR ALL 
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));


-- Create the wac_cost_history table for Raw Material WAC tracking
CREATE TABLE IF NOT EXISTS "public"."wac_cost_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "raw_material_id" "uuid" NOT NULL,
    "old_cost" numeric NOT NULL,
    "new_cost" numeric NOT NULL,
    "reason" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wac_cost_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wac_cost_history_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."wac_cost_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" 
ON "public"."wac_cost_history" 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert access to admin users" 
ON "public"."wac_cost_history" 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');


-- Add a database function to update WAC cost history automatically (optional) or allow manual trigger
CREATE OR REPLACE FUNCTION log_wac_cost_change(
    p_raw_material_id uuid,
    p_old_cost numeric,
    p_new_cost numeric,
    p_reason text
) RETURNS void AS $$
BEGIN
    INSERT INTO public.wac_cost_history (raw_material_id, old_cost, new_cost, reason)
    VALUES (p_raw_material_id, p_old_cost, p_new_cost, p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Notify postgrest to reload the schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
