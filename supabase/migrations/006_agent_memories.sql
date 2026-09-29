CREATE TYPE memory_type AS ENUM ('fact', 'preference', 'context', 'relationship', 'decision');

CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  memory_type memory_type NOT NULL,
  content TEXT NOT NULL,
  importance REAL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  source TEXT DEFAULT 'conversation',
  source_conversation_id UUID REFERENCES conversations(id),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memories_profile ON agent_memories(profile_id);
CREATE INDEX idx_memories_importance ON agent_memories(profile_id, importance DESC);
