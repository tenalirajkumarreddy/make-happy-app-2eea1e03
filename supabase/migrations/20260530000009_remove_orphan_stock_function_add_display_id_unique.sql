-- ============================================================
-- 20260530000009_remove_orphan_stock_function_add_display_id_unique
-- 1. Drop trigger + orphan handle_sale_inventory() — the trigger
--    was actively wired, causing stock to be deducted TWICE:
--    once by record_sale RPC, once by the AFTER INSERT trigger.
-- 2. Add UNIQUE constraint on sales.display_id to prevent
--    duplicate sale creation.
-- ============================================================

-- 1a. Drop the trigger BEFORE the function (dependency order)
DROP TRIGGER IF EXISTS trg_deduct_stock_on_sale ON public.sale_items;

-- 1b. Drop the function — record_sale RPC handles stock deduction
DROP FUNCTION IF EXISTS public.handle_sale_inventory();

-- 2. Add UNIQUE constraint on sales.display_id
--    Ensures display_id collisions are impossible at the DB level.
--    Since all migratons are applied sequentially, if duplicates
--    exist in the current data we clean them up first.
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  -- Find and deduplicate any rows sharing the same display_id
  -- Keep only the most recent row per display_id
  FOR v_dup IN
    SELECT display_id, COUNT(*), MAX(created_at) AS keep_created_at
    FROM public.sales
    GROUP BY display_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Deduplicating sales.display_id=% (% rows)', v_dup.display_id, v_dup.count;
    DELETE FROM public.sales
    WHERE display_id = v_dup.display_id
      AND created_at < v_dup.keep_created_at;
  END LOOP;
END $$;

-- Now safe to add the constraint
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_display_id_key;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_display_id_key UNIQUE (display_id);

-- 3. Also add UNIQUE constraint on transactions.display_id for consistency
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  FOR v_dup IN
    SELECT display_id, COUNT(*), MAX(created_at) AS keep_created_at
    FROM public.transactions
    GROUP BY display_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Deduplicating transactions.display_id=% (% rows)', v_dup.display_id, v_dup.count;
    DELETE FROM public.transactions
    WHERE display_id = v_dup.display_id
      AND created_at < v_dup.keep_created_at;
  LOOP;
END $$;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_display_id_key;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_display_id_key UNIQUE (display_id);
