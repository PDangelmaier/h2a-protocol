-- SPEC-027: Turn classifier config and fast model row
-- Requires 038_fast_routing_enum (enum value must be committed first)

INSERT INTO cost_gate_config (key, value)
VALUES ('fast_routing_enabled', 0)
ON CONFLICT (key) DO NOTHING;

INSERT INTO model_config (purpose, model_id, is_active, fallback_priority, cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k)
VALUES ('fast', 'claude-haiku-4-5', true, 1, 0.0008, 0.004, 0.0001)
ON CONFLICT DO NOTHING;
