-- SPEC-005 v3: Populate model_config pricing (Fallback 1.3 × AWS list).
-- Source: AWS Bedrock On-Demand Pricing, 2026-10-01
-- https://aws.amazon.com/bedrock/pricing/
-- Markup: 1.3× (conservative estimate per SPEC-005 Kontext)
-- Prices in USD per 1,000 tokens.

UPDATE model_config
SET
  cost_per_input_1k      = 0.0039,
  cost_per_output_1k     = 0.0195,
  cost_per_cached_input_1k = 0.00039
WHERE model_id = 'claude-sonnet-4-6';

UPDATE model_config
SET
  cost_per_input_1k      = 0.00104,
  cost_per_output_1k     = 0.0052,
  cost_per_cached_input_1k = 0.000104
WHERE model_id = 'claude-haiku-4-5';
