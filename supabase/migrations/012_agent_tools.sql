CREATE TYPE endpoint_type AS ENUM ('agent_garden', 'mcp', 'rest', 'n8n');

CREATE TABLE agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  endpoint_type endpoint_type NOT NULL,
  endpoint_url TEXT NOT NULL,
  massp4ai_id TEXT, -- for Agent Garden
  input_schema JSONB NOT NULL,
  requires_consent TEXT[], -- consent types needed
  allowed_channels channel_type[],
  min_pid_score INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
