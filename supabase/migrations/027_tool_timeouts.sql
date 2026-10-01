-- SPEC-018: Per-tool timeout configuration
ALTER TABLE agent_tools ADD COLUMN timeout_seconds SMALLINT NOT NULL DEFAULT 5;

-- Tools with endpoint_type 'agent_garden' get higher default timeout
UPDATE agent_tools SET timeout_seconds = 10 WHERE endpoint_type = 'agent_garden';
