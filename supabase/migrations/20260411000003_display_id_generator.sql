-- ==========================================
-- Display ID Generator (Prefix + YYYYMMDD + Sequence)
--
-- Provides:
--   - public.generate_display_id(prefix TEXT)
--   - public.generate_display_id(prefix TEXT, seq_name TEXT)
--
-- Notes:
--   - `seq_name` is accepted for backwards-compat with existing clients.
--   - IDs are generated using a counters table for concurrency safety.
--   - Format: PREFIX-YYYYMMDD-0001
-- ==========================================

CREATE TABLE IF NOT EXISTS public.display_id_counters (
	prefix TEXT NOT NULL,
	day DATE NOT NULL,
	last_value INTEGER NOT NULL DEFAULT 0,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (prefix, day)
);

ALTER TABLE public.display_id_counters ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose: clients should not access counters directly.

CREATE OR REPLACE FUNCTION public.generate_display_id(prefix TEXT, seq_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_day DATE;
	v_day_part TEXT;
	v_current INTEGER;
	v_max_existing INTEGER;
	v_next INTEGER;
	v_union_sql TEXT;
	v_pattern TEXT;
	v_filter TEXT;
BEGIN
	IF prefix IS NULL OR length(trim(prefix)) = 0 THEN
		RAISE EXCEPTION 'prefix is required';
	END IF;

	-- Guard against SQL/regex injection in dynamic SQL
	IF prefix !~ '^[A-Z0-9_]{1,20}$' THEN
		RAISE EXCEPTION 'Invalid prefix: %', prefix;
	END IF;

	v_day := current_date;
	v_day_part := to_char(now(), 'YYYYMMDD');

	-- Ensure counter row exists
	INSERT INTO public.display_id_counters(prefix, day, last_value)
	VALUES (prefix, v_day, 0)
	ON CONFLICT (prefix, day) DO NOTHING;

	-- Lock counter row
	SELECT last_value
		INTO v_current
		FROM public.display_id_counters c
	 WHERE c.prefix = prefix
		 AND c.day = v_day
	 FOR UPDATE;

	-- First use for this prefix today: seed from existing IDs to avoid collisions
	IF v_current = 0 THEN
		v_pattern := '^' || prefix || '-' || v_day_part || '-(\\d{4})$';
		v_filter := '^' || prefix || '-' || v_day_part || '-\\d{4}$';

		SELECT string_agg(
			format(
				$$SELECT MAX((regexp_match(display_id, %L))[1]::int) AS max_id
						FROM %I.%I
					 WHERE display_id ~ %L$$,
				v_pattern,
				c.table_schema,
				c.table_name,
				v_filter
			),
			' UNION ALL '
		)
		INTO v_union_sql
		FROM information_schema.columns c
		JOIN information_schema.tables t
			ON t.table_schema = c.table_schema
		 AND t.table_name = c.table_name
		WHERE c.table_schema = 'public'
			AND c.column_name = 'display_id'
			AND t.table_type = 'BASE TABLE';

		IF v_union_sql IS NOT NULL THEN
			EXECUTE 'SELECT COALESCE(MAX(max_id), 0) FROM (' || v_union_sql || ') s' INTO v_max_existing;
		ELSE
			v_max_existing := 0;
		END IF;

		IF v_max_existing > 0 THEN
			UPDATE public.display_id_counters
				 SET last_value = v_max_existing,
						 updated_at = now()
			 WHERE display_id_counters.prefix = prefix
				 AND display_id_counters.day = v_day;
		END IF;
	END IF;

	UPDATE public.display_id_counters
		 SET last_value = last_value + 1,
				 updated_at = now()
	 WHERE display_id_counters.prefix = prefix
		 AND display_id_counters.day = v_day
	 RETURNING last_value INTO v_next;

	RETURN prefix || '-' || v_day_part || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- Convenience overload for callers that only pass prefix
CREATE OR REPLACE FUNCTION public.generate_display_id(prefix TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
	SELECT public.generate_display_id(prefix, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.generate_display_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_display_id(TEXT, TEXT) TO authenticated;
