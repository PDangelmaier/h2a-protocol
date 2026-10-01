-- SPEC-024: Model-Fallback-Chain
-- Add fallback_priority to model_config. Priority 1 = primary, 2 = first fallback, 3 = max.
-- Replace the old unique index (one active per purpose) with (purpose, fallback_priority).

ALTER TABLE model_config
  ADD COLUMN fallback_priority SMALLINT NOT NULL DEFAULT 1;

-- Backfill existing active rows to priority 1 (already the default)

DROP INDEX IF EXISTS uq_model_config_active_purpose;

CREATE UNIQUE INDEX uq_model_config_active_purpose_priority
  ON model_config (purpose, fallback_priority)
  WHERE is_active = true;

-- Constraint: max 3 fallbacks per purpose
ALTER TABLE model_config
  ADD CONSTRAINT chk_fallback_priority CHECK (fallback_priority BETWEEN 1 AND 3);

-- Seed fallback models for 'main' purpose (priority 2 and 3)
INSERT INTO model_config (purpose, model_id, is_active, activated_at, activated_by, override_reason, fallback_priority, cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k)
SELECT v.purpose, v.model_id, true, now(), 'migration-026', v.reason, v.priority, v.cost_in, v.cost_out, v.cost_cached
FROM (
  VALUES
    ('main'::model_purpose, 'claude-sonnet-4-6', 'Fallback 2 — same family, different instance', 2::SMALLINT, 0.003::NUMERIC, 0.015::NUMERIC, 0.00075::NUMERIC),
    ('main'::model_purpose, 'claude-haiku-4-5',  'Fallback 3 — fast, cheap degradation', 3::SMALLINT, 0.001::NUMERIC, 0.005::NUMERIC, 0.0005::NUMERIC)
) AS v(purpose, model_id, reason, priority, cost_in, cost_out, cost_cached)
WHERE NOT EXISTS (
  SELECT 1 FROM model_config mc
  WHERE mc.purpose = v.purpose AND mc.is_active = true AND mc.fallback_priority = v.priority
);
