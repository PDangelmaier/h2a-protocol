-- SPEC-010: Tool pruning by journey phase and topic.

-- Journey phases a tool is relevant for; empty = all phases (AC-4 fallback).
ALTER TABLE agent_tools ADD COLUMN allowed_journey_phases TEXT[] DEFAULT '{}';

-- Topic keywords; a tool is relevant when the user message contains any keyword.
-- Empty = tool is not topic-restricted (included unless pruned by phase/channel).
ALTER TABLE agent_tools ADD COLUMN topics TEXT[] DEFAULT '{}';

-- Max tools per Nexus call (AC-2). Stored in cost_gate_config.
INSERT INTO cost_gate_config (key, value)
VALUES ('tool_pruning_max', 8)
ON CONFLICT (key) DO NOTHING;
