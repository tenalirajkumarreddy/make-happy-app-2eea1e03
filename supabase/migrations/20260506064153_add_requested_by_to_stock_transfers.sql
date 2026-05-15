-- Add requested_by column to stock_transfers table
-- This column stores the user ID who initiated the transfer request

DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stock_transfers' AND column_name = 'requested_by'
  ) THEN
    -- Check if old column name exists (created_by)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'stock_transfers' AND column_name = 'created_by'
    ) THEN
      -- Rename old column
      ALTER TABLE stock_transfers RENAME COLUMN created_by TO requested_by;
    ELSE
      -- Add new column
      ALTER TABLE stock_transfers ADD COLUMN requested_by UUID REFERENCES auth.users(id);
    END IF;
  END IF;
END
$$;

-- Verify column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'stock_transfers' AND column_name = 'requested_by';
