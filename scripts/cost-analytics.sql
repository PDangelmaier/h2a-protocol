-- SPEC-006 AC-7: Cost analytics queries
-- Run against Supabase SQL editor or psql

-- Average cost per session (using the view)
SELECT * FROM session_cost_stats;

-- Per-session breakdown
SELECT
  h2a_session_id,
  nexus_call_count,
  round(cost_usd, 6) AS cost_usd,
  round(cost_usd * (SELECT value FROM cost_gate_config WHERE key = 'usd_eur_rate'), 6) AS cost_eur,
  created_at
FROM sessions
WHERE nexus_call_count > 0
ORDER BY cost_usd DESC
LIMIT 50;

-- Current config
SELECT * FROM cost_gate_config;
