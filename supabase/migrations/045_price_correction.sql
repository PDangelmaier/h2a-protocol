-- SPEC-045 AC-2: Price correction — all active rows carry exactly 1.3× AWS list price.
-- Source: https://aws.amazon.com/bedrock/pricing/ (2026-10-03)
-- Reference: docs/model-list-prices.md

-- Add metadata columns
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS pricing_source TEXT;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS pricing_date DATE;

-- Sonnet 4.6: List 3/15/0.30 per 1M → 0.003/0.015/0.0003 per 1K → ×1.3 = 0.0039/0.0195/0.00039
UPDATE model_config
SET cost_per_input_1k      = 0.0039,
    cost_per_output_1k     = 0.0195,
    cost_per_cached_input_1k = 0.00039,
    pricing_source         = 'https://aws.amazon.com/bedrock/pricing/',
    pricing_date           = '2026-10-03'
WHERE model_id = 'claude-sonnet-4-6' AND is_active = true;

-- Haiku 4.5: List 1/5/0.10 per 1M → 0.001/0.005/0.0001 per 1K → ×1.3 = 0.0013/0.0065/0.00013
UPDATE model_config
SET cost_per_input_1k      = 0.0013,
    cost_per_output_1k     = 0.0065,
    cost_per_cached_input_1k = 0.00013,
    pricing_source         = 'https://aws.amazon.com/bedrock/pricing/',
    pricing_date           = '2026-10-03'
WHERE model_id = 'claude-haiku-4-5' AND is_active = true;
