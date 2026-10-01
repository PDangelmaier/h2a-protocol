-- SPEC-006 v3: Cost Gate — session cost tracking + config table.

-- Session cost accumulation columns
ALTER TABLE sessions
  ADD COLUMN cost_usd NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN nexus_call_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN input_tokens_total BIGINT NOT NULL DEFAULT 0;

-- Config table for cost limit + exchange rate (AC-6: no deploy to change)
CREATE TABLE cost_gate_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO cost_gate_config (key, value) VALUES
  ('cost_limit_eur', 0.50),
  ('usd_eur_rate', 0.92);

-- Atomic cost increment function (AC-1: concurrent-safe)
CREATE FUNCTION increment_session_cost(
  p_session_id TEXT,
  p_cost_delta NUMERIC,
  p_input_tokens BIGINT DEFAULT 0
) RETURNS TABLE(cost_usd NUMERIC, nexus_call_count INTEGER, input_tokens_total BIGINT) AS $$
  UPDATE sessions
  SET cost_usd = sessions.cost_usd + p_cost_delta,
      nexus_call_count = sessions.nexus_call_count + 1,
      input_tokens_total = sessions.input_tokens_total + p_input_tokens
  WHERE h2a_session_id = p_session_id
  RETURNING sessions.cost_usd, sessions.nexus_call_count, sessions.input_tokens_total;
$$ LANGUAGE sql;

-- Analytics view (AC-7): average input tokens and cost per session
CREATE VIEW session_cost_stats AS
SELECT
  count(*) AS total_sessions,
  round(avg(cost_usd), 6) AS avg_cost_usd,
  round(avg(nexus_call_count), 1) AS avg_calls,
  round(avg(cost_usd * (SELECT value FROM cost_gate_config WHERE key = 'usd_eur_rate')), 6) AS avg_cost_eur,
  round(avg(input_tokens_total), 0) AS avg_input_tokens
FROM sessions
WHERE nexus_call_count > 0;
