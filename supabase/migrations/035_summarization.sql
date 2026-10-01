-- SPEC-008: Conversation Summarization und hartes Token-Budget

-- Seed summarization model (Haiku — cheap, fast)
INSERT INTO model_config (purpose, model_id, is_active, activated_at, activated_by, override_reason,
                          cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k, fallback_priority)
SELECT 'summarization'::model_purpose, 'claude-haiku-4-5', true, now(), 'migration-035',
       'SPEC-008 E-008: Haiku for summarization', 0.00104, 0.0052, 0.000104, 1
WHERE NOT EXISTS (
  SELECT 1 FROM model_config WHERE purpose = 'summarization' AND is_active = true
);

-- Summaries per session
CREATE TABLE conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  turn_range_start INTEGER NOT NULL,
  turn_range_end INTEGER NOT NULL,
  model_used TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_summaries_session ON conversation_summaries(session_id, created_at DESC);

-- RLS (SPEC-041)
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON conversation_summaries
  FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');
