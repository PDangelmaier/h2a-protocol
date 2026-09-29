CREATE TYPE model_purpose AS ENUM ('main', 'tool-routing', 'memory-extraction', 'evaluation');

CREATE TABLE model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose model_purpose NOT NULL,
  model_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by TEXT,
  eval_score NUMERIC,
  override_reason TEXT,
  cost_per_input_1k NUMERIC,
  cost_per_output_1k NUMERIC,
  cost_per_cached_input_1k NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one active model per purpose
CREATE UNIQUE INDEX uq_model_config_active_purpose
  ON model_config (purpose)
  WHERE is_active = true;

CREATE INDEX idx_model_config_purpose ON model_config (purpose);
