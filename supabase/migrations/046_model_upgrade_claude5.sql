-- SPEC-051 AC-2: Upgrade model IDs from Claude 4 to Claude 5 family.
-- claude-sonnet-4-6 → claude-sonnet-5-5
-- claude-haiku-4-5  → claude-haiku-4-5 (latest Haiku remains 4.5)
-- Source: Anthropic model catalog, 2026-10-01
-- Pricing: AWS Bedrock On-Demand × 1.3 markup (same methodology as 024)

-- Update model_config active rows
UPDATE model_config
SET model_id = 'claude-sonnet-5-5',
    override_reason = 'SPEC-051: upgrade to Claude 5 family'
WHERE model_id = 'claude-sonnet-4-6' AND is_active = true;

-- Update model_config inactive rows (historical, for rollback visibility)
UPDATE model_config
SET model_id = 'claude-sonnet-5-5',
    override_reason = 'SPEC-051: upgrade to Claude 5 family'
WHERE model_id = 'claude-sonnet-4-6' AND is_active = false;

-- Update fallback chain
UPDATE model_fallback_chain
SET model_id = 'claude-sonnet-5-5'
WHERE model_id = 'claude-sonnet-4-6';

-- Update pricing for the new model ID
UPDATE model_config
SET cost_per_input_1k      = 0.0039,
    cost_per_output_1k     = 0.0195,
    cost_per_cached_input_1k = 0.00039
WHERE model_id = 'claude-sonnet-5-5';
