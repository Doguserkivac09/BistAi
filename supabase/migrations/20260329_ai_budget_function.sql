-- Atomic AI Budget Increment Function
-- Fixes race condition in lib/ai-budget.ts (B2)
--
-- Problem: in-memory dailyCount + fire-and-forget upsert → concurrent requests
--          can both pass the limit check before either increments.
--
-- Solution: single atomic PL/pgSQL function that:
--   1. Tries UPDATE where hit_count < p_limit (atomic — only one winner per row lock)
--   2. Falls back to INSERT for first request of the day
--   3. Returns (new_count, allowed) so the caller can act immediately

CREATE OR REPLACE FUNCTION increment_ai_budget(
  p_key        text,
  p_limit      int,
  p_expires_at timestamptz
)
RETURNS TABLE(new_count int, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  -- Step 1: Atomically increment if the row exists AND is under the limit.
  -- PostgreSQL row-level locking ensures only one concurrent UPDATE wins per key.
  UPDATE public.ai_cache
  SET hit_count = hit_count + 1
  WHERE cache_key = p_key
    AND hit_count < p_limit
  RETURNING hit_count INTO v_count;

  IF v_count IS NOT NULL THEN
    -- Row existed and was under limit — increment succeeded.
    RETURN QUERY SELECT v_count, true;
    RETURN;
  END IF;

  -- Step 2: No UPDATE rows affected.
  -- Either the row doesn't exist yet (first request today) or hit_count >= limit.
  -- Try INSERT for the "first request" case.
  BEGIN
    INSERT INTO public.ai_cache (cache_key, explanation, version, hit_count, expires_at)
    VALUES (p_key, 'budget_counter', 0, 1, p_expires_at)
    RETURNING hit_count INTO v_count;

    -- INSERT succeeded → first request of the day, allowed.
    RETURN QUERY SELECT v_count, true;

  EXCEPTION WHEN unique_violation THEN
    -- Row already exists (concurrent insert or existing row at limit).
    -- The earlier UPDATE found no row to update → hit_count >= limit.
    SELECT hit_count INTO v_count FROM public.ai_cache WHERE cache_key = p_key;
    RETURN QUERY SELECT COALESCE(v_count, p_limit), false;
  END;
END;
$$;
