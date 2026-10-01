-- REVIEW-024 G2/G3: Harden function EXECUTE privileges.
-- PostgreSQL grants EXECUTE to PUBLIC by default. The existing REVOKE in
-- 029_rls_all_tables only revoked from anon/authenticated, leaving PUBLIC.
-- Additionally, increment_session_cost must reject negative cost deltas.

-- G2a: Revoke EXECUTE from PUBLIC on all user-defined functions in public
REVOKE EXECUTE ON FUNCTION increment_session_cost(TEXT, NUMERIC, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_updated_at() FROM PUBLIC;

-- G2b: Grant EXECUTE only to service_role (Supabase Edge Functions run as service_role)
GRANT EXECUTE ON FUNCTION increment_session_cost(TEXT, NUMERIC, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION update_updated_at() TO service_role;

-- G2c: Default privileges — future functions in public don't get EXECUTE for PUBLIC
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- G2d: Replace increment_session_cost with CHECK on p_cost_delta >= 0
CREATE OR REPLACE FUNCTION increment_session_cost(
  p_session_id TEXT,
  p_cost_delta NUMERIC,
  p_input_tokens BIGINT DEFAULT 0
) RETURNS TABLE(cost_usd NUMERIC, nexus_call_count INTEGER, input_tokens_total BIGINT) AS $$
BEGIN
  IF p_cost_delta < 0 THEN
    RAISE EXCEPTION 'p_cost_delta must be >= 0, got %', p_cost_delta;
  END IF;
  RETURN QUERY
  UPDATE sessions
  SET cost_usd = sessions.cost_usd + p_cost_delta,
      nexus_call_count = sessions.nexus_call_count + 1,
      input_tokens_total = sessions.input_tokens_total + p_input_tokens
  WHERE h2a_session_id = p_session_id
  RETURNING sessions.cost_usd, sessions.nexus_call_count, sessions.input_tokens_total;
END;
$$ LANGUAGE plpgsql;
