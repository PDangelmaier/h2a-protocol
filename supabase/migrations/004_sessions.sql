CREATE TYPE session_status AS ENUM ('active', 'paused', 'ended', 'transferred');
CREATE TYPE channel_type AS ENUM ('web', 'smart_storefront', 'whatsapp', 'mbux', 'voice', 'app', 'dealer');
CREATE TYPE presence_state AS ENUM ('rest', 'attentive', 'conversing', 'orchestrating');
CREATE TYPE journey_phase AS ENUM ('awareness', 'research', 'configuration', 'pricing', 'purchase', 'order', 'onboarding', 'ownership', 'service', 'lifecycle');

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h2a_session_id TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer_profiles(id),
  channel channel_type NOT NULL,
  channel_metadata JSONB DEFAULT '{}',
  status session_status DEFAULT 'active',
  presence_state presence_state DEFAULT 'attentive',
  journey_phase journey_phase DEFAULT 'awareness',
  intent_score INTEGER DEFAULT 0,
  active_personality_id UUID,
  conformance_level TEXT DEFAULT 'standard',
  resumed_from UUID REFERENCES sessions(id),
  pause_reason TEXT,
  paused_at TIMESTAMPTZ,
  transfer_target TEXT,
  transfer_reason TEXT,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_customer ON sessions(customer_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_h2a ON sessions(h2a_session_id);
CREATE INDEX idx_sessions_active ON sessions(customer_id, status) WHERE status = 'active';
