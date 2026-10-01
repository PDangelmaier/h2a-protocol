-- SPEC-041: Enable RLS on all remaining public tables.
-- Tables from migrations 011-028 that were not covered by 016_rls_policies.sql.
-- With RLS enabled and no policies, anon and authenticated get zero access.
-- service_role bypasses RLS (Supabase default).

ALTER TABLE ccp_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccp_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccp_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_gate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE degradation_config ENABLE ROW LEVEL SECURITY;

-- Revoke EXECUTE on functions from anon and authenticated
REVOKE EXECUTE ON FUNCTION increment_session_cost(TEXT, NUMERIC, BIGINT) FROM anon, authenticated;

-- Revoke SELECT on views from anon and authenticated
REVOKE SELECT ON session_cost_stats FROM anon, authenticated;
