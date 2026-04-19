-- Migration: add_mileage_to_vehicles
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS mileage_kmpl NUMERIC DEFAULT 10.0;
