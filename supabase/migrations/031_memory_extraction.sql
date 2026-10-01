-- SPEC-001: Memory Extraction columns + archive table

ALTER TABLE agent_memories
  ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  ADD COLUMN IF NOT EXISTS source_turn_id UUID REFERENCES conversation_turns(id),
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS agent_memories_archive (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  memory_type memory_type NOT NULL,
  content TEXT NOT NULL,
  importance REAL DEFAULT 0.5,
  confidence REAL DEFAULT 0.5,
  source TEXT DEFAULT 'conversation',
  source_conversation_id UUID REFERENCES conversations(id),
  source_turn_id UUID REFERENCES conversation_turns(id),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  archive_reason TEXT NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_profile ON agent_memories_archive(profile_id);

ALTER TABLE agent_memories_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_archive_service ON agent_memories_archive FOR ALL TO service_role USING (true);
