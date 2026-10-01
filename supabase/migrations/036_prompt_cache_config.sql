-- SPEC-020: Prompt cache toggle (default off).
INSERT INTO cost_gate_config (key, value)
VALUES ('prompt_cache_enabled', 0)
ON CONFLICT (key) DO NOTHING;
