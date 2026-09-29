-- REVIEW-001/M2: Initial model pins as migration (not just seed).
-- Ensures every environment has pins after deploy, not only after local db reset.
-- SHORT-FORM IDs only (Nexus-konform).
-- Idempotent: skips if rows already exist for a purpose.

INSERT INTO model_config (purpose, model_id, is_active, activated_at, activated_by, override_reason)
SELECT v.purpose, v.model_id, true, now(), 'migration-020', v.reason
FROM (
  VALUES
    ('main'::model_purpose,              'claude-sonnet-4-6', 'Initial pin — Ist-Stand vor SPEC-003'),
    ('tool-routing'::model_purpose,      'claude-sonnet-4-6', 'Initial pin — Ist-Stand vor SPEC-003'),
    ('memory-extraction'::model_purpose, 'claude-haiku-4-5',  'Initial pin per gap analysis K11'),
    ('evaluation'::model_purpose,        'claude-haiku-4-5',  'Initial pin per gap analysis K11')
) AS v(purpose, model_id, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM model_config mc
  WHERE mc.purpose = v.purpose AND mc.is_active = true
);
