-- GATE-G1 #6: Fallback priority 2 was same model as priority 1 (both claude-sonnet-4-6).
-- Replace priority 2 with claude-haiku-4-5 and shift old priority 3 to priority 2.
-- Result: main chain = sonnet-4-6 (1) → haiku-4-5 (2).

DELETE FROM model_config
WHERE purpose = 'main' AND is_active = true AND fallback_priority = 3;

UPDATE model_config
SET model_id = 'claude-haiku-4-5',
    cost_per_input_1k = 0.001,
    cost_per_output_1k = 0.005,
    cost_per_cached_input_1k = 0.0005,
    override_reason = 'GATE-G1 fix: deduplicated chain'
WHERE purpose = 'main' AND is_active = true AND fallback_priority = 2;
