-- Migration: Multi-Currency Support
-- Phase 4: Scale & Polish - Issue #11
-- Created: 2026-04-15

-- Add currency columns to existing tables
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'INR';

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'INR';

-- Create exchange rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL CHECK (rate > 0),
  effective_date DATE NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(from_currency, to_currency, effective_date)
);

-- Create index for exchange rate lookups
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(from_currency, to_currency, effective_date DESC);
CREATE INDEX idx_exchange_rates_effective_date ON exchange_rates(effective_date);

-- RLS policies for exchange rates
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view exchange rates
CREATE POLICY "Staff can view exchange rates"
ON exchange_rates FOR SELECT
TO authenticated
USING (
  user_is_staff(auth.uid())
);

-- Policy: Super admin and manager can manage exchange rates
CREATE POLICY "Managers can manage exchange rates"
ON exchange_rates FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'manager')
  )
);

-- Function to convert currency
CREATE OR REPLACE FUNCTION convert_currency(
  p_amount NUMERIC,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
  v_result NUMERIC;
BEGIN
  -- Same currency, no conversion needed
  IF p_from_currency = p_to_currency THEN
    RETURN p_amount;
  END IF;
  
  -- Validate currency codes (ISO 4217 common codes)
  IF p_from_currency NOT IN ('INR', 'USD', 'EUR', 'GBP') THEN
    RAISE WARNING 'Unrecognized from_currency: %, using 1:1 rate', p_from_currency;
    RETURN p_amount;
  END IF;
  
  IF p_to_currency NOT IN ('INR', 'USD', 'EUR', 'GBP') THEN
    RAISE WARNING 'Unrecognized to_currency: %, using 1:1 rate', p_to_currency;
    RETURN p_amount;
  END IF;
  
  -- Get exchange rate
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE from_currency = p_from_currency
  AND to_currency = p_to_currency
  AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;
  
  -- If no rate found, try inverse rate
  IF v_rate IS NULL THEN
    SELECT 1.0 / rate INTO v_rate
    FROM exchange_rates
    WHERE from_currency = p_to_currency
    AND to_currency = p_from_currency
    AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;
  
  -- Calculate result
  v_result := p_amount * COALESCE(v_rate, 1);
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get current exchange rate
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF p_from_currency = p_to_currency THEN
    RETURN 1;
  END IF;
  
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE from_currency = p_from_currency
  AND to_currency = p_to_currency
  AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;
  
  IF v_rate IS NULL THEN
    -- Try inverse
    SELECT 1.0 / rate INTO v_rate
    FROM exchange_rates
    WHERE from_currency = p_to_currency
    AND to_currency = p_from_currency
    AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_rate, 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- Insert default exchange rates (example values - should be updated with real rates)
-- These are placeholder rates - update with actual rates via admin UI
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
VALUES 
  ('USD', 'INR', 83.5, CURRENT_DATE, 'default'),
  ('EUR', 'INR', 90.2, CURRENT_DATE, 'default'),
  ('GBP', 'INR', 105.8, CURRENT_DATE, 'default'),
  ('INR', 'USD', 0.012, CURRENT_DATE, 'default'),
  ('INR', 'EUR', 0.011, CURRENT_DATE, 'default'),
  ('INR', 'GBP', 0.0094, CURRENT_DATE, 'default'),
  ('USD', 'EUR', 0.92, CURRENT_DATE, 'default'),
  ('EUR', 'USD', 1.09, CURRENT_DATE, 'default'),
  ('GBP', 'USD', 1.27, CURRENT_DATE, 'default'),
  ('USD', 'GBP', 0.79, CURRENT_DATE, 'default')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- Trigger to update updated_at on exchange_rates
CREATE OR REPLACE FUNCTION update_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_exchange_rates_updated_at ON exchange_rates;
CREATE TRIGGER update_exchange_rates_updated_at
  BEFORE UPDATE ON exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_exchange_rates_updated_at();

-- Comments
COMMENT ON TABLE exchange_rates IS 'Historical exchange rates for currency conversion';
COMMENT ON FUNCTION convert_currency IS 'Converts amount from one currency to another using exchange rates';
COMMENT ON FUNCTION get_exchange_rate IS 'Gets current exchange rate between two currencies';
