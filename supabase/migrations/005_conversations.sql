CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h2a_session_id TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES customer_profiles(id),
  channel channel_type NOT NULL,
  summary TEXT,
  key_topics TEXT[],
  outcome TEXT,
  turn_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content JSONB NOT NULL,
  frame_type TEXT,
  tools_used TEXT[],
  token_count_input INTEGER,
  token_count_output INTEGER,
  model_used TEXT,
  latency_ms INTEGER,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_turns_conversation ON conversation_turns(conversation_id);
CREATE INDEX idx_turns_session ON conversation_turns(session_id);
CREATE INDEX idx_turns_sequence ON conversation_turns(conversation_id, sequence);
